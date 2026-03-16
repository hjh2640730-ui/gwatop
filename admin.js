// ============================================================
// GWATOP - Admin Page Logic v1.0.0
// ============================================================

import { onUserChange } from './auth.js';

const ADMIN_EMAIL = 'hjh2640730@gmail.com';

let currentUser = null;
let allUsers = [];
let editingUid = null;

async function init() {
  showState('loading');

  onUserChange(async (user) => {
    currentUser = user;

    if (!user) {
      showState('denied');
      return;
    }

    if (user.email !== ADMIN_EMAIL) {
      showState('denied');
      return;
    }

    showState('main');
    await loadUsers();
    setupEvents();
  });
}

function showState(state) {
  document.getElementById('loading-state').style.display = state === 'loading' ? 'flex' : 'none';
  document.getElementById('access-denied').style.display = state === 'denied' ? 'flex' : 'none';
  document.getElementById('admin-main').style.display = state === 'main' ? '' : 'none';
}

// ─── Load Users ───
async function loadUsers() {
  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch(`/api/admin?token=${idToken}`);
    const data = await res.json();

    if (!res.ok || data.error) {
      showToast(data.error || '데이터 로드 실패', 'error');
      return;
    }

    allUsers = data.users;

    // Stats
    document.getElementById('stat-users').textContent = data.stats.totalUsers.toLocaleString();
    document.getElementById('stat-quizzes').textContent = data.stats.totalQuizzes.toLocaleString();
    document.getElementById('stat-credits').textContent = data.stats.totalCredits.toLocaleString();

    renderTable(allUsers);
  } catch (e) {
    showToast('네트워크 오류: ' + e.message, 'error');
  }
}

// ─── Render Table ───
function renderTable(users) {
  const body = document.getElementById('table-body');

  if (users.length === 0) {
    body.innerHTML = '<div class="empty-row">유저가 없습니다.</div>';
    return;
  }

  body.innerHTML = users.map(u => `
    <div class="table-row" data-uid="${u.uid}">
      <div class="td td-name" data-label="이름">${u.displayName || '(이름 없음)'}</div>
      <div class="td" data-label="이메일">${u.email}</div>
      <div class="td td-credits" data-label="크레딧">${u.credits}</div>
      <div class="td" data-label="퀴즈 수">${u.totalQuizzes}</div>
      <div class="td" data-label="추천">${u.referralCredits}</div>
      <div class="td td-date" data-label="가입일">${formatDate(u.createdAt)}</div>
      <div class="td"><button class="btn btn-glass btn-sm edit-btn" data-uid="${u.uid}">수정</button></div>
    </div>
  `).join('');

  // Edit button events
  body.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(btn.dataset.uid);
    });
  });
}

// ─── Search ───
function setupEvents() {
  document.getElementById('search-input').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = allUsers.filter(u =>
      u.email.toLowerCase().includes(q) ||
      (u.displayName || '').toLowerCase().includes(q)
    );
    renderTable(filtered);
  });

  document.getElementById('refresh-btn').addEventListener('click', () => loadUsers());

  // Edit modal
  document.getElementById('edit-cancel-btn').addEventListener('click', closeEditModal);
  document.getElementById('edit-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('edit-modal')) closeEditModal();
  });
  document.getElementById('edit-save-btn').addEventListener('click', saveCredits);
}

// ─── Edit Modal ───
function openEditModal(uid) {
  const user = allUsers.find(u => u.uid === uid);
  if (!user) return;

  editingUid = uid;
  document.getElementById('edit-name').textContent = user.displayName || '(이름 없음)';
  document.getElementById('edit-email').textContent = user.email;
  document.getElementById('edit-credits-input').value = user.credits;
  document.getElementById('edit-modal').classList.add('visible');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('visible');
  editingUid = null;
}

async function saveCredits() {
  if (!editingUid) return;
  const credits = parseInt(document.getElementById('edit-credits-input').value);
  if (isNaN(credits) || credits < 0) {
    showToast('올바른 크레딧 값을 입력해주세요.', 'error');
    return;
  }

  const saveBtn = document.getElementById('edit-save-btn');
  saveBtn.disabled = true;

  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: idToken, action: 'updateCredits', uid: editingUid, credits }),
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      showToast(data.error || '저장 실패', 'error');
      return;
    }

    // Update local data
    const user = allUsers.find(u => u.uid === editingUid);
    if (user) user.credits = credits;

    showToast('크레딧이 업데이트됐습니다.', 'success');
    closeEditModal();
    renderTable(allUsers);
  } catch (e) {
    showToast('네트워크 오류: ' + e.message, 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

// ─── Utils ───
function formatDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success: '✅', error: '❌', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 300); }, 3500);
}

init();
