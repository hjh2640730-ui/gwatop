// ============================================================
// GWATOP - Admin Page Logic v2.0.0
// ============================================================

import { onAdminUserChange, signInWithGoogleAdmin, logOutAdmin } from './auth-admin.js';

const ADMIN_EMAIL = 'hjh2640730@gmail.com';

let currentUser = null;
let allUsers = [];
let allPosts = [];
let editingUid = null;
let deletingUid = null;
let deletingPostId = null;
let activeTab = 'dashboard';
let dashboardLoaded = false;
let usersLoaded = false;
let postsLoaded = false;

// ─── 탭 시스템 ───
const TABS = ['dashboard', 'users', 'posts'];

function switchTab(tabName) {
  TABS.forEach(t => {
    document.getElementById(`tab-${t}`).style.display = t === tabName ? '' : 'none';
    document.querySelector(`[data-tab="${t}"]`).classList.toggle('active', t === tabName);
  });
  activeTab = tabName;

  if (tabName === 'dashboard' && !dashboardLoaded) loadDashboard();
  if (tabName === 'users' && !usersLoaded) loadUsers();
  if (tabName === 'posts' && !postsLoaded) loadPosts();
}

async function init() {
  showState('loading');

  document.getElementById('admin-login-btn').addEventListener('click', () => signInWithGoogleAdmin());
  document.getElementById('admin-logout-btn').addEventListener('click', () => logOutAdmin());
  document.getElementById('denied-logout-btn').addEventListener('click', () => logOutAdmin());

  onAdminUserChange(async (user) => {
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
    setupEvents();
    switchTab('dashboard');
  });
}

function showState(state) {
  document.getElementById('login-state').style.display    = state === 'login'   ? 'flex' : 'none';
  document.getElementById('loading-state').style.display  = state === 'loading' ? 'flex' : 'none';
  document.getElementById('access-denied').style.display  = state === 'denied'  ? 'flex' : 'none';
  document.getElementById('admin-main').style.display     = state === 'main'    ? ''     : 'none';
}

// ─── Load Dashboard ───
async function loadDashboard() {
  dashboardLoaded = false;
  try {
    const idToken = await currentUser.getIdToken();
    const [usersRes, postsRes] = await Promise.all([
      fetch(`/api/admin?token=${idToken}`),
      fetch(`/api/admin?token=${idToken}&type=posts`),
    ]);

    const usersData = await usersRes.json();
    const postsData = await postsRes.json();

    if (!usersRes.ok || usersData.error) {
      showToast(usersData.error || '유저 데이터 로드 실패', 'error');
      return;
    }
    if (!postsRes.ok || postsData.error) {
      showToast(postsData.error || '게시글 데이터 로드 실패', 'error');
      return;
    }

    const users = usersData.users;
    const posts = postsData.posts;

    // 오늘 신규 가입자
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayUsers = users.filter(u => {
      if (!u.createdAt) return false;
      return u.createdAt.slice(0, 10) === todayStr;
    }).length;

    const totalLikes = posts.reduce((s, p) => s + (p.likes || 0), 0);

    document.getElementById('stat-total-users').textContent = users.length.toLocaleString();
    document.getElementById('stat-today-users').textContent = todayUsers.toLocaleString();
    document.getElementById('stat-total-quizzes').textContent = users.reduce((s, u) => s + u.totalQuizzes, 0).toLocaleString();
    document.getElementById('stat-total-credits').textContent = users.reduce((s, u) => s + u.credits, 0).toLocaleString();
    document.getElementById('stat-total-posts').textContent = posts.length.toLocaleString();
    document.getElementById('stat-total-likes').textContent = totalLikes.toLocaleString();

    dashboardLoaded = true;
  } catch (e) {
    showToast('네트워크 오류: ' + e.message, 'error');
  }
}

// ─── Load Users ───
async function loadUsers() {
  usersLoaded = false;
  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch(`/api/admin?token=${idToken}`);
    const data = await res.json();

    if (!res.ok || data.error) {
      showToast(data.error || '데이터 로드 실패', 'error');
      return;
    }

    allUsers = data.users;
    renderTable(allUsers);
    usersLoaded = true;
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
      <div class="td" data-label="닉네임" style="color:#a78bfa;font-weight:600">${u.nickname || '-'}</div>
      <div class="td" data-label="이메일">${u.email || '-'}</div>
      <div class="td" data-label="전화번호">${formatPhone(u.phone)}</div>
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

// ─── Load Posts ───
async function loadPosts() {
  postsLoaded = false;
  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch(`/api/admin?token=${idToken}&type=posts`);
    const data = await res.json();

    if (!res.ok || data.error) {
      showToast(data.error || '게시글 데이터 로드 실패', 'error');
      return;
    }

    allPosts = data.posts;
    renderPosts(allPosts);
    postsLoaded = true;
  } catch (e) {
    showToast('네트워크 오류: ' + e.message, 'error');
  }
}

// ─── Render Posts ───
function renderPosts(posts) {
  const body = document.getElementById('posts-table-body');

  if (posts.length === 0) {
    body.innerHTML = '<div class="empty-row">게시글이 없습니다.</div>';
    return;
  }

  body.innerHTML = posts.map(p => `
    <div class="posts-table-row" data-id="${p.id}">
      <div class="td" style="padding-right:12px;">
        <div class="td-title">${p.title || '제목없음'}</div>
        <div class="td-preview">${p.content || ''}</div>
      </div>
      <div class="td" data-label="작성자">${p.isAnonymous ? '익명' : (p.nickname || '-')}</div>
      <div class="td" data-label="대학교">${p.university || '-'}</div>
      <div class="td" data-label="좋아요">❤️ ${p.likes}</div>
      <div class="td" data-label="댓글">💬 ${p.commentCount}</div>
      <div class="td td-date" data-label="날짜">${formatDate(p.createdAt)}</div>
      <div class="td"><button class="btn-delete post-delete-btn" data-id="${p.id}">삭제</button></div>
    </div>
  `).join('');

  body.querySelectorAll('.post-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openPostDeleteModal(btn.dataset.id); });
  });
}

// ─── Search ───
function setupEvents() {
  // 탭 전환
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // 유저 검색
  document.getElementById('search-input').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = allUsers.filter(u =>
      (u.email || '').toLowerCase().includes(q) ||
      (u.displayName || '').toLowerCase().includes(q)
    );
    renderTable(filtered);
  });

  document.getElementById('refresh-btn').addEventListener('click', () => {
    usersLoaded = false;
    loadUsers();
  });

  // 게시글 검색
  document.getElementById('post-search-input').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = allPosts.filter(p =>
      (p.title || '').toLowerCase().includes(q) ||
      (p.nickname || '').toLowerCase().includes(q)
    );
    renderPosts(filtered);
  });

  document.getElementById('posts-refresh-btn').addEventListener('click', () => {
    postsLoaded = false;
    loadPosts();
  });

  // Edit modal
  document.getElementById('edit-cancel-btn').addEventListener('click', closeEditModal);
  document.getElementById('edit-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('edit-modal')) closeEditModal();
  });
  document.getElementById('edit-save-btn').addEventListener('click', saveEdits);

  // Delete modal (user)
  document.getElementById('delete-cancel-btn').addEventListener('click', closeDeleteModal);
  document.getElementById('delete-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('delete-modal')) closeDeleteModal();
  });
  document.getElementById('delete-confirm-btn').addEventListener('click', confirmDelete);

  // Delete modal (post)
  document.getElementById('post-delete-cancel-btn').addEventListener('click', closePostDeleteModal);
  document.getElementById('post-delete-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('post-delete-modal')) closePostDeleteModal();
  });
  document.getElementById('post-delete-confirm-btn').addEventListener('click', confirmPostDelete);
}

// ─── Edit Modal ───
function openEditModal(uid) {
  const user = allUsers.find(u => u.uid === uid);
  if (!user) return;
  editingUid = uid;
  document.getElementById('edit-name').textContent = user.displayName || '(이름 없음)';
  document.getElementById('edit-email').textContent = user.email || '-';
  document.getElementById('edit-phone').textContent = formatPhone(user.phone) || '-';
  document.getElementById('edit-university').textContent = user.university || '-';
  document.getElementById('edit-nickname-input').value = user.nickname || '';
  document.getElementById('edit-credits-input').value = user.credits;
  document.getElementById('edit-modal').classList.add('visible');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('visible');
  editingUid = null;
}

async function saveEdits() {
  if (!editingUid) return;
  const credits = parseInt(document.getElementById('edit-credits-input').value);
  const nickname = document.getElementById('edit-nickname-input').value.trim();

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
      body: JSON.stringify({ token: idToken, action: 'updateUser', uid: editingUid, credits, nickname }),
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      showToast(data.error || '저장 실패', 'error');
      return;
    }

    const user = allUsers.find(u => u.uid === editingUid);
    if (user) {
      user.credits = credits;
      user.nickname = nickname;
    }
    showToast('유저 정보가 업데이트됐습니다.', 'success');
    closeEditModal();
    renderTable(allUsers);

    // 대시보드 통계 갱신 필요
    dashboardLoaded = false;
  } catch (e) {
    showToast('네트워크 오류: ' + e.message, 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

// ─── Delete Modal (User) ───
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
    dashboardLoaded = false;
  } catch (e) {
    showToast('네트워크 오류: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '삭제';
  }
}

// ─── Delete Modal (Post) ───
function openPostDeleteModal(postId) {
  const post = allPosts.find(p => p.id === postId);
  deletingPostId = postId;
  const title = post?.title || '제목없음';
  document.getElementById('post-delete-desc').innerHTML = `<strong>${title}</strong><br/>이 게시글을 삭제하시겠습니까?<br/><span style="color:#f87171;font-size:13px">이 작업은 되돌릴 수 없습니다.</span>`;
  document.getElementById('post-delete-modal').classList.add('visible');
}

function closePostDeleteModal() {
  document.getElementById('post-delete-modal').classList.remove('visible');
  deletingPostId = null;
}

async function confirmPostDelete() {
  if (!deletingPostId) return;
  const btn = document.getElementById('post-delete-confirm-btn');
  btn.disabled = true;
  btn.textContent = '삭제 중...';

  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: idToken, action: 'deletePost', postId: deletingPostId }),
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      showToast(data.error || '삭제 실패', 'error');
      return;
    }

    allPosts = allPosts.filter(p => p.id !== deletingPostId);
    showToast('게시글이 삭제됐습니다.', 'success');
    closePostDeleteModal();
    renderPosts(allPosts);
    dashboardLoaded = false;
  } catch (e) {
    showToast('네트워크 오류: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '삭제';
  }
}

// ─── Utils ───
function formatPhone(phone) {
  if (!phone) return '-';
  return phone.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
}

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
