// ============================================================
// GWATOP - History Page Logic v1.0.0
// 저장된 퀴즈 및 문서 관리
// ============================================================

import { signInWithGoogle, signInWithKakao, signInWithNaver, logOut, handleRedirectResult, onUserChange, applyAvatar } from './auth.js';
import { checkAndShowNicknameModal } from './nickname.js';
import {
  getAllQuizzes, getAllDocuments,
  deleteQuiz, deleteDocument,
  savePendingQuiz, getDocument,
  getQuizQuestionsFromFirestore,
  getAllScraps, unscrapQuestion
} from './db.js';
import { marked } from 'https://esm.sh/marked@11';

// ─── State ───
let pendingDelete = null; // { type: 'quiz'|'doc', id }
let currentUid = null;
let scrapData = [];
let scrapFilter = 'all';
let selectedScrapIds = new Set();
let allQuizzes = [];
let allDocuments = [];
let selectedQuizIds = new Set();
let selectedDocIds = new Set();
let quizSelectMode = false;
let docSelectMode = false;

// ─── Init ───
async function init() {
  await handleRedirectResult();
  setupNav();
  setupTabs();
  setupDeleteModal();
  setupScrapModals();
  setupLoginModal();
}

// ─── Nav ───
function setupNav() {
  document.getElementById('nav-login-btn')?.addEventListener('click', () => {
    document.getElementById('login-modal')?.classList.add('visible');
  });
  document.getElementById('nav-logout-btn')?.addEventListener('click', () => logOut());

  onUserChange((user, userData) => {
    const lo = document.getElementById('nav-auth-logged-out');
    const li = document.getElementById('nav-auth-logged-in');
    if (user) {
      const prevUid = currentUid;
      currentUid = user.uid;
      lo.style.display = 'none';
      li.style.display = 'flex';
      applyAvatar(document.getElementById('nav-avatar'), user, userData);
      document.getElementById('nav-username').textContent = userData?.nickname || user.displayName || user.email || '';
      const creditsEl = document.getElementById('nav-credits');
      if (creditsEl) creditsEl.textContent = userData?.credits ?? 0;
      if (prevUid !== currentUid) loadAll(currentUid);
      checkAndShowNicknameModal(user, userData);
    } else {
      lo.style.display = '';
      li.style.display = 'none';
      // 퀴즈 목록 비우기
      const grid = document.getElementById('quizzes-grid');
      const empty = document.getElementById('quizzes-empty');
      if (grid) { grid.innerHTML = ''; grid.style.display = 'none'; }
      if (empty) empty.style.display = '';
    }
  });
}

// ─── Tabs ───
function setupTabs() {
  const tabContents = {
    quizzes: 'tab-quizzes-content',
    documents: 'tab-documents-content',
    scrap: 'tab-scrap-content'
  };

  const switchTab = (tabName) => {
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.remove('active', 'btn-glass');
      b.classList.add('btn-ghost');
    });
    const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (activeBtn) { activeBtn.classList.add('active', 'btn-glass'); activeBtn.classList.remove('btn-ghost'); }
    Object.entries(tabContents).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el) el.style.display = key === tabName ? '' : 'none';
    });
  };

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // URL ?tab=scrap 지원
  const urlTab = new URLSearchParams(location.search).get('tab');
  if (urlTab && tabContents[urlTab]) switchTab(urlTab);
}

// ─── Load All ───
async function loadAll(uid) {
  await loadQuizzes(uid);
  await loadDocuments(uid);
  await loadScraps(uid);
}

// ─── Load Quizzes ───
async function loadQuizzes(uid) {
  allQuizzes = await getAllQuizzes(uid);
  selectedQuizIds.clear();
  quizSelectMode = false;
  renderQuizGrid();
}

function renderQuizGrid() {
  const grid = document.getElementById('quizzes-grid');
  const empty = document.getElementById('quizzes-empty');
  const actionBar = document.getElementById('quizzes-action-bar');

  if (allQuizzes.length === 0) {
    grid.style.display = 'none';
    empty.style.display = '';
    if (actionBar) actionBar.style.display = 'none';
    return;
  }

  grid.style.display = '';
  empty.style.display = 'none';
  grid.innerHTML = allQuizzes.map(q => renderQuizCard(q)).join('');

  if (quizSelectMode) {
    grid.querySelectorAll('.history-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = Number(card.dataset.id);
        if (selectedQuizIds.has(id)) selectedQuizIds.delete(id);
        else selectedQuizIds.add(id);
        renderQuizGrid();
      });
    });
  } else {
    grid.querySelectorAll('[data-replay]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await replayQuiz(parseInt(btn.dataset.replay), btn.dataset.firestoreOnly === 'true');
        } catch (e) {
          console.error('replayQuiz error:', e);
          showToast('퀴즈를 불러오는데 실패했습니다.', 'error');
        }
      });
    });
    grid.querySelectorAll('[data-delete-quiz]').forEach(btn => {
      btn.addEventListener('click', () => confirmDelete('quiz', parseInt(btn.dataset.deleteQuiz), `"${btn.dataset.name}" 퀴즈 결과를 삭제합니다.`));
    });
  }
  renderQuizActionBar();
}

function renderQuizActionBar() {
  let bar = document.getElementById('quizzes-action-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'quizzes-action-bar';
    bar.className = 'scrap-action-bar';
    document.getElementById('tab-quizzes-content').appendChild(bar);
  }

  if (allQuizzes.length === 0) { bar.style.display = 'none'; return; }
  bar.style.display = '';

  if (quizSelectMode) {
    const cnt = selectedQuizIds.size;
    bar.className = `scrap-action-bar${cnt > 0 ? ' has-selection' : ''}`;
    bar.innerHTML = cnt > 0
      ? `<span class="scrap-action-info">${cnt}개 선택됨</span>
         <button class="btn btn-danger btn-sm" id="quiz-del-selected">🗑 삭제</button>
         <button class="btn btn-glass btn-sm" id="quiz-select-all-btn">전체 선택</button>
         <button class="btn btn-ghost btn-sm" id="quiz-cancel-select">취소</button>`
      : `<span class="scrap-action-info">삭제할 항목을 선택하세요</span>
         <button class="btn btn-glass btn-sm" id="quiz-select-all-btn">전체 선택</button>
         <button class="btn btn-ghost btn-sm" id="quiz-cancel-select">취소</button>`;
    document.getElementById('quiz-del-selected')?.addEventListener('click', async () => {
      for (const id of selectedQuizIds) await deleteQuiz(id);
      allQuizzes = allQuizzes.filter(q => !selectedQuizIds.has(q.id));
      selectedQuizIds.clear();
      quizSelectMode = false;
      renderQuizGrid();
      showToast('선택한 퀴즈가 삭제됐습니다.', 'success');
    });
    document.getElementById('quiz-select-all-btn')?.addEventListener('click', () => {
      if (selectedQuizIds.size === allQuizzes.length) selectedQuizIds.clear();
      else allQuizzes.forEach(q => selectedQuizIds.add(q.id));
      renderQuizGrid();
    });
    document.getElementById('quiz-cancel-select')?.addEventListener('click', () => {
      selectedQuizIds.clear();
      quizSelectMode = false;
      renderQuizGrid();
    });
  } else {
    bar.className = 'scrap-action-bar';
    bar.innerHTML = `<span class="scrap-action-info">${allQuizzes.length}개의 퀴즈</span>
      <button class="btn btn-glass btn-sm" id="quiz-edit-btn">편집</button>`;
    document.getElementById('quiz-edit-btn')?.addEventListener('click', () => {
      quizSelectMode = true;
      renderQuizGrid();
    });
  }
}

function renderQuizCard(q) {
  const date = new Date(q.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const typeLabels = { mcq: '객관식', short: '주관식', ox: 'OX 퀴즈' };
  const score = q.score != null ? q.score : null;
  const scoreColor = score == null ? 'var(--text-secondary)' : score >= 70 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  const emoji = score == null ? '📝' : score >= 80 ? '🏆' : score >= 60 ? '🎯' : '📚';
  const isSelected = quizSelectMode && selectedQuizIds.has(q.id);

  if (quizSelectMode) {
    return `
      <div class="history-card${isSelected ? ' selected' : ''}" data-id="${q.id}" style="cursor:pointer">
        <div class="scrap-sq-check-mark">✓</div>
        <div class="history-card-icon">${emoji}</div>
        <div class="history-card-title">${escapeHtml(q.docName || '문서')}</div>
        <div class="history-card-meta">
          <span class="history-meta-chip">${typeLabels[q.type] || '퀴즈'}</span>
          <span class="history-meta-chip">${q.totalQuestions || q.questions?.length || 0}문제</span>
          <span class="history-meta-chip">${date}</span>
        </div>
        ${score != null ? `<div class="history-card-score" style="color:${scoreColor}">${score}점</div>` : '<div style="font-size:13px;color:var(--text-muted)">미완료</div>'}
      </div>`;
  }

  return `
    <div class="history-card" data-id="${q.id}">
      <div class="history-card-icon">${emoji}</div>
      <div class="history-card-title">${escapeHtml(q.docName || '문서')}</div>
      <div class="history-card-meta">
        <span class="history-meta-chip">${typeLabels[q.type] || '퀴즈'}</span>
        <span class="history-meta-chip">${q.totalQuestions || q.questions?.length || 0}문제</span>
        <span class="history-meta-chip">${date}</span>
      </div>
      ${score != null ? `<div class="history-card-score" style="color:${scoreColor}">${score}점</div>` : '<div style="font-size:13px;color:var(--text-muted)">미완료</div>'}
      <div class="history-card-actions">
        <button class="btn btn-primary btn-sm" style="flex:1" data-replay="${q.id}" ${q._firestoreOnly ? 'data-firestore-only="true"' : ''}>▶ 다시 풀기</button>
        <button class="btn btn-danger btn-sm" data-delete-quiz="${q.id}" data-name="${escapeAttr(q.docName || '문서')}">
          🗑
        </button>
      </div>
    </div>
  `;
}

// ─── Load Documents ───
async function loadDocuments(uid) {
  allDocuments = await getAllDocuments(uid);
  selectedDocIds.clear();
  docSelectMode = false;
  renderDocGrid();
}

function renderDocGrid() {
  const grid = document.getElementById('documents-grid');
  const empty = document.getElementById('documents-empty');
  const actionBar = document.getElementById('documents-action-bar');

  if (allDocuments.length === 0) {
    grid.style.display = 'none';
    empty.style.display = '';
    if (actionBar) actionBar.style.display = 'none';
    return;
  }

  grid.style.display = '';
  empty.style.display = 'none';
  grid.innerHTML = allDocuments.map(d => renderDocCard(d)).join('');

  if (docSelectMode) {
    grid.querySelectorAll('.history-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = Number(card.dataset.id);
        if (selectedDocIds.has(id)) selectedDocIds.delete(id);
        else selectedDocIds.add(id);
        renderDocGrid();
      });
    });
  } else {
    grid.querySelectorAll('[data-delete-doc]').forEach(btn => {
      btn.addEventListener('click', () => confirmDelete('doc', parseInt(btn.dataset.deleteDoc), `"${btn.dataset.name}" 문서와 관련된 모든 퀴즈를 삭제합니다.`));
    });
    grid.querySelectorAll('[data-new-quiz]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const doc = await getDocument(parseInt(btn.dataset.newQuiz));
        if (!doc) { showToast('문서를 불러올 수 없습니다.', 'error'); return; }
        sessionStorage.setItem('gwatop_preload_doc', JSON.stringify({ id: doc.id, name: doc.name, text: doc.text, fileSize: doc.fileSize || 0 }));
        window.location.href = '/create.html';
      });
    });
  }
  renderDocActionBar();
}

function renderDocActionBar() {
  let bar = document.getElementById('documents-action-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'documents-action-bar';
    bar.className = 'scrap-action-bar';
    document.getElementById('tab-documents-content').appendChild(bar);
  }

  if (allDocuments.length === 0) { bar.style.display = 'none'; return; }
  bar.style.display = '';

  if (docSelectMode) {
    const cnt = selectedDocIds.size;
    bar.className = `scrap-action-bar${cnt > 0 ? ' has-selection' : ''}`;
    bar.innerHTML = cnt > 0
      ? `<span class="scrap-action-info">${cnt}개 선택됨</span>
         <button class="btn btn-danger btn-sm" id="doc-del-selected">🗑 삭제</button>
         <button class="btn btn-glass btn-sm" id="doc-select-all-btn">전체 선택</button>
         <button class="btn btn-ghost btn-sm" id="doc-cancel-select">취소</button>`
      : `<span class="scrap-action-info">삭제할 항목을 선택하세요</span>
         <button class="btn btn-glass btn-sm" id="doc-select-all-btn">전체 선택</button>
         <button class="btn btn-ghost btn-sm" id="doc-cancel-select">취소</button>`;
    document.getElementById('doc-del-selected')?.addEventListener('click', async () => {
      for (const id of selectedDocIds) await deleteDocument(id);
      allDocuments = allDocuments.filter(d => !selectedDocIds.has(d.id));
      selectedDocIds.clear();
      docSelectMode = false;
      renderDocGrid();
      showToast('선택한 문서가 삭제됐습니다.', 'success');
    });
    document.getElementById('doc-select-all-btn')?.addEventListener('click', () => {
      if (selectedDocIds.size === allDocuments.length) selectedDocIds.clear();
      else allDocuments.forEach(d => selectedDocIds.add(d.id));
      renderDocGrid();
    });
    document.getElementById('doc-cancel-select')?.addEventListener('click', () => {
      selectedDocIds.clear();
      docSelectMode = false;
      renderDocGrid();
    });
  } else {
    bar.className = 'scrap-action-bar';
    bar.innerHTML = `<span class="scrap-action-info">${allDocuments.length}개의 문서</span>
      <button class="btn btn-glass btn-sm" id="doc-edit-btn">편집</button>`;
    document.getElementById('doc-edit-btn')?.addEventListener('click', () => {
      docSelectMode = true;
      renderDocGrid();
    });
  }
}

function renderDocCard(d) {
  const date = new Date(d.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const size = formatSize(d.fileSize || 0);
  const previewText = (d.text || '').slice(0, 120).replace(/\s+/g, ' ') + '...';
  const isSelected = docSelectMode && selectedDocIds.has(d.id);

  if (docSelectMode) {
    return `
      <div class="history-card${isSelected ? ' selected' : ''}" data-id="${d.id}" style="cursor:pointer">
        <div class="scrap-sq-check-mark">✓</div>
        <div class="history-card-icon">📄</div>
        <div class="history-card-title">${escapeHtml(d.name || '문서')}</div>
        <div class="history-card-meta">
          <span class="history-meta-chip">${size}</span>
          <span class="history-meta-chip">${date}</span>
        </div>
      </div>`;
  }

  return `
    <div class="history-card" data-id="${d.id}">
      <div class="history-card-icon">📄</div>
      <div class="history-card-title">${escapeHtml(d.name || '문서')}</div>
      <div class="history-card-meta">
        <span class="history-meta-chip">${size}</span>
        <span class="history-meta-chip">${date}</span>
      </div>
      <p style="font-size:13px;color:var(--text-muted);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
        ${escapeHtml(previewText)}
      </p>
      <div class="history-card-actions">
        <button class="btn btn-glass btn-sm" style="flex:1" data-new-quiz="${d.id}">
          ✨ 새 퀴즈 만들기
        </button>
        <button class="btn btn-danger btn-sm" data-delete-doc="${d.id}" data-name="${escapeAttr(d.name || '문서')}">
          🗑
        </button>
      </div>
    </div>
  `;
}

// ─── Scrap ───
async function loadScraps(uid) {
  scrapData = await getAllScraps(uid);
  renderScrapFilter();
  renderScrapList();
}

function getScrapFiltered() {
  return scrapFilter === 'all' ? scrapData : scrapData.filter(s => s.docName === scrapFilter);
}

function renderScrapFilter() {
  const bar = document.getElementById('scrap-filter-bar');
  if (!bar) return;
  const docNames = [...new Set(scrapData.map(s => s.docName).filter(Boolean))];
  const filters = [{ key: 'all', label: '📚 전체' }, ...docNames.map(d => ({ key: d, label: '📄 ' + truncate(d, 16) }))];
  bar.innerHTML = filters.map(f => `
    <button class="btn btn-sm ${scrapFilter === f.key ? 'btn-primary' : 'btn-glass'}" data-filter="${escapeAttr(f.key)}">
      ${escapeHtml(f.label)}
    </button>
  `).join('');
  bar.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      scrapFilter = btn.dataset.filter;
      renderScrapFilter();
      renderScrapList();
    });
  });
}

function renderScrapList() {
  const list = document.getElementById('scrap-list');
  const emptyMsg = document.getElementById('scrap-empty-msg');
  const actionBar = document.getElementById('scrap-action-bar');
  if (!list) return;

  if (scrapData.length === 0) {
    list.innerHTML = '';
    if (actionBar) actionBar.style.display = 'none';
    if (emptyMsg) emptyMsg.style.display = '';
    return;
  }

  if (emptyMsg) emptyMsg.style.display = 'none';
  renderScrapGrid();
  renderScrapActionBar();
}

function renderScrapGrid() {
  const list = document.getElementById('scrap-list');
  if (!list) return;
  const filtered = getScrapFiltered();
  const typeLabels = { mcq: '객관식', short: '주관식', ox: 'OX' };

  list.innerHTML = `<div class="scrap-sq-grid">${filtered.map(s => {
    const stem = stripMarkdown(s.question);
    const isSelected = selectedScrapIds.has(s.id);
    return `
      <div class="scrap-sq-card${isSelected ? ' selected' : ''}" data-scrap-id="${s.id}">
        <div class="scrap-sq-check-mark">✓</div>
        <button class="scrap-sq-view" title="상세 보기" data-view-id="${s.id}">👁</button>
        <span class="scrap-sq-badge">${typeLabels[s.type] || '문제'}</span>
        <div class="scrap-sq-q">${escapeHtml(stem)}</div>
        ${s.docName ? `<div class="scrap-sq-footer">📄 ${escapeHtml(truncate(s.docName, 20))}</div>` : ''}
      </div>
    `;
  }).join('')}</div>`;

  // 카드 클릭 → 선택/해제
  list.querySelectorAll('.scrap-sq-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.scrap-sq-view')) return;
      const id = Number(card.dataset.scrapId);
      if (selectedScrapIds.has(id)) selectedScrapIds.delete(id);
      else selectedScrapIds.add(id);
      renderScrapGrid();
      renderScrapActionBar();
    });
  });

  // 👁 버튼 → 상세 모달
  list.querySelectorAll('.scrap-sq-view').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.viewId);
      const s = scrapData.find(x => x.id === id);
      if (s) openScrapViewModal(s);
    });
  });
}

function renderScrapActionBar() {
  const bar = document.getElementById('scrap-action-bar');
  if (!bar) return;
  const filtered = getScrapFiltered();
  const selCount = selectedScrapIds.size;

  bar.style.display = '';
  bar.className = `scrap-action-bar${selCount > 0 ? ' has-selection' : ''}`;

  if (selCount > 0) {
    bar.innerHTML = `
      <span class="scrap-action-info">${selCount}개 선택됨</span>
      <button class="btn btn-primary btn-sm" id="sa-retry">⚡ 다시 풀기</button>
      <button class="btn btn-danger btn-sm" id="sa-delete">🗑 삭제</button>
      <button class="btn btn-ghost btn-sm" id="sa-deselect">선택 해제</button>
    `;
    document.getElementById('sa-retry')?.addEventListener('click', startScrapQuiz);
    document.getElementById('sa-delete')?.addEventListener('click', () => {
      document.getElementById('scrap-clear-modal')?.classList.add('visible');
    });
    document.getElementById('sa-deselect')?.addEventListener('click', () => {
      selectedScrapIds.clear();
      renderScrapGrid();
      renderScrapActionBar();
    });
  } else {
    bar.innerHTML = `
      <span class="scrap-action-info">${filtered.length}개의 스크랩 문제</span>
      <button class="btn btn-primary btn-sm" id="sa-retry-all">⚡ 전체 다시 풀기</button>
      <button class="btn btn-glass btn-sm" id="sa-select-all">전체 선택</button>
      <button class="btn btn-danger btn-sm" id="sa-clear-all">전체 삭제</button>
    `;
    document.getElementById('sa-retry-all')?.addEventListener('click', startScrapQuiz);
    document.getElementById('sa-select-all')?.addEventListener('click', () => {
      filtered.forEach(s => selectedScrapIds.add(s.id));
      renderScrapGrid();
      renderScrapActionBar();
    });
    document.getElementById('sa-clear-all')?.addEventListener('click', () => {
      document.getElementById('scrap-clear-modal')?.classList.add('visible');
    });
  }
}

async function deleteSelectedScraps() {
  for (const id of selectedScrapIds) await unscrapQuestion(id);
  scrapData = scrapData.filter(s => !selectedScrapIds.has(s.id));
  selectedScrapIds.clear();
  renderScrapFilter();
  renderScrapList();
  showToast('선택한 스크랩이 삭제됐습니다.', 'success');
}

let _scrapViewId = null;

function openScrapViewModal(s) {
  _scrapViewId = s.id;
  const typeLabels = { mcq: '📝 객관식', short: '✏️ 주관식', ox: '⭕ OX' };

  // 뱃지
  const badges = document.getElementById('scrap-modal-badges');
  if (badges) {
    badges.innerHTML = `
      <span class="history-meta-chip">${typeLabels[s.type] || '📝'}</span>
      ${s.docName ? `<span class="history-meta-chip">📄 ${escapeHtml(truncate(s.docName, 24))}</span>` : ''}
    `;
  }

  // 문제
  const qEl = document.getElementById('scrap-modal-q');
  if (qEl) qEl.innerHTML = marked.parse(s.question);

  // 선지
  const optsEl = document.getElementById('scrap-modal-options');
  if (optsEl) {
    if (s.type === 'mcq' && s.options?.length) {
      optsEl.style.display = '';
      optsEl.innerHTML = s.options.map((opt, oi) => {
        const marker = opt.match(/^[①②③④⑤]/) ? opt[0] : String.fromCharCode(9312 + oi);
        const text = opt.replace(/^[①②③④⑤]\s*/, '').trim();
        return `<div class="scrap-modal-option">${escapeHtml(marker)} ${escapeHtml(text)}</div>`;
      }).join('');
    } else {
      optsEl.style.display = 'none';
      optsEl.innerHTML = '';
    }
  }

  // 정답
  const ansEl = document.getElementById('scrap-modal-answer');
  if (ansEl) ansEl.textContent = `✅ 정답: ${s.answer}`;

  // 해설
  const explEl = document.getElementById('scrap-modal-expl');
  if (explEl) {
    if (s.explanation) {
      explEl.style.display = '';
      explEl.innerHTML = `<div style="font-size:11px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">📖 해설</div>` + formatExplanation(s.explanation);
    } else {
      explEl.style.display = 'none';
    }
  }

  document.getElementById('scrap-view-modal')?.classList.add('visible');
}

function setupScrapModals() {
  const viewModal = document.getElementById('scrap-view-modal');
  const retryModal = document.getElementById('scrap-retry-modal');
  const clearModal = document.getElementById('scrap-clear-modal');

  // 상세 모달
  document.getElementById('scrap-modal-close-btn')?.addEventListener('click', () => {
    viewModal?.classList.remove('visible');
  });
  viewModal?.addEventListener('click', (e) => { if (e.target === viewModal) viewModal.classList.remove('visible'); });
  document.getElementById('scrap-modal-remove-btn')?.addEventListener('click', async () => {
    if (!_scrapViewId) return;
    await unscrapQuestion(_scrapViewId);
    scrapData = scrapData.filter(s => s.id !== _scrapViewId);
    _scrapViewId = null;
    viewModal?.classList.remove('visible');
    renderScrapFilter();
    renderScrapList();
    showToast('스크랩이 해제됐습니다.', 'success');
  });

  // 전체 삭제 버튼 (항상 하단에 고정)
  document.getElementById('scrap-clear-btn')?.addEventListener('click', () => {
    clearModal?.classList.add('visible');
  });
  document.getElementById('scrap-clear-confirm-btn')?.addEventListener('click', async () => {
    clearModal?.classList.remove('visible');
    if (selectedScrapIds.size > 0) {
      for (const id of selectedScrapIds) await unscrapQuestion(id);
      scrapData = scrapData.filter(s => !selectedScrapIds.has(s.id));
      selectedScrapIds.clear();
      showToast('선택한 스크랩이 삭제됐습니다.', 'success');
    } else {
      for (const s of scrapData) await unscrapQuestion(s.id);
      scrapData = [];
      scrapFilter = 'all';
      showToast('전체 스크랩이 삭제됐습니다.', 'success');
    }
    renderScrapFilter();
    renderScrapList();
  });
  document.getElementById('scrap-clear-cancel-btn')?.addEventListener('click', () => {
    clearModal?.classList.remove('visible');
  });
  clearModal?.addEventListener('click', (e) => { if (e.target === clearModal) clearModal.classList.remove('visible'); });
}

function startScrapQuiz() {
  const base = selectedScrapIds.size > 0
    ? scrapData.filter(s => selectedScrapIds.has(s.id))
    : getScrapFiltered();
  if (!base.length) return;
  const questions = base.map(s => ({
    question: s.question,
    type: s.type,
    options: s.options || [],
    answer: s.answer,
    explanation: s.explanation || ''
  })).sort(() => Math.random() - 0.5);
  savePendingQuiz({
    uid: currentUid || '',
    docId: null,
    docName: selectedScrapIds.size > 0 ? `스크랩 선택 ${base.length}문제` : (scrapFilter === 'all' ? '스크랩 문제 모음' : scrapFilter),
    type: 'mixed',
    questions
  });
  window.location.href = '/quiz.html';
}

function formatExplanation(text) {
  if (!text) return '';
  const spaced = text.replace(/([^\n])(①|②|③|④)/g, '$1\n\n$2');
  return marked.parse(spaced);
}

function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/[#*_`~>[\]]/g, '')
    .replace(/\|.*\|/g, '[표]')
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, 120) + (text.length > 120 ? '...' : '');
}

function truncate(str, max) {
  return str?.length > max ? str.slice(0, max) + '...' : (str || '');
}

// ─── Replay Quiz ───
async function replayQuiz(quizId, firestoreOnly = false) {
  if (firestoreOnly) {
    // 다른 기기에서 생성된 퀴즈: Firestore에서 문제 데이터 로드
    showToast('퀴즈 데이터를 불러오는 중...', 'warning');
    const data = await getQuizQuestionsFromFirestore(currentUid, quizId);
    if (!data || !data.questions?.length) {
      showToast('퀴즈 데이터를 불러올 수 없습니다.', 'error'); return;
    }
    savePendingQuiz({ docName: data.docName, questions: data.questions, type: data.type });
    window.location.href = '/quiz.html';
    return;
  }

  const { getQuiz } = await import('./db.js');
  const quiz = await getQuiz(quizId);
  if (!quiz || !quiz.questions?.length) {
    showToast('퀴즈 데이터를 불러올 수 없습니다.', 'error'); return;
  }
  savePendingQuiz({
    docId: quiz.docId,
    docName: quiz.docName,
    questions: quiz.questions,
    type: quiz.type
  });
  window.location.href = '/quiz.html';
}

// ─── Delete Modal ───
function setupDeleteModal() {
  const modal = document.getElementById('delete-modal');
  document.getElementById('delete-confirm-btn')?.addEventListener('click', async () => {
    if (!pendingDelete) return;
    modal.classList.remove('visible');
    if (pendingDelete.type === 'quiz') {
      await deleteQuiz(pendingDelete.id);
      showToast('퀴즈 결과가 삭제되었습니다.', 'success');
    } else {
      await deleteDocument(pendingDelete.id);
      showToast('문서가 삭제되었습니다.', 'success');
    }
    pendingDelete = null;
    await loadAll(currentUid);
  });
  document.getElementById('delete-cancel-btn')?.addEventListener('click', () => {
    modal.classList.remove('visible');
    pendingDelete = null;
  });
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) { modal.classList.remove('visible'); pendingDelete = null; }
  });
}

function setupLoginModal() {
  const modal = document.getElementById('login-modal');
  const close = () => modal?.classList.remove('visible');
  document.getElementById('modal-login-google')?.addEventListener('click', () => { close(); signInWithGoogle(); });
  document.getElementById('modal-login-kakao')?.addEventListener('click', () => { close(); signInWithKakao(); });
  document.getElementById('modal-login-naver')?.addEventListener('click', () => { close(); signInWithNaver(); });
  document.getElementById('modal-close-btn')?.addEventListener('click', close);
  modal?.addEventListener('click', (e) => { if (e.target === modal) close(); });
}

function confirmDelete(type, id, desc) {
  pendingDelete = { type, id };
  document.getElementById('delete-modal-desc').textContent = desc;
  document.getElementById('delete-modal').classList.add('visible');
}

// ─── Toast ───
function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success: '✅', error: '❌', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || '💬'}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 300); }, 3500);
}

// ─── Utils ───
function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escapeAttr(str) {
  return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

init();
