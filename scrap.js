// ============================================================
// GWATOP - Scrap Page Logic
// 스크랩한 문제 목록, 삭제, 다시 풀기
// ============================================================

import { onUserChange } from './auth.js';
import { getAllScraps, unscrapQuestion, savePendingQuiz } from './db.js';
import { marked } from 'https://esm.sh/marked@11';

let currentUser = null;
let scraps = [];
let activeFilter = 'all';

// ─── Init ───
async function init() {
  onUserChange(async (user) => {
    currentUser = user;
    updateNav(user);
    if (!user) {
      showArea('login-required');
      return;
    }
    showArea('loading');
    scraps = await getAllScraps(user.uid);
    renderScraps();
  });

  document.getElementById('login-btn')?.addEventListener('click', () => {
    document.getElementById('login-modal').classList.add('visible');
  });
  document.getElementById('retry-all-btn')?.addEventListener('click', () => {
    if (!scraps.length) return;
    const filtered = getFiltered();
    document.getElementById('retry-modal-desc').textContent =
      `${filtered.length}개 문제로 퀴즈를 시작합니다.`;
    document.getElementById('retry-modal').classList.add('visible');
  });
  document.getElementById('retry-confirm-btn')?.addEventListener('click', startQuiz);
  document.getElementById('retry-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('retry-modal').classList.remove('visible');
  });
  document.getElementById('clear-all-btn')?.addEventListener('click', () => {
    document.getElementById('clear-modal').classList.add('visible');
  });
  document.getElementById('clear-confirm-btn')?.addEventListener('click', clearAll);
  document.getElementById('clear-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('clear-modal').classList.remove('visible');
  });

  // 모달 닫기
  ['retry-modal', 'clear-modal', 'login-modal'].forEach(id => {
    const el = document.getElementById(id);
    el?.addEventListener('click', (e) => { if (e.target === el) el.classList.remove('visible'); });
  });
  document.getElementById('modal-close-btn')?.addEventListener('click', () => {
    document.getElementById('login-modal').classList.remove('visible');
  });
}

// ─── 필터 ───
function getFiltered() {
  if (activeFilter === 'all') return scraps;
  return scraps.filter(s => s.docName === activeFilter);
}

function renderFilterBar() {
  const bar = document.getElementById('filter-bar');
  if (!bar) return;
  const docNames = [...new Set(scraps.map(s => s.docName).filter(Boolean))];
  const filters = [{ key: 'all', label: '전체' }, ...docNames.map(d => ({ key: d, label: d }))];
  bar.innerHTML = filters.map(f => `
    <button class="btn btn-sm ${activeFilter === f.key ? 'btn-primary' : 'btn-glass'}" data-filter="${f.key}">
      ${f.key === 'all' ? '📚 전체' : '📄 ' + truncate(f.label, 20)}
    </button>
  `).join('');
  bar.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      renderFilterBar();
      renderGrid();
    });
  });
}

// ─── 렌더링 ───
function renderScraps() {
  if (!scraps.length) {
    showArea('empty');
    return;
  }
  showArea('content');
  renderFilterBar();
  renderGrid();
}

function renderGrid() {
  const grid = document.getElementById('scrap-grid');
  const countEl = document.getElementById('scrap-count');
  const filtered = getFiltered();
  if (countEl) countEl.textContent = `${filtered.length}개의 스크랩 문제`;
  if (!grid) return;

  if (!filtered.length) {
    grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted)">이 자료의 스크랩 문제가 없습니다.</div>`;
    return;
  }

  grid.innerHTML = filtered.map((s, i) => `
    <div class="scrap-card" data-id="${s.id}">
      <div class="scrap-card-top">
        <div class="scrap-card-badges">
          <span class="scrap-badge amber">🔖 스크랩</span>
          <span class="scrap-badge">${getBadgeText(s.type)}</span>
          ${s.docName ? `<span class="scrap-badge" title="${s.docName}">📄 ${truncate(s.docName, 16)}</span>` : ''}
        </div>
        <button class="scrap-remove-btn" title="스크랩 해제" data-id="${s.id}">✕</button>
      </div>
      <div class="scrap-question">${marked.parse(s.question)}</div>
      ${s.type === 'mcq' && s.options?.length ? `
        <div style="font-size:13px; color:var(--text-muted); line-height:1.8;">
          ${s.options.map((opt, oi) => {
            const marker = opt.match(/^[①②③④⑤]/) ? opt[0] : String.fromCharCode(9312 + oi);
            const text = opt.replace(/^[①②③④⑤]\s*/, '').trim();
            return `<span style="display:block">${marker} ${text}</span>`;
          }).join('')}
        </div>
      ` : ''}
      <div class="scrap-answer">✅ 정답: ${s.answer}</div>
      ${s.explanation ? `
        <button class="scrap-expl-toggle" data-expl-id="expl-${s.id}">📖 해설 보기 ▾</button>
        <div class="scrap-expl" id="expl-${s.id}" style="display:none">${formatExplanation(s.explanation)}</div>
      ` : ''}
      <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${formatDate(s.scrappedAt)}</div>
    </div>
  `).join('');

  // 삭제 버튼
  grid.querySelectorAll('.scrap-remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      await unscrapQuestion(id);
      scraps = scraps.filter(s => s.id !== id);
      if (!scraps.length) {
        showArea('empty');
      } else {
        renderFilterBar();
        renderGrid();
      }
      showToast('스크랩이 해제됐습니다.', 'info');
    });
  });

  // 해설 토글
  grid.querySelectorAll('.scrap-expl-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const expl = document.getElementById(btn.dataset.explId);
      if (!expl) return;
      const isOpen = expl.style.display !== 'none';
      expl.style.display = isOpen ? 'none' : '';
      btn.textContent = isOpen ? '📖 해설 보기 ▾' : '📖 해설 닫기 ▴';
    });
  });
}

// ─── 다시 풀기 ───
function startQuiz() {
  document.getElementById('retry-modal').classList.remove('visible');
  const filtered = getFiltered();
  if (!filtered.length) return;

  // 스크랩 문제들을 퀴즈 형식으로 변환
  const questions = filtered.map(s => ({
    question: s.question,
    type: s.type,
    options: s.options || [],
    answer: s.answer,
    explanation: s.explanation || ''
  }));

  // 셔플
  const shuffled = questions.sort(() => Math.random() - 0.5);

  savePendingQuiz({
    uid: currentUser?.uid || '',
    docId: null,
    docName: activeFilter === 'all' ? '스크랩 문제 모음' : activeFilter,
    type: 'mixed',
    questions: shuffled
  });

  window.location.href = '/quiz.html';
}

// ─── 전체 삭제 ───
async function clearAll() {
  document.getElementById('clear-modal').classList.remove('visible');
  for (const s of scraps) {
    await unscrapQuestion(s.id);
  }
  scraps = [];
  showArea('empty');
  showToast('전체 스크랩이 삭제됐습니다.', 'info');
}

// ─── 유틸 ───
function showArea(area) {
  ['login-required', 'scrap-loading', 'scrap-empty', 'scrap-content'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const map = {
    'login-required': 'login-required',
    'loading': 'scrap-loading',
    'empty': 'scrap-empty',
    'content': 'scrap-content'
  };
  const el = document.getElementById(map[area]);
  if (el) el.style.display = '';
}

function getBadgeText(type) {
  return { mcq: '📝 객관식', short: '✏️ 주관식', ox: '⭕ OX' }[type] || '📝 문제';
}

function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) + ' 스크랩';
}

function truncate(str, max) {
  return str?.length > max ? str.slice(0, max) + '...' : str;
}

function formatExplanation(text) {
  if (!text) return '';
  const spaced = text.replace(/([^\n])(①|②|③|④)/g, '$1\n\n$2');
  return marked.parse(spaced);
}

function updateNav(user) {
  const lo = document.getElementById('nav-auth-logged-out');
  const li = document.getElementById('nav-auth-logged-in');
  if (!lo || !li) return;
  if (user) {
    lo.style.display = 'none';
    li.style.display = 'flex';
    const avatar = document.getElementById('nav-avatar');
    if (avatar) avatar.src = user.photoURL || '';
  } else {
    lo.style.display = '';
    li.style.display = 'none';
  }
}

function showToast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
}

init();
