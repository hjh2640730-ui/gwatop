// ============================================================
// GWATOP - My Page v1.0.0
// ============================================================

import {
  onUserChange, logOut, checkNicknameAvailable, setNickname,
  signInWithGoogle, signInWithKakao, signInWithNaver
} from '/auth.js';
import {
  getFirestore, collection, query, where, orderBy, limit,
  getDocs, getCountFromServer
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { app } from '/auth.js';

const db = getFirestore(app);
const auth = getAuth(app);

let currentUser = null;
let currentUserData = null;

// ─── Toast ───
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

function openLoginModal() {
  document.getElementById('login-modal')?.classList.add('visible');
}

// ─── 날짜 포맷 ───
function formatDate(ts) {
  if (!ts) return '-';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function timeAgo(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

// ─── 프로필 렌더 ───
function renderProfile(user, userData) {
  const name = userData?.nickname || user.displayName || '이름 없음';
  document.getElementById('mp-name').textContent = name;
  document.getElementById('mp-email').textContent = user.email || '';
  document.getElementById('mp-nickname-display').textContent = userData?.nickname || '미설정';

  if (user.photoURL) {
    const img = document.getElementById('mp-avatar');
    img.src = user.photoURL;
    img.style.display = 'block';
    document.getElementById('mp-avatar-placeholder').style.display = 'none';
  }

  if (userData?.university) {
    const uniEl = document.getElementById('mp-university');
    uniEl.textContent = userData.university;
    uniEl.style.display = '';
  }

  const joinedEl = document.getElementById('mp-joined');
  if (userData?.createdAt) {
    joinedEl.textContent = `가입일 ${formatDate(userData.createdAt)}`;
  } else {
    joinedEl.style.display = 'none';
  }
}

// ─── 통계 렌더 ───
async function renderStats(user, userData) {
  document.getElementById('stat-credits').textContent = userData?.credits ?? 0;
  document.getElementById('stat-quizzes').textContent = userData?.totalQuizzes ?? 0;
  document.getElementById('stat-referrals').textContent = (userData?.referralCredits ?? 0) + ' / 3';

  try {
    const q = query(collection(db, 'community_posts'), where('uid', '==', user.uid));
    const snap = await getCountFromServer(q);
    document.getElementById('stat-posts').textContent = snap.data().count;
  } catch {
    document.getElementById('stat-posts').textContent = '-';
  }
}

// ─── 추천 링크 ───
function renderReferral(user) {
  const link = `${location.origin}/?ref=${user.uid}`;
  document.getElementById('referral-link').textContent = link;
  document.getElementById('referral-copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(link).then(() => showToast('링크 복사됨!', 'success'));
  });
}

// ─── 내 게시글 ───
async function renderMyPosts(user) {
  const wrap = document.getElementById('my-posts-list');
  try {
    const q = query(
      collection(db, 'community_posts'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(5)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      wrap.innerHTML = '<div style="color:var(--text-muted);font-size:14px;text-align:center;padding:20px 0">아직 작성한 게시글이 없습니다.</div>';
      return;
    }
    wrap.innerHTML = snap.docs.map(d => {
      const p = d.data();
      const title = p.title || '(제목 없음)';
      const likes = p.likes || 0;
      const comments = p.commentCount || 0;
      const ago = timeAgo(p.createdAt);
      return `<div class="post-item" onclick="location.href='/post.html?id=${d.id}'">
        <div class="post-item-title">${title}</div>
        <div class="post-item-meta">
          <span>❤️ ${likes}</span>
          <span>💬 ${comments}</span>
          <span>${ago}</span>
        </div>
      </div>`;
    }).join('');

    if (snap.docs.length === 5) {
      document.getElementById('my-posts-more').style.display = 'block';
    }
  } catch {
    wrap.innerHTML = '<div style="color:var(--text-muted);font-size:14px;text-align:center;padding:20px 0">불러오기 실패</div>';
  }
}

// ─── 닉네임 변경 ───
function setupNicknameEdit() {
  const editBtn = document.getElementById('nickname-edit-btn');
  const saveBtn = document.getElementById('nickname-save-btn');
  const input = document.getElementById('nickname-input');
  const display = document.getElementById('mp-nickname-display');

  editBtn.addEventListener('click', () => {
    input.value = currentUserData?.nickname || '';
    input.style.display = 'block';
    saveBtn.style.display = 'inline-flex';
    editBtn.style.display = 'none';
    input.focus();
  });

  saveBtn.addEventListener('click', async () => {
    const newNick = input.value.trim();
    if (!newNick) { showToast('닉네임을 입력해주세요.', 'error'); return; }
    if (newNick.length < 2) { showToast('닉네임은 2자 이상이어야 합니다.', 'error'); return; }
    if (newNick === currentUserData?.nickname) {
      input.style.display = 'none';
      saveBtn.style.display = 'none';
      editBtn.style.display = 'inline-flex';
      return;
    }
    saveBtn.disabled = true;
    const available = await checkNicknameAvailable(newNick);
    if (!available) {
      showToast('이미 사용 중인 닉네임입니다.', 'error');
      saveBtn.disabled = false;
      return;
    }
    await setNickname(currentUser.uid, newNick);
    currentUserData = { ...currentUserData, nickname: newNick };
    display.textContent = newNick;
    document.getElementById('mp-name').textContent = newNick;
    input.style.display = 'none';
    saveBtn.style.display = 'none';
    editBtn.style.display = 'inline-flex';
    saveBtn.disabled = false;
    showToast('닉네임이 변경됐습니다.', 'success');
  });
}

// ─── 회원 탈퇴 ───
function setupDeleteAccount() {
  document.getElementById('mp-delete-btn').addEventListener('click', async () => {
    if (!confirm('정말 탈퇴하시겠습니까?\n모든 데이터가 삭제되며 복구할 수 없습니다.')) return;
    if (!confirm('마지막 확인입니다. 탈퇴 후 크레딧, 퀴즈 기록, 게시글, 댓글이 모두 삭제됩니다.\n계속하시겠습니까?')) return;
    const btn = document.getElementById('mp-delete-btn');
    btn.disabled = true;
    btn.textContent = '삭제 중...';
    try {
      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '탈퇴 실패');
      showToast('탈퇴가 완료됐습니다.', 'success');
      setTimeout(() => window.location.href = '/', 1500);
    } catch (e) {
      showToast(e.message || '탈퇴 처리 중 오류가 발생했습니다.', 'error');
      btn.disabled = false;
      btn.textContent = '탈퇴';
    }
  });
}

// ─── 초기화 ───
onUserChange(async (user, userData) => {
  currentUser = user;
  currentUserData = userData;

  const content = document.getElementById('mypage-content');
  const prompt = document.getElementById('login-prompt');
  const lo = document.getElementById('nav-auth-logged-out');
  const li = document.getElementById('nav-auth-logged-in');

  if (!user) {
    content.style.display = 'none';
    prompt.style.display = 'block';
    lo?.style && (lo.style.display = 'flex');
    li?.style && (li.style.display = 'none');
    return;
  }

  lo?.style && (lo.style.display = 'none');
  li?.style && (li.style.display = 'flex');
  const avatar = document.getElementById('nav-avatar');
  const username = document.getElementById('nav-username');
  const credits = document.getElementById('nav-credits');
  if (avatar) avatar.src = user.photoURL || '';
  if (username) username.textContent = userData?.nickname || user.displayName || '';
  if (credits) credits.textContent = userData?.credits ?? 0;

  content.style.display = 'block';
  prompt.style.display = 'none';

  renderProfile(user, userData);
  renderReferral(user);
  setupNicknameEdit();
  setupDeleteAccount();

  document.getElementById('mp-logout-btn').addEventListener('click', () => logOut());

  await Promise.all([
    renderStats(user, userData),
    renderMyPosts(user),
  ]);
});

// ─── 로그인 모달 ───
document.getElementById('nav-login-btn')?.addEventListener('click', openLoginModal);
document.getElementById('prompt-login-btn')?.addEventListener('click', openLoginModal);
document.getElementById('modal-login-google')?.addEventListener('click', () => {
  document.getElementById('login-modal').classList.remove('visible');
  signInWithGoogle();
});
document.getElementById('modal-login-kakao')?.addEventListener('click', () => {
  document.getElementById('login-modal').classList.remove('visible');
  signInWithKakao();
});
document.getElementById('modal-login-naver')?.addEventListener('click', () => {
  document.getElementById('login-modal').classList.remove('visible');
  signInWithNaver();
});
document.getElementById('modal-close-btn')?.addEventListener('click', () => {
  document.getElementById('login-modal').classList.remove('visible');
});
document.getElementById('login-modal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('login-modal')) document.getElementById('login-modal').classList.remove('visible');
});
document.getElementById('nav-logout-btn')?.addEventListener('click', () => logOut());
