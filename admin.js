// ============================================================
// GWATOP - Admin Page Logic v1.1.0
// ============================================================

import { onUserChange, signInWithGoogle, logOut } from './auth.js';

const ADMIN_EMAIL = 'hjh2640730@gmail.com';

let currentUser = null;
let allUsers = [];
let editingUid = null;
let deletingUid = null;

async function init() {
  showState('loading');

  document.getElementById('admin-login-btn').addEventListener('click', () => signInWithGoogle());
  document.getElementById('admin-logout-btn').addEventListener('click', () => logOut());
  document.getElementById('denied-logout-btn').addEventListener('click', () => logOut());

  onUserChange(async (user) => {
    currentUser = user;

    if (!user) {
      document.getElementById('admin-logout-btn').style.display = 'none';
      showState('login');
      return;
    }

    if (user.email !== ADMIN_EMAIL) {
      document.getElementById('admin-logout-btn').style.display = '';
      showState('denied');
      return;
    }

    document.getElementById('admin-logout-btn').style.display = '';
    showState('main');
    await loadUsers();
    setupEvents();
  });
}

function showState(state) {
  document.getElementById('login-state').style.display    = state === 'login'   ? 'flex' : 'none';
  document.getElementById('loading-state').style.display  = state === 'loading' ? 'flex' : 'none';
  document.getElementById('access-denied').style.display  = state === 'denied'  ? 'flex' : 'none';
  document.getElementById('admin-main').style.display     = state === 'main'    ? ''     : 'none';
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
      <div class="td" data-label="이메일">${u.email || '-'}</div>
      <div class="td td-credits" data-label="크레딧">${u.credits}</div>
      <div class="td" data-label="퀴즈 수">${u.totalQuizzes}</div>
      <div class="td" data-label="추천">${u.referralCredits}</div>
      <div class="td td-date" data-label="가입일">${formatDate(u.createdAt)}</div>
      <div class="td"><button class="btn btn-glass btn-sm edit-btn" data-uid="${u.uid}">수정</button></div>
      <div class="td"><button class="btn-delete delete-btn" data-uid="${u.uid}">삭제</button></div>
    </div>
  `).join('');

  body.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openEditModal(btn.dataset.uid); });
  });
  body.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openDeleteModal(btn.dataset.uid); });
  });
}

// ─── Search ───
function setupEvents() {
  document.getElementById('search-input').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = allUsers.filter(u =>
      (u.email || '').toLowerCase().includes(q) ||
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

  // Delete modal
  document.getElementById('delete-cancel-btn').addEventListener('click', closeDeleteModal);
  document.getElementById('delete-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('delete-modal')) closeDeleteModal();
  });
  document.getElementById('delete-confirm-btn').addEventListener('click', confirmDelete);
}

// ─── Edit Modal ───
function openEditModal(uid) {
  const user = allUsers.find(u => u.uid === uid);
  if (!user) return;
  editingUid = uid;
  document.getElementById('edit-name').textContent = user.displayName || '(이름 없음)';
  document.getElementById('edit-email').textContent = user.email || '-';
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

// ─── Delete Modal ───
function openDeleteModal(uid) {
  const user = allUsers.find(u => u.uid === uid);
  if (!user) return;
  deletingUid = uid;
  const name = user.displayName || '(이름 없음)';
  const email = user.email || '-';
  document.getElementById('delete-desc').innerHTML = `<strong>${name}</strong> (${email})<br/>이 유저를 삭제하시겠습니까?<br/><span style="color:#f87171;font-size:13px">이 작업은 되돌릴 수 없습니다.</span>`;
  document.getElementById('delete-modal').classList.add('visible');
}

function closeDeleteModal() {
  document.getElementById('delete-modal').classList.remove('visible');
  deletingUid = null;
}

async function confirmDelete() {
  if (!deletingUid) return;
  const btn = document.getElementById('delete-confirm-btn');
  btn.disabled = true;
  btn.textContent = '삭제 중...';

  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: idToken, action: 'deleteUser', uid: deletingUid }),
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      showToast(data.error || '삭제 실패', 'error');
      return;
    }

    allUsers = allUsers.filter(u => u.uid !== deletingUid);
    showToast('유저가 삭제됐습니다.', 'success');
    closeDeleteModal();
    renderTable(allUsers);

    // 통계 업데이트
    document.getElementById('stat-users').textContent = allUsers.length.toLocaleString();
    document.getElementById('stat-credits').textContent = allUsers.reduce((s, u) => s + u.credits, 0).toLocaleString();
    document.getElementById('stat-quizzes').textContent = allUsers.reduce((s, u) => s + u.totalQuizzes, 0).toLocaleString();
  } catch (e) {
    showToast('네트워크 오류: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '삭제';
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
