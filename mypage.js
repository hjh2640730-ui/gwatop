// ============================================================
// GWATOP - My Page v1.0.0
// ============================================================

import {
  onUserChange, logOut, checkNicknameAvailable, setNickname,
  signInWithGoogle, signInWithKakao, signInWithNaver
} from '/auth.js';
import {
  getFirestore, collection, query, where, orderBy, limit,
  getDocs, getCountFromServer, writeBatch, doc, getDoc
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

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// ─── 프로필 렌더 ───
function renderProfile(user, userData) {
  const name = userData?.nickname || user.displayName || '이름 없음';
  const icon = userData?.icon || '';
  document.getElementById('mp-name').textContent = name;
  document.getElementById('mp-email').textContent = user.email || '';
  document.getElementById('mp-nickname-display').textContent = userData?.nickname || '미설정';

  if (icon) {
    // 아이콘이 있으면 프로필 이미지 대신 이모지 표시
    const img = document.getElementById('mp-avatar');
    const placeholder = document.getElementById('mp-avatar-placeholder');
    img.style.display = 'none';
    if (placeholder) {
      placeholder.style.display = 'flex';
      placeholder.textContent = icon;
      placeholder.style.fontSize = '48px';
    }
  } else if (user.photoURL) {
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
  document.getElementById('stat-free-points').textContent = userData?.freePoints ?? 0;
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
        <div class="post-item-title">${escapeHtml(title)}</div>
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

// ─── 메시지함 ───
async function renderInbox(user) {
  const wrap = document.getElementById('inbox-list');
  try {
    // 개인 메시지 + 전체 공지 + claimed 목록 동시 조회
    const [inboxSnap, globalSnap, claimedSnap] = await Promise.all([
      getDocs(query(collection(db, 'users', user.uid, 'inbox'), orderBy('createdAt', 'desc'), limit(30))),
      getDocs(query(collection(db, 'global_messages'), orderBy('createdAt', 'desc'), limit(30))),
      getDocs(collection(db, 'users', user.uid, 'claimed')),
    ]);

    const claimedIds = new Set(claimedSnap.docs.map(d => d.id));
    const ca = currentUserData?.createdAt;
    const userCreated = ca?.toDate ? ca.toDate().getTime() : ca?.seconds ? ca.seconds * 1000 : (user.metadata?.creationTime ? new Date(user.metadata.creationTime).getTime() : 0);
    const messages = [];

    inboxSnap.docs.forEach(d => messages.push({ id: d.id, messageType: 'inbox', ...d.data() }));
    globalSnap.docs.forEach(d => {
      const data = d.data();
      const msgTime = data.createdAt?.toDate ? data.createdAt.toDate().getTime() : new Date(data.createdAt || 0).getTime();
      if (msgTime >= userCreated) messages.push({ id: d.id, messageType: 'global', claimed: claimedIds.has(d.id), ...data });
    });

    messages.sort((a, b) => {
      const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
      return tb - ta;
    });

    // 수령 가능한 보상 개수로 뱃지 업데이트
    const pending = messages.filter(m => m.rewardType === 'freePoints' && m.rewardAmount > 0 && !m.claimed).length;
    const badge = document.getElementById('inbox-badge');
    if (pending > 0) { badge.textContent = pending; badge.style.display = ''; }
    else badge.style.display = 'none';

    if (!messages.length) {
      wrap.innerHTML = '<div style="color:var(--text-muted);font-size:14px;text-align:center;padding:20px 0">메시지가 없습니다.</div>';
      return;
    }

    wrap.innerHTML = messages.map(m => {
      const hasReward = m.rewardType === 'freePoints' && m.rewardAmount > 0;
      const claimed = m.claimed;
      const isNew = hasReward && !claimed;
      const ts = m.createdAt?.toDate ? m.createdAt.toDate() : new Date(m.createdAt || 0);
      const dateStr = `${ts.getFullYear()}.${String(ts.getMonth()+1).padStart(2,'0')}.${String(ts.getDate()).padStart(2,'0')}`;
      return `<div class="inbox-item${isNew ? ' inbox-item-new' : ''}">
        <div class="inbox-item-title">
          ${isNew ? '<span class="inbox-badge-new">NEW</span>' : ''}
          ${escapeHtml(m.title || '(제목없음)')}
        </div>
        <div class="inbox-item-body">${escapeHtml(m.body || '')}</div>
        ${hasReward ? `<div class="inbox-reward">
          ${claimed
            ? '<span class="inbox-claimed-badge">✅ 수령 완료</span>'
            : `<button class="btn btn-primary btn-sm inbox-claim-btn" data-id="${m.id}" data-type="${m.messageType}" data-amount="${m.rewardAmount}">🎁 +${m.rewardAmount}P 받기</button>`
          }
        </div>` : ''}
        <div class="inbox-item-date">${dateStr}</div>
      </div>`;
    }).join('');

    // 받기 버튼 이벤트
    wrap.querySelectorAll('.inbox-claim-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = '처리 중...';
        try {
          const idToken = await user.getIdToken();
          const res = await fetch('/api/claim-reward', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId: btn.dataset.id, messageType: btn.dataset.type }),
          });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || '처리 실패');

          showToast(`🎉 +${data.rewardAmount}P 지급됐습니다!`, 'success');

          // 버튼 → 수령 완료로 교체
          btn.closest('.inbox-reward').innerHTML = '<span class="inbox-claimed-badge">✅ 수령 완료</span>';
          btn.closest('.inbox-item').classList.remove('inbox-item-new');

          // freePoints 표시 업데이트
          const fpEl = document.getElementById('stat-free-points');
          if (fpEl) fpEl.textContent = data.newFreePoints;

          // 뱃지 감소
          const b = document.getElementById('inbox-badge');
          const cur = parseInt(b.textContent) - 1;
          if (cur <= 0) b.style.display = 'none';
          else b.textContent = cur;
        } catch (e) {
          showToast(e.message || '처리 실패', 'error');
          btn.disabled = false;
          btn.textContent = `🎁 +${btn.dataset.amount}P 받기`;
        }
      });
    });
  } catch (e) {
    wrap.innerHTML = '<div style="color:var(--text-muted);font-size:14px;text-align:center;padding:20px 0">불러오기 실패</div>';
  }
}

// ─── 결제 내역 ───
async function renderPaymentHistory(user) {
  const wrap = document.getElementById('payment-history-list');
  try {
    const idToken = await user.getIdToken();
    const res = await fetch(`/api/payment-history?token=${idToken}`);
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error);

    if (!data.payments?.length) {
      wrap.innerHTML = '<div style="color:var(--text-muted);font-size:14px;text-align:center;padding:20px 0">결제 내역이 없습니다.</div>';
      return;
    }

    wrap.innerHTML = data.payments.map(p => {
      const date = new Date(p.processedAt);
      const dateStr = `${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')}`;
      const amountStr = p.amount ? p.amount.toLocaleString() + '원' : '-';
      return `<div class="payment-item">
        <div class="payment-item-left">
          <div class="payment-item-credits">⚡ ${p.credits}문제 충전</div>
          <div class="payment-item-date">${dateStr}</div>
        </div>
        <div class="payment-item-amount">${amountStr}</div>
      </div>`;
    }).join('');
  } catch {
    wrap.innerHTML = '<div style="color:var(--text-muted);font-size:14px;text-align:center;padding:20px 0">불러오기 실패</div>';
  }
}

// ─── 북마크 ───
async function renderBookmarks() {
  const wrap = document.getElementById('bookmarks-list');
  const BOOKMARK_KEY = 'gwatop_bookmarks';
  let bookmarkIds = [];
  try { bookmarkIds = JSON.parse(localStorage.getItem(BOOKMARK_KEY) || '[]'); } catch { bookmarkIds = []; }

  if (!bookmarkIds.length) {
    wrap.innerHTML = '<div style="color:var(--text-muted);font-size:14px;text-align:center;padding:20px 0">저장한 게시글이 없습니다.</div>';
    return;
  }

  try {
    const ids = bookmarkIds.slice(0, 10);
    const docs = await Promise.all(ids.map(id => getDoc(doc(db, 'community_posts', id))));
    const valid = docs.filter(d => d.exists());
    if (!valid.length) {
      wrap.innerHTML = '<div style="color:var(--text-muted);font-size:14px;text-align:center;padding:20px 0">저장한 게시글이 없습니다.</div>';
      return;
    }
    wrap.innerHTML = valid.map(d => {
      const p = d.data();
      const title = p.title || '(제목 없음)';
      const likes = p.likes || 0;
      const comments = p.commentCount || 0;
      const ago = timeAgo(p.createdAt);
      return `<div class="post-item" onclick="location.href='/post.html?id=${d.id}'">
        <div class="post-item-title">${escapeHtml(title)}</div>
        <div class="post-item-meta">
          <span>❤️ ${likes}</span>
          <span>💬 ${comments}</span>
          <span>${ago}</span>
        </div>
      </div>`;
    }).join('');
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
    // 비익명 게시글 닉네임 일괄 업데이트
    try {
      const postsSnap = await getDocs(
        query(collection(db, 'community_posts'), where('uid', '==', currentUser.uid), where('isAnonymous', '==', false))
      );
      if (!postsSnap.empty) {
        const batch = writeBatch(db);
        postsSnap.docs.forEach(d => batch.update(d.ref, { nickname: newNick }));
        await batch.commit();
      }
    } catch { /* 게시글 업데이트 실패해도 닉네임 변경은 성공 */ }
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
    renderInbox(user),
    renderMyPosts(user),
    renderBookmarks(),
    renderPaymentHistory(user),
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
