// ============================================================
// GWATOP - Community Page Logic v3.0.0
// ============================================================

import { signInWithGoogle, signInWithKakao, signInWithNaver, logOut, onUserChange } from './auth.js';
import { checkAndShowNicknameModal } from './nickname.js';
import { db, app } from './auth.js';
import {
  collection, doc, addDoc, getDocs, updateDoc,
  query, orderBy, limit, startAfter, increment,
  arrayUnion, arrayRemove, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

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
let selectedImageFile = null;
let postRenderCount = 0;
let postsInitialized = false;

// ─── Init ───
async function init() {
  setupNav();
  setupFilters();
  setupUniversityModal();
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
    checkAndShowUniversityModal(user, userData);
    // Reload posts so liked state is correct after login/logout
    // init()에서 이미 loadPosts(true)를 호출하므로 첫 로드 완료 후에만 재로드
    if (postsInitialized) loadPosts(true);
  });

  // 닉네임 설정 직후 대학 모달 체크
  window.addEventListener('nickname-set', e => {
    if (currentUserData) currentUserData.nickname = e.detail.nickname;
    checkAndShowUniversityModal(currentUser, currentUserData);
  });
}

// ─── University Setup Modal ───
function checkAndShowUniversityModal(user, userData) {
  if (!user) return;
  if (!userData?.nickname) return; // 닉네임 먼저
  if (userData?.university) return; // 이미 설정됨
  document.getElementById('university-setup-modal')?.classList.add('visible');
  setTimeout(() => document.getElementById('setup-uni-search')?.focus(), 150);
}

function setupUniversityModal() {
  const modal = document.getElementById('university-setup-modal');
  const searchInput = document.getElementById('setup-uni-search');
  const optionsList = document.getElementById('setup-uni-options');
  const confirmBtn = document.getElementById('setup-uni-confirm-btn');
  let selectedUni = '';

  function renderOptions(filter) {
    const matches = filter
      ? UNIVERSITIES.filter(u => u.includes(filter))
      : UNIVERSITIES;
    optionsList.innerHTML = matches
      .map(u => `<li class="uni-opt-item">${escapeHtml(u)}</li>`)
      .join('');
    optionsList.style.display = matches.length ? 'block' : 'none';
  }

  searchInput.addEventListener('focus', () => renderOptions(searchInput.value));
  searchInput.addEventListener('input', () => {
    selectedUni = '';
    confirmBtn.disabled = true;
    renderOptions(searchInput.value);
  });
  optionsList.addEventListener('click', e => {
    const li = e.target.closest('.uni-opt-item');
    if (!li) return;
    selectedUni = li.textContent;
    searchInput.value = selectedUni;
    optionsList.style.display = 'none';
    confirmBtn.disabled = false;
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#setup-uni-search') && !e.target.closest('#setup-uni-options'))
      optionsList.style.display = 'none';
  });

  confirmBtn.addEventListener('click', async () => {
    if (!selectedUni || !currentUser) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = '저장 중...';
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), { university: selectedUni });
      localStorage.setItem(`gwatop_uni_${currentUser.uid}`, selectedUni);
      if (currentUserData) currentUserData.university = selectedUni;
      modal.classList.remove('visible');
    } catch (e) {
      showToast('저장 실패. 다시 시도해주세요.', 'error');
      confirmBtn.disabled = false;
      confirmBtn.textContent = '확인';
    }
  });
}

// ─── Sort Filters ───
function setupFilters() {
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
    postRenderCount = 0;
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
    const q = lastVisible
      ? query(postsRef, orderBy(sortField, 'desc'), startAfter(lastVisible), limit(20))
      : query(postsRef, orderBy(sortField, 'desc'), limit(20));

    const snap = await getDocs(q);
    if (reset) feed.innerHTML = '';

    if (snap.empty && reset) {
      emptyEl.style.display = '';
    } else {
      snap.docs.forEach(d => {
        renderPostCard({ id: d.id, ...d.data() });
        postRenderCount++;
        if (postRenderCount % 6 === 0) renderAdSlot();
      });
      if (!snap.empty) lastVisible = snap.docs[snap.docs.length - 1];
    }

    hasMore = snap.docs.length === 20;
    loadMoreBtn.style.display = hasMore ? '' : 'none';
    postsInitialized = true;
  } catch (e) {
    if (reset) feed.innerHTML = '';
    console.error('loadPosts:', e);
    showToast('게시글을 불러오지 못했습니다.', 'error');
  } finally {
    isLoading = false;
  }
}

// ─── Render Ad Slot ───
function renderAdSlot() {
  const feed = document.getElementById('posts-feed');
  const slot = document.createElement('div');
  slot.className = 'ad-slot';
  slot.style.cssText = 'position:relative;background:rgba(124,58,237,0.15);border:2px solid rgba(124,58,237,0.6);border-radius:24px;margin-bottom:12px;min-height:90px;display:flex;align-items:center;justify-content:center;overflow:hidden;';
  slot.innerHTML = `
    <span style="position:absolute;top:6px;left:10px;font-size:10px;font-weight:700;color:#a78bfa;letter-spacing:1px;">AD</span>
    <!-- TODO: AdSense 코드를 아래에 삽입하세요 -->
    <div style="font-size:13px;color:#a78bfa;pointer-events:none;user-select:none;">광고 영역</div>
  `;
  feed.appendChild(slot);
  const rect = slot.getBoundingClientRect();
  console.log('[AD] slot rect:', rect.width, rect.height, rect.top);
}

// ─── Render Post Card ───
function renderPostCard(post) {
  const feed = document.getElementById('posts-feed');
  const card = document.createElement('article');
  card.className = 'post-card';
  card.dataset.id = post.id;
  card.style.cursor = 'pointer';

  const isLiked = currentUser && Array.isArray(post.likedBy) && post.likedBy.includes(currentUser.uid);
  const isMine = currentUser?.uid === post.uid;
  const displayName = post.isAnonymous ? '익명' : (post.nickname || '알 수 없음');
  const avatarColor = post.isAnonymous ? '#374151' : getAvatarColor(post.uid || displayName);
  const avatarChar = post.isAnonymous ? '?' : displayName[0];
  const likeCount = post.likes || 0;

  // Content preview: first 120 chars
  const rawContent = post.content || '';
  const previewText = rawContent.length > 120 ? rawContent.slice(0, 120) + '...' : rawContent;

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
    <div class="post-card-body">
      ${post.title ? `<div class="post-card-title">${escapeHtml(post.title)}</div>` : ''}
      <div class="post-card-preview">${escapeHtml(previewText)}</div>
      ${post.imageUrl ? `<img class="post-card-thumb" src="${escapeHtml(post.imageUrl)}" alt="이미지" loading="lazy" />` : ''}
    </div>
    <div class="post-footer">
      <button class="post-like-btn${isLiked ? ' liked' : ''}" data-id="${post.id}" ${isMine ? 'disabled title="내 글에는 좋아요를 누를 수 없습니다"' : ''}>
        <span class="like-heart">${isLiked ? '❤️' : '🤍'}</span>
        <span class="like-count">${likeCount}</span>
        ${likeCount >= 10 ? '<span class="like-maxed">MAX</span>' : ''}
      </button>
      <span class="post-comment-count-wrap">
        <span>💬</span>
        <span class="comment-count">${post.commentCount || 0}</span>
      </span>
    </div>
  `;

  // Like button: stop propagation so card click doesn't navigate
  card.querySelector('.post-like-btn').addEventListener('click', e => {
    e.stopPropagation();
    handleLike(post.id, post.uid);
  });

  // Card click → navigate to post detail
  card.addEventListener('click', () => {
    window.location.href = `/post.html?id=${post.id}`;
  });

  feed.appendChild(card);
}

// ─── Like (최대 10 크레딧) ───
async function handleLike(postId, authorUid) {
  if (!currentUser) { openLoginModal(); return; }

  const card = document.querySelector(`[data-id="${postId}"]`);
  if (!card) return;
  const btn = card.querySelector('.post-like-btn');
  const heart = btn.querySelector('.like-heart');
  const countEl = btn.querySelector('.like-count');
  const maxedEl = btn.querySelector('.like-maxed');
  const wasLiked = btn.classList.contains('liked');
  const beforeCount = parseInt(countEl.textContent) || 0;

  // Optimistic
  btn.classList.toggle('liked');
  const delta = wasLiked ? -1 : 1;
  const newCount = Math.max(0, beforeCount + delta);
  countEl.textContent = newCount;
  heart.textContent = wasLiked ? '🤍' : '❤️';
  if (maxedEl) maxedEl.remove();
  if (newCount >= 10) {
    const span = document.createElement('span');
    span.className = 'like-maxed';
    span.textContent = 'MAX';
    btn.appendChild(span);
  }
  btn.style.transform = 'scale(1.3)';
  setTimeout(() => btn.style.transform = '', 200);

  try {
    const postRef = doc(db, 'community_posts', postId);
    const giveCredit = authorUid && authorUid !== currentUser.uid;
    if (wasLiked) {
      await updateDoc(postRef, { likes: increment(-1), likedBy: arrayRemove(currentUser.uid) });
      if (giveCredit && beforeCount <= 10) {
        await updateDoc(doc(db, 'users', authorUid), { credits: increment(-1), referralCredits: increment(-1) });
      }
    } else {
      await updateDoc(postRef, { likes: increment(1), likedBy: arrayUnion(currentUser.uid) });
      if (giveCredit && beforeCount < 10) {
        await updateDoc(doc(db, 'users', authorUid), { credits: increment(1), referralCredits: increment(1) });
      }
    }
  } catch (e) {
    // Revert
    btn.classList.toggle('liked');
    countEl.textContent = beforeCount;
    heart.textContent = wasLiked ? '❤️' : '🤍';
    console.error('like error:', e);
  }
}

// ─── Write Modal ───
function setupWriteModal() {
  document.getElementById('write-fab').addEventListener('click', () => {
    if (!currentUser) { openLoginModal(); return; }
    if (!currentUserData?.university) { checkAndShowUniversityModal(currentUser, currentUserData); return; }
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

  // Image upload
  document.getElementById('image-upload-btn').addEventListener('click', () => {
    document.getElementById('post-image-input').click();
  });
  document.getElementById('post-image-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('이미지는 5MB 이하만 가능합니다.', 'error');
      e.target.value = '';
      return;
    }
    selectedImageFile = file;
    const reader = new FileReader();
    reader.onload = ev => {
      document.getElementById('image-preview').src = ev.target.result;
      document.getElementById('image-preview-wrap').style.display = '';
    };
    reader.readAsDataURL(file);
  });
  document.getElementById('image-remove-btn').addEventListener('click', () => {
    selectedImageFile = null;
    document.getElementById('post-image-input').value = '';
    document.getElementById('image-preview-wrap').style.display = 'none';
    document.getElementById('image-preview').src = '';
  });
}

function openWriteModal() {
  const uni = currentUserData?.university || '';
  document.getElementById('write-modal-uni').textContent = uni || '학교 미설정';
  document.getElementById('post-title').value = '';
  document.getElementById('post-content').value = '';
  document.getElementById('post-char-count').textContent = '0 / 1000';
  document.getElementById('anon-toggle').checked = false;
  document.getElementById('toggle-track').style.background = 'var(--glass-border)';
  document.getElementById('toggle-thumb').style.left = '2px';
  selectedImageFile = null;
  document.getElementById('post-image-input').value = '';
  document.getElementById('image-preview-wrap').style.display = 'none';
  document.getElementById('write-modal').classList.add('visible');
  setTimeout(() => document.getElementById('post-title').focus(), 120);
}

function closeWriteModal() {
  document.getElementById('write-modal').classList.remove('visible');
}

async function submitPost() {
  const title = document.getElementById('post-title').value.trim();
  const content = document.getElementById('post-content').value.trim();
  const isAnonymous = document.getElementById('anon-toggle').checked;
  const university = currentUserData?.university || localStorage.getItem(`gwatop_uni_${currentUser?.uid}`) || '';
  const btn = document.getElementById('write-modal-submit');

  if (!content) { showToast('내용을 입력해주세요.', 'error'); return; }
  if (!university) { showToast('학교를 먼저 설정해주세요.', 'error'); return; }
  if (!currentUser || !currentUserData) { openLoginModal(); return; }

  btn.disabled = true;

  let imageUrl = null;
  if (selectedImageFile) {
    btn.textContent = '이미지 업로드 중...';
    try {
      imageUrl = await uploadImage(selectedImageFile);
    } catch (e) {
      showToast('이미지 업로드 실패. 다시 시도해주세요.', 'error');
      btn.disabled = false;
      btn.textContent = '게시하기';
      return;
    }
  }

  btn.textContent = '게시 중...';
  try {
    const postData = {
      uid: currentUser.uid,
      isAnonymous,
      nickname: currentUserData?.nickname || currentUser.displayName || '',
      university,
      title: title || '',
      content,
      likes: 0,
      likedBy: [],
      commentCount: 0,
      anonymousCounter: 0,
      anonymousMap: {},
      createdAt: serverTimestamp()
    };
    if (imageUrl) postData.imageUrl = imageUrl;

    await addDoc(collection(db, 'community_posts'), postData);
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

// ─── Image Upload ───
async function uploadImage(file) {
  const storage = getStorage(app);
  const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
  const path = `community_images/${currentUser.uid}_${Date.now()}.${ext}`;
  const fileRef = storageRef(storage, path);
  await uploadBytes(fileRef, file);
  return await getDownloadURL(fileRef);
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
