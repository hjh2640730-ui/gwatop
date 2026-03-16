// ============================================================
// GWATOP - History Page Logic v1.0.0
// 저장된 퀴즈 및 문서 관리
// ============================================================

import { signInWithGoogle, logOut, handleRedirectResult, onUserChange } from './auth.js';
import {
  getAllQuizzes, getAllDocuments,
  deleteQuiz, deleteDocument,
  savePendingQuiz, getDocument
} from './db.js';

// ─── State ───
let pendingDelete = null; // { type: 'quiz'|'doc', id }

// ─── Init ───
async function init() {
  await handleRedirectResult();
  setupNav();
  setupTabs();
  setupDeleteModal();
  await loadAll();
}

// ─── Nav ───
function setupNav() {
  document.getElementById('nav-login-btn')?.addEventListener('click', () => signInWithGoogle());
  document.getElementById('nav-logout-btn')?.addEventListener('click', () => logOut());

  onUserChange((user, userData) => {
    const lo = document.getElementById('nav-auth-logged-out');
    const li = document.getElementById('nav-auth-logged-in');
    if (user) {
      lo.style.display = 'none';
      li.style.display = 'flex';
      document.getElementById('nav-avatar').src = user.photoURL || '';
      document.getElementById('nav-username').textContent = user.displayName || user.email || '';
      const plan = userData?.plan || 'free';
      const badge = document.getElementById('nav-plan-badge');
      badge.textContent = plan === 'premium' ? 'Premium' : 'Free';
      badge.className = `nav-plan-badge ${plan}`;
    } else {
      lo.style.display = '';
      li.style.display = 'none';
    }
  });
}

// ─── Tabs ───
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
        b.classList.add('btn-ghost');
        b.classList.remove('btn-glass');
      });
      btn.classList.add('active', 'btn-glass');
      btn.classList.remove('btn-ghost');

      const tab = btn.dataset.tab;
      document.getElementById('tab-quizzes-content').style.display = tab === 'quizzes' ? '' : 'none';
      document.getElementById('tab-documents-content').style.display = tab === 'documents' ? '' : 'none';
    });
  });
}

// ─── Load All ───
async function loadAll() {
  await loadQuizzes();
  await loadDocuments();
}

// ─── Load Quizzes ───
async function loadQuizzes() {
  const grid = document.getElementById('quizzes-grid');
  const empty = document.getElementById('quizzes-empty');
  const quizzes = await getAllQuizzes();

  if (quizzes.length === 0) {
    grid.style.display = 'none';
    empty.style.display = '';
    return;
  }

  grid.style.display = '';
  empty.style.display = 'none';
  grid.innerHTML = quizzes.map(q => renderQuizCard(q)).join('');

  // Attach events
  grid.querySelectorAll('[data-replay]').forEach(btn => {
    btn.addEventListener('click', () => replayQuiz(parseInt(btn.dataset.replay)));
  });
  grid.querySelectorAll('[data-delete-quiz]').forEach(btn => {
    btn.addEventListener('click', () => confirmDelete('quiz', parseInt(btn.dataset.deleteQuiz), `"${btn.dataset.name}" 퀴즈 결과를 삭제합니다.`));
  });
}

function renderQuizCard(q) {
  const date = new Date(q.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const typeLabels = { mcq: '객관식', short: '주관식', ox: 'OX 퀴즈' };
  const score = q.score != null ? q.score : null;
  const scoreColor = score == null ? 'var(--text-secondary)' : score >= 70 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  const emoji = score == null ? '📝' : score >= 80 ? '🏆' : score >= 60 ? '🎯' : '📚';

  return `
    <div class="history-card">
      <div class="history-card-icon">${emoji}</div>
      <div class="history-card-title">${escapeHtml(q.docName || '문서')}</div>
      <div class="history-card-meta">
        <span class="history-meta-chip">${typeLabels[q.type] || '퀴즈'}</span>
        <span class="history-meta-chip">${q.totalQuestions || q.questions?.length || 0}문제</span>
        <span class="history-meta-chip">${date}</span>
      </div>
      ${score != null ? `<div class="history-card-score" style="color:${scoreColor}">${score}점</div>` : '<div style="font-size:13px;color:var(--text-muted)">미완료</div>'}
      <div class="history-card-actions">
        <button class="btn btn-primary btn-sm" style="flex:1" data-replay="${q.id}">
          ▶ 다시 풀기
        </button>
        <button class="btn btn-danger btn-sm" data-delete-quiz="${q.id}" data-name="${escapeAttr(q.docName || '문서')}">
          🗑
        </button>
      </div>
    </div>
  `;
}

// ─── Load Documents ───
async function loadDocuments() {
  const grid = document.getElementById('documents-grid');
  const empty = document.getElementById('documents-empty');
  const docs = await getAllDocuments();

  if (docs.length === 0) {
    grid.style.display = 'none';
    empty.style.display = '';
    return;
  }

  grid.style.display = '';
  empty.style.display = 'none';
  grid.innerHTML = docs.map(d => renderDocCard(d)).join('');

  grid.querySelectorAll('[data-delete-doc]').forEach(btn => {
    btn.addEventListener('click', () => confirmDelete('doc', parseInt(btn.dataset.deleteDoc), `"${btn.dataset.name}" 문서와 관련된 모든 퀴즈를 삭제합니다.`));
  });
}

function renderDocCard(d) {
  const date = new Date(d.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const size = formatSize(d.fileSize || 0);
  const previewText = (d.text || '').slice(0, 120).replace(/\s+/g, ' ') + '...';

  return `
    <div class="history-card">
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
        <a href="/" class="btn btn-glass btn-sm" style="flex:1">
          ✨ 새 퀴즈 만들기
        </a>
        <button class="btn btn-danger btn-sm" data-delete-doc="${d.id}" data-name="${escapeAttr(d.name || '문서')}">
          🗑
        </button>
      </div>
    </div>
  `;
}

// ─── Replay Quiz ───
async function replayQuiz(quizId) {
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
    await loadAll();
  });
  document.getElementById('delete-cancel-btn')?.addEventListener('click', () => {
    modal.classList.remove('visible');
    pendingDelete = null;
  });
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) { modal.classList.remove('visible'); pendingDelete = null; }
  });
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
