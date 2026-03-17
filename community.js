// ============================================================
// GWATOP - Community Page Logic v1.0.0
// ============================================================

import { signInWithGoogle, signInWithKakao, signInWithNaver, logOut, onUserChange } from './auth.js';
import { checkAndShowNicknameModal } from './nickname.js';
import { db } from './auth.js';
import {
  collection, doc, addDoc, getDocs, updateDoc,
  query, orderBy, limit, startAfter, increment,
  arrayUnion, arrayRemove, serverTimestamp, where
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ─── Universities ───
const UNIVERSITIES = [
  '가톨릭관동대학교','가톨릭대학교','강원대학교','건국대학교','경기대학교',
  '경북대학교','경상국립대학교','경성대학교','경희대학교','계명대학교',
  '고려대학교','광운대학교','광주과학기술원(GIST)','국민대학교','군산대학교',
  '단국대학교','대구경북과학기술원(DGIST)','덕성여자대학교','동국대학교',
  '동덕여자대학교','동아대학교','명지대학교','목포대학교','부경대학교',
  '부산대학교','부산외국어대학교','삼육대학교','상명대학교','서강대학교',
  '서울과학기술대학교','서울대학교','서울시립대학교','서울여자대학교',
  '성균관대학교','성신여자대학교','세종대학교','순천대학교','숙명여자대학교',
  '숭실대학교','아주대학교','안동대학교','연세대학교','영남대학교',
  '원광대학교','울산과학기술원(UNIST)','이화여자대학교','인천대학교',
  '인하대학교','전남대학교','전북대학교','제주대학교','조선대학교',
  '중앙대학교','창원대학교','충남대학교','충북대학교','포항공과대학교(POSTECH)',
  '한국과학기술원(KAIST)','한국교원대학교','한국기술교육대학교','한국외국어대학교',
  '한국항공대학교','한림대학교','한밭대학교','한성대학교','한양대학교',
  '홍익대학교','기타'
];

// ─── State ───
let currentUser = null;
let currentUserData = null;
let lastVisible = null;
let isLoading = false;
let hasMore = true;
let currentSort = 'latest';
let filterMyUniv = false;
let writeUni = '';

// ─── Init ───
async function init() {
  setupNav();
  setupFilters();
  setupWriteModal();
  setupLoginModal();
  loadPosts(true);
}

// ─── Nav ───
function setupNav() {
  document.getElementById('nav-login-btn')?.addEventListener('click', openLoginModal);
  document.getElementById('nav-logout-btn')?.addEventListener('click', () => logOut());

  onUserChange((user, userData) => {
    currentUser = user;
    currentUserData = userData;
    const lo = document.getElementById('nav-auth-logged-out');
    const li = document.getElementById('nav-auth-logged-in');
    if (user) {
      lo.style.display = 'none';
      li.style.display = 'flex';
      document.getElementById('nav-avatar').src = user.photoURL || '';
      document.getElementById('nav-username').textContent = userData?.nickname || user.displayName || '';
      document.getElementById('nav-credits').textContent = userData?.credits ?? 0;
    } else {
      lo.style.display = '';
      li.style.display = 'none';
    }
    checkAndShowNicknameModal(user, userData);
  });
}

// ─── Filters & Sort ───
function setupFilters() {
  document.getElementById('filter-all').addEventListener('click', () => {
    filterMyUniv = false;
    document.getElementById('filter-all').className = 'filter-btn active';
    document.getElementById('filter-my').className = 'filter-btn';
    loadPosts(true);
  });
  document.getElementById('filter-my').addEventListener('click', () => {
    if (!currentUser) { openLoginModal(); return; }
    filterMyUniv = true;
    document.getElementById('filter-all').className = 'filter-btn';
    document.getElementById('filter-my').className = 'filter-btn active';
    loadPosts(true);
  });
  document.getElementById('sort-latest').addEventListener('click', () => {
    currentSort = 'latest';
    document.getElementById('sort-latest').className = 'sort-btn active';
    document.getElementById('sort-popular').className = 'sort-btn';
    loadPosts(true);
  });
  document.getElementById('sort-popular').addEventListener('click', () => {
    currentSort = 'popular';
    document.getElementById('sort-latest').className = 'sort-btn';
    document.getElementById('sort-popular').className = 'sort-btn active';
    loadPosts(true);
  });
  document.getElementById('load-more-btn').addEventListener('click', () => loadPosts(false));
}

// ─── Load Posts ───
async function loadPosts(reset = false) {
  if (isLoading) return;
  if (!hasMore && !reset) return;

  isLoading = true;
  const feed = document.getElementById('posts-feed');
  const emptyEl = document.getElementById('posts-empty');
  const loadMoreBtn = document.getElementById('load-more-btn');

  if (reset) {
    lastVisible = null;
    hasMore = true;
    feed.innerHTML = `
      <div class="post-skeleton"></div>
      <div class="post-skeleton"></div>
      <div class="post-skeleton"></div>`;
    emptyEl.style.display = 'none';
    loadMoreBtn.style.display = 'none';
  }

  try {
    const postsRef = collection(db, 'community_posts');
    const sortField = currentSort === 'popular' ? 'likes' : 'createdAt';
    let myUni = null;
    if (filterMyUniv && currentUser) {
      myUni = currentUserData?.university || localStorage.getItem(`gwatop_uni_${currentUser.uid}`);
    }

    let q;
    if (myUni) {
      q = lastVisible
        ? query(postsRef, where('university', '==', myUni), orderBy(sortField, 'desc'), startAfter(lastVisible), limit(20))
        : query(postsRef, where('university', '==', myUni), orderBy(sortField, 'desc'), limit(20));
    } else {
      q = lastVisible
        ? query(postsRef, orderBy(sortField, 'desc'), startAfter(lastVisible), limit(20))
        : query(postsRef, orderBy(sortField, 'desc'), limit(20));
    }

    const snap = await getDocs(q);
    if (reset) feed.innerHTML = '';

    if (snap.empty && reset) {
      emptyEl.style.display = '';
    } else {
      snap.docs.forEach(d => renderPostCard({ id: d.id, ...d.data() }));
      if (!snap.empty) lastVisible = snap.docs[snap.docs.length - 1];
    }

    hasMore = snap.docs.length === 20;
    loadMoreBtn.style.display = hasMore ? '' : 'none';
  } catch (e) {
    if (reset) feed.innerHTML = '';
    console.error('loadPosts:', e);
    if (String(e.message).includes('index') || String(e.code).includes('failed-precondition')) {
      showToast('학교 필터 인덱스가 필요합니다. 잠시 후 다시 시도해주세요.', 'error');
      filterMyUniv = false;
      document.getElementById('filter-all').className = 'filter-btn active';
      document.getElementById('filter-my').className = 'filter-btn';
      loadPosts(true);
    } else {
      showToast('게시글을 불러오지 못했습니다.', 'error');
    }
  } finally {
    isLoading = false;
  }
}

// ─── Render Post Card ───
function renderPostCard(post) {
  const feed = document.getElementById('posts-feed');
  const card = document.createElement('article');
  card.className = 'post-card';
  card.dataset.id = post.id;

  const isLiked = currentUser && Array.isArray(post.likedBy) && post.likedBy.includes(currentUser.uid);
  const isMine = currentUser?.uid === post.uid;
  const displayName = post.isAnonymous ? '익명' : (post.nickname || '알 수 없음');
  const avatarColor = post.isAnonymous ? '#374151' : getAvatarColor(post.uid || displayName);
  const avatarChar = post.isAnonymous ? '?' : displayName[0];

  card.innerHTML = `
    <div class="post-header">
      <div class="post-author-row">
        <div class="post-avatar" style="background:${avatarColor}">${escapeHtml(avatarChar)}</div>
        <div>
          <span class="post-author-name">${escapeHtml(displayName)}</span>
          <span class="post-uni-badge">${escapeHtml(post.university || '')}</span>
        </div>
      </div>
      <span class="post-time">${timeAgo(post.createdAt)}</span>
    </div>
    <div class="post-content">${formatContent(post.content || '')}</div>
    <div class="post-footer">
      <button class="post-like-btn${isLiked ? ' liked' : ''}" data-id="${post.id}" ${isMine ? 'disabled title="내 글에는 좋아요를 누를 수 없습니다"' : ''}>
        <span class="like-heart">${isLiked ? '❤️' : '🤍'}</span>
        <span class="like-count">${post.likes || 0}</span>
      </button>
      <button class="post-comment-btn" data-id="${post.id}">
        <span>💬</span>
        <span class="comment-count">${post.commentCount || 0}</span>
      </button>
    </div>
    <div class="post-comments" id="comments-${post.id}" style="display:none"></div>
  `;

  card.querySelector('.post-like-btn').addEventListener('click', () => handleLike(post.id, post.uid));
  card.querySelector('.post-comment-btn').addEventListener('click', () => toggleComments(post.id));
  feed.appendChild(card);
}

// ─── Like ───
async function handleLike(postId, authorUid) {
  if (!currentUser) { openLoginModal(); return; }

  const card = document.querySelector(`[data-id="${postId}"]`);
  if (!card) return;
  const btn = card.querySelector('.post-like-btn');
  const heart = btn.querySelector('.like-heart');
  const countEl = btn.querySelector('.like-count');
  const wasLiked = btn.classList.contains('liked');

  // Optimistic update
  btn.classList.toggle('liked');
  const delta = wasLiked ? -1 : 1;
  countEl.textContent = Math.max(0, parseInt(countEl.textContent) + delta);
  heart.textContent = wasLiked ? '🤍' : '❤️';
  btn.style.transform = 'scale(1.3)';
  setTimeout(() => btn.style.transform = '', 200);

  try {
    const postRef = doc(db, 'community_posts', postId);
    if (wasLiked) {
      await updateDoc(postRef, { likes: increment(-1), likedBy: arrayRemove(currentUser.uid) });
      if (authorUid) await updateDoc(doc(db, 'users', authorUid), { credits: increment(-1) });
    } else {
      await updateDoc(postRef, { likes: increment(1), likedBy: arrayUnion(currentUser.uid) });
      if (authorUid) await updateDoc(doc(db, 'users', authorUid), { credits: increment(1) });
    }
  } catch (e) {
    // Revert
    btn.classList.toggle('liked');
    countEl.textContent = Math.max(0, parseInt(countEl.textContent) - delta);
    heart.textContent = wasLiked ? '❤️' : '🤍';
    console.error('like error:', e);
  }
}

// ─── Comments ───
async function toggleComments(postId) {
  const section = document.getElementById(`comments-${postId}`);
  if (!section) return;
  if (section.style.display !== 'none') {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';
  if (section.dataset.loaded) return;
  section.dataset.loaded = '1';
  section.innerHTML = '<div class="comments-loading">댓글 불러오는 중...</div>';
  await renderComments(postId, section);
}

async function renderComments(postId, section) {
  try {
    const snap = await getDocs(
      query(collection(db, 'community_posts', postId, 'comments'), orderBy('createdAt', 'asc'), limit(50))
    );

    let html = '<div class="comments-list">';
    if (snap.empty) {
      html += '<p class="comments-empty">첫 댓글을 남겨보세요!</p>';
    } else {
      snap.docs.forEach(d => {
        const c = d.data();
        const name = c.isAnonymous ? '익명' : (c.nickname || '알 수 없음');
        const clr = c.isAnonymous ? '#374151' : getAvatarColor(c.uid || name);
        html += `
          <div class="comment-item">
            <div class="comment-avatar" style="background:${clr}">${c.isAnonymous ? '?' : escapeHtml(name[0])}</div>
            <div class="comment-body">
              <div class="comment-meta">
                <span class="comment-author">${escapeHtml(name)}</span>
                <span class="comment-uni">${escapeHtml(c.university || '')}</span>
                <span class="comment-time">${timeAgo(c.createdAt)}</span>
              </div>
              <div class="comment-text">${formatContent(c.content || '')}</div>
            </div>
          </div>`;
      });
    }
    html += '</div>';

    if (currentUser) {
      html += `
        <div class="comment-input-wrap">
          <label class="comment-anon-label"><input type="checkbox" class="comment-anon-cb"> 익명</label>
          <input type="text" class="comment-input-field" placeholder="댓글을 입력하세요..." maxlength="300" />
          <button class="btn btn-primary btn-sm comment-send-btn">전송</button>
        </div>`;
    } else {
      html += `<div class="comments-login"><button class="btn btn-glass btn-sm comment-login-btn">로그인 후 댓글 달기</button></div>`;
    }

    section.innerHTML = html;

    if (currentUser) {
      const input = section.querySelector('.comment-input-field');
      const sendBtn = section.querySelector('.comment-send-btn');
      const anonCb = section.querySelector('.comment-anon-cb');
      const submit = async () => {
        const text = input.value.trim();
        if (!text) return;
        sendBtn.disabled = true;
        await submitComment(postId, text, anonCb.checked, section);
        input.value = '';
        sendBtn.disabled = false;
        input.focus();
      };
      sendBtn.addEventListener('click', submit);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    } else {
      section.querySelector('.comment-login-btn')?.addEventListener('click', openLoginModal);
    }
  } catch (e) {
    section.innerHTML = '<p class="comments-error">댓글을 불러오지 못했습니다.</p>';
    console.error('renderComments:', e);
  }
}

async function submitComment(postId, content, isAnonymous, section) {
  if (!currentUser) return;
  const university = currentUserData?.university || localStorage.getItem(`gwatop_uni_${currentUser.uid}`) || '';
  try {
    await addDoc(collection(db, 'community_posts', postId, 'comments'), {
      uid: currentUser.uid,
      isAnonymous,
      nickname: currentUserData?.nickname || currentUser.displayName || '',
      university,
      content,
      createdAt: serverTimestamp()
    });
    await updateDoc(doc(db, 'community_posts', postId), { commentCount: increment(1) });
    const card = document.querySelector(`[data-id="${postId}"]`);
    if (card) {
      const el = card.querySelector('.comment-count');
      if (el) el.textContent = parseInt(el.textContent) + 1;
    }
    section.dataset.loaded = '';
    await renderComments(postId, section);
  } catch (e) {
    showToast('댓글 등록 실패', 'error');
  }
}

// ─── Write Modal ───
function setupWriteModal() {
  document.getElementById('write-fab').addEventListener('click', () => {
    if (!currentUser) { openLoginModal(); return; }
    openWriteModal();
  });

  document.getElementById('write-modal-close').addEventListener('click', closeWriteModal);
  document.getElementById('write-modal-cancel').addEventListener('click', closeWriteModal);
  document.getElementById('write-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('write-modal')) closeWriteModal();
  });

  document.getElementById('write-modal-submit').addEventListener('click', submitPost);

  document.getElementById('post-content').addEventListener('input', () => {
    const len = document.getElementById('post-content').value.length;
    document.getElementById('post-char-count').textContent = `${len} / 1000`;
  });

  // Anonymous toggle
  const cb = document.getElementById('anon-toggle');
  const track = document.getElementById('toggle-track');
  const thumb = document.getElementById('toggle-thumb');
  cb.addEventListener('change', () => {
    track.style.background = cb.checked ? '#7c3aed' : 'var(--glass-border)';
    thumb.style.left = cb.checked ? '22px' : '2px';
  });

  setupUniversitySearch();
}

function openWriteModal() {
  const savedUni = currentUserData?.university || localStorage.getItem(`gwatop_uni_${currentUser?.uid}`) || '';
  writeUni = savedUni;
  document.getElementById('uni-search-input').value = savedUni;
  document.getElementById('uni-hidden-val').value = savedUni;
  document.getElementById('post-content').value = '';
  document.getElementById('post-char-count').textContent = '0 / 1000';
  document.getElementById('anon-toggle').checked = false;
  document.getElementById('toggle-track').style.background = 'var(--glass-border)';
  document.getElementById('toggle-thumb').style.left = '2px';
  document.getElementById('write-modal').classList.add('visible');
  setTimeout(() => document.getElementById('post-content').focus(), 120);
}

function closeWriteModal() {
  document.getElementById('write-modal').classList.remove('visible');
}

async function submitPost() {
  const content = document.getElementById('post-content').value.trim();
  const university = document.getElementById('uni-hidden-val').value || writeUni;
  const isAnonymous = document.getElementById('anon-toggle').checked;
  const btn = document.getElementById('write-modal-submit');

  if (!content || content.length < 5) { showToast('내용을 5자 이상 입력해주세요.', 'error'); return; }
  if (!university) { showToast('학교를 선택해주세요.', 'error'); return; }
  if (!currentUser || !currentUserData) { openLoginModal(); return; }

  btn.disabled = true;
  btn.textContent = '게시 중...';

  try {
    await addDoc(collection(db, 'community_posts'), {
      uid: currentUser.uid,
      isAnonymous,
      nickname: currentUserData?.nickname || currentUser.displayName || '',
      university,
      content,
      likes: 0,
      likedBy: [],
      commentCount: 0,
      createdAt: serverTimestamp()
    });

    if (university !== currentUserData?.university) {
      await updateDoc(doc(db, 'users', currentUser.uid), { university });
      localStorage.setItem(`gwatop_uni_${currentUser.uid}`, university);
      if (currentUserData) currentUserData.university = university;
    }

    closeWriteModal();
    showToast('게시글이 등록됐습니다.', 'success');
    loadPosts(true);
  } catch (e) {
    showToast('게시글 등록 실패: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '게시하기';
  }
}

// ─── University Search ───
function setupUniversitySearch() {
  const input = document.getElementById('uni-search-input');
  const list = document.getElementById('uni-options');
  const hidden = document.getElementById('uni-hidden-val');

  function render(filter) {
    const matches = UNIVERSITIES.filter(u => u.includes(filter));
    list.innerHTML = matches.map(u => `<li class="uni-opt-item">${escapeHtml(u)}</li>`).join('');
    list.style.display = matches.length ? '' : 'none';
  }

  input.addEventListener('focus', () => render(input.value));
  input.addEventListener('input', () => {
    writeUni = '';
    hidden.value = '';
    render(input.value);
  });

  list.addEventListener('click', e => {
    const li = e.target.closest('.uni-opt-item');
    if (!li) return;
    const val = li.textContent;
    writeUni = val;
    hidden.value = val;
    input.value = val;
    list.style.display = 'none';
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#uni-search-input') && !e.target.closest('#uni-options'))
      list.style.display = 'none';
  });
}

// ─── Login Modal ───
function setupLoginModal() {
  document.getElementById('modal-login-google')?.addEventListener('click', () => { closeLoginModal(); signInWithGoogle(); });
  document.getElementById('modal-login-kakao')?.addEventListener('click', () => { closeLoginModal(); signInWithKakao(); });
  document.getElementById('modal-login-naver')?.addEventListener('click', () => { closeLoginModal(); signInWithNaver(); });
  document.getElementById('modal-close-btn')?.addEventListener('click', closeLoginModal);
  document.getElementById('login-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('login-modal')) closeLoginModal();
  });
}

function openLoginModal() { document.getElementById('login-modal')?.classList.add('visible'); }
function closeLoginModal() { document.getElementById('login-modal')?.classList.remove('visible'); }

// ─── Utils ───
function timeAgo(ts) {
  if (!ts) return '';
  const date = ts?.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatContent(str) {
  return escapeHtml(str).replace(/\n/g, '<br>');
}

function getAvatarColor(seed) {
  const palette = ['#7c3aed','#2563eb','#0891b2','#059669','#d97706','#dc2626','#db2777','#65a30d'];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

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

init();
