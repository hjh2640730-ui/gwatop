// ============================================================
// GWATOP - Community Page Logic v3.1.0
// ============================================================

// ─── Algolia 검색 설정 ───
const ALGOLIA_APP_ID = 'THOWOPCXWC';
const ALGOLIA_SEARCH_KEY = 'f926a04651ab3a962b0367c3dcdf5290';
const ALGOLIA_INDEX = 'posts';

import { signInWithGoogle, signInWithKakao, signInWithNaver, logOut, onUserChange } from './auth.js';
import { checkAndShowNicknameModal } from './nickname.js';
import { db, app } from './auth.js';
import {
  collection, doc, getDoc, addDoc, getDocs, updateDoc,
  query, orderBy, where, limit, startAfter,
  serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject
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
let currentSort = 'latest';
let selectedImageFile = null;
let pendingImageUrl = null; // 업로드됐지만 게시글에 아직 저장 안 된 이미지 URL
let postRenderCount = 0;
let authInitialized = false;
let likedPostIds = new Set(); // post_likes 컬렉션에서 로드
let pageStartCursors = [null]; // [0]=null(pg1 start), [n]=lastDoc of page n → start of page n+1
let currentPagePosts = [];
let hasNextPage = false;
let isSearchMode = false;
let searchAllPosts = [];
let filteredPosts = [];
let currentPage = 1;
let searchLoading = false;
const POSTS_PER_PAGE = 10;

// ─── Init ───
async function init() {
  setupNav();
  setupFilters();
  setupUniversityModal();
  setupWriteModal();
  setupLoginModal();
  setupSearch();
  loadAllPosts();
}

// ─── Nav ───
function setupNav() {
  document.getElementById('nav-login-btn')?.addEventListener('click', openLoginModal);
  document.getElementById('nav-logout-btn')?.addEventListener('click', () => logOut());

  onUserChange(async (user, userData) => {
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
      await loadLikesForPosts(currentPagePosts.map(p => p.id));
      updateRenderedLikeStates();
    } else {
      lo.style.display = '';
      li.style.display = 'none';
      likedPostIds = new Set();
      updateRenderedLikeStates();
    }
    checkAndShowNicknameModal(user, userData);
    checkAndShowUniversityModal(user, userData);
    if (authInitialized) loadAllPosts();
    authInitialized = true;
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
    if (isSearchMode) {
      isSearchMode = false; searchAllPosts = []; filteredPosts = [];
      document.getElementById('community-search').value = '';
    }
    loadAllPosts();
  });
  document.getElementById('sort-popular').addEventListener('click', () => {
    currentSort = 'popular';
    document.getElementById('sort-latest').className = 'sort-btn';
    document.getElementById('sort-popular').className = 'sort-btn active';
    if (isSearchMode) {
      isSearchMode = false; searchAllPosts = []; filteredPosts = [];
      document.getElementById('community-search').value = '';
    }
    loadAllPosts();
  });
}

// ─── 현재 페이지 게시물 좋아요 상태만 조회 (직접 문서 ID 조회, 인덱스 불필요) ───
async function loadLikesForPosts(postIds) {
  if (!currentUser || !postIds.length) return;
  try {
    const snaps = await Promise.all(
      postIds.map(id => getDoc(doc(db, 'post_likes', `${id}_${currentUser.uid}`)))
    );
    snaps.forEach((snap, i) => {
      if (snap.exists()) likedPostIds.add(postIds[i]);
      else likedPostIds.delete(postIds[i]);
    });
  } catch (e) {
    console.error('loadLikesForPosts:', e);
  }
}

// ─── 이미 렌더된 카드의 하트 상태 동기화 ───
function updateRenderedLikeStates() {
  document.querySelectorAll('.post-card[data-id]').forEach(card => {
    const postId = card.dataset.id;
    const btn = card.querySelector('.post-like-btn');
    if (!btn || btn.hasAttribute('disabled')) return;
    const isLiked = likedPostIds.has(postId);
    btn.classList.toggle('liked', isLiked);
    const heart = btn.querySelector('.like-heart');
    if (heart) heart.textContent = isLiked ? '❤️' : '🤍';
  });
}

// ─── Load All Posts (정렬 변경/게시 후 상태 초기화) ───
async function loadAllPosts() {
  pageStartCursors = [null];
  hasNextPage = false;
  currentPagePosts = [];
  currentPage = 1;
  const searchVal = document.getElementById('community-search')?.value.trim() || '';
  if (isSearchMode && searchVal) {
    searchAllPosts = [];
    await loadPostsForSearch(searchVal);
  } else {
    isSearchMode = false;
    searchAllPosts = [];
    filteredPosts = [];
    await loadPage(1);
  }
}

// ─── Cursor-based Firestore Pagination ───
async function loadPage(pageNum) {
  const feed = document.getElementById('posts-feed');
  const emptyEl = document.getElementById('posts-empty');
  feed.innerHTML = `
    <div class="post-skeleton"></div>
    <div class="post-skeleton"></div>
    <div class="post-skeleton"></div>`;
  emptyEl.style.display = 'none';
  document.getElementById('pagination-wrap').innerHTML = '';

  try {
    const postsRef = collection(db, 'community_posts');
    const sortField = currentSort === 'popular' ? 'likes' : 'createdAt';
    const cursor = pageStartCursors[pageNum - 1];
    const q = cursor
      ? query(postsRef, orderBy(sortField, 'desc'), startAfter(cursor), limit(POSTS_PER_PAGE + 1))
      : query(postsRef, orderBy(sortField, 'desc'), limit(POSTS_PER_PAGE + 1));

    const snap = await getDocs(q);
    const docs = snap.docs;
    hasNextPage = docs.length > POSTS_PER_PAGE;
    const pageDocs = docs.slice(0, POSTS_PER_PAGE);

    if (hasNextPage && pageDocs.length > 0 && !pageStartCursors[pageNum]) {
      pageStartCursors[pageNum] = pageDocs[pageDocs.length - 1];
    }

    currentPage = pageNum;
    currentPagePosts = pageDocs.map(d => ({ id: d.id, ...d.data() }));
    await loadLikesForPosts(currentPagePosts.map(p => p.id));
    renderCurrentPage();
  } catch (e) {
    feed.innerHTML = '';
    console.error('loadPage:', e);
    showToast('게시글을 불러오지 못했습니다.', 'error');
  }
}

// ─── Load Posts for Search (Algolia 전문 검색) ───
async function loadPostsForSearch(searchQuery) {
  if (searchLoading) return;
  searchLoading = true;
  const feed = document.getElementById('posts-feed');
  feed.innerHTML = `
    <div class="post-skeleton"></div>
    <div class="post-skeleton"></div>
    <div class="post-skeleton"></div>`;
  document.getElementById('posts-empty').style.display = 'none';
  document.getElementById('pagination-wrap').innerHTML = '';
  try {
    const res = await fetch(
      `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`,
      {
        method: 'POST',
        headers: {
          'X-Algolia-Application-Id': ALGOLIA_APP_ID,
          'X-Algolia-API-Key': ALGOLIA_SEARCH_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: searchQuery, hitsPerPage: 50 }),
      }
    );
    if (!res.ok) throw new Error('Algolia 검색 실패');
    const data = await res.json();
    searchAllPosts = (data.hits || []).map(hit => ({
      id: hit.objectID,
      title: hit.title,
      content: hit.content,
      nickname: hit.nickname,
      university: hit.university,
      uid: hit.uid,
      isAnonymous: hit.isAnonymous,
      createdAt: { seconds: Math.floor((hit.createdAt || Date.now()) / 1000) },
      likes: hit.likes || 0,
      commentCount: hit.commentCount || 0,
      imageUrl: hit.imageUrl || '',
    }));
    filteredPosts = searchAllPosts;
    isSearchMode = true;
    renderSearchPage(1);
  } catch (e) {
    feed.innerHTML = '';
    showToast('검색 중 오류가 발생했습니다.', 'error');
  } finally {
    searchLoading = false;
  }
}

// ─── Apply Search Filter ───
function applySearchFilter(searchQuery) {
  const q = searchQuery.toLowerCase();
  filteredPosts = searchAllPosts.filter(p =>
    (p.title || '').toLowerCase().includes(q) ||
    (p.content || '').toLowerCase().includes(q) ||
    (p.nickname || '').toLowerCase().includes(q)
  );
  renderSearchPage(1);
}

// ─── Apply Search (입력 이벤트에서 호출) ───
function applySearch() {
  const q = document.getElementById('community-search')?.value.trim().toLowerCase() || '';
  if (!q) {
    if (isSearchMode) {
      isSearchMode = false;
      searchAllPosts = [];
      filteredPosts = [];
      loadPage(1);
    }
    return;
  }
  if (!isSearchMode || searchAllPosts.length === 0) {
    loadPostsForSearch(q);
  } else {
    applySearchFilter(q);
  }
}

// ─── Render Current Page (일반 모드) ───
function renderCurrentPage() {
  const feed = document.getElementById('posts-feed');
  const emptyEl = document.getElementById('posts-empty');
  feed.innerHTML = '';
  postRenderCount = 0;

  if (currentPagePosts.length === 0) {
    emptyEl.style.display = '';
    document.getElementById('pagination-wrap').innerHTML = '';
    return;
  }
  emptyEl.style.display = 'none';
  currentPagePosts.forEach(post => {
    renderPostCard(post);
    postRenderCount++;
    if (postRenderCount % 5 === 0) renderAdSlot();
  });
  renderCursorPagination();
}

// ─── Render Search Results Page ───
async function renderSearchPage(page) {
  currentPage = page;
  const feed = document.getElementById('posts-feed');
  const emptyEl = document.getElementById('posts-empty');
  feed.innerHTML = '';
  postRenderCount = 0;

  if (filteredPosts.length === 0) {
    emptyEl.style.display = '';
    document.getElementById('pagination-wrap').innerHTML = '';
    return;
  }
  emptyEl.style.display = 'none';
  const start = (page - 1) * POSTS_PER_PAGE;
  const pagePosts = filteredPosts.slice(start, start + POSTS_PER_PAGE);
  await loadLikesForPosts(pagePosts.map(p => p.id));
  pagePosts.forEach(post => {
    renderPostCard(post);
    postRenderCount++;
    if (postRenderCount % 5 === 0) renderAdSlot();
  });
  renderSearchPagination();
}

// ─── Cursor Pagination (일반 모드) ───
function renderCursorPagination() {
  const wrap = document.getElementById('pagination-wrap');
  if (!wrap) return;
  const knownPages = pageStartCursors.length; // 1..knownPages 접근 가능
  if (knownPages <= 1 && !hasNextPage) { wrap.innerHTML = ''; return; }

  let html = `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-action="prev">‹</button>`;
  for (let i = 1; i <= knownPages; i++) {
    html += `<button class="page-btn${i === currentPage ? ' active' : ''}" data-page="${i}">${i}</button>`;
  }
  if (hasNextPage) html += `<span class="page-ellipsis">···</span>`;
  html += `<button class="page-btn" ${!hasNextPage ? 'disabled' : ''} data-action="next">›</button>`;

  wrap.innerHTML = html;
  wrap.querySelector('[data-action="prev"]')?.addEventListener('click', () => {
    if (currentPage > 1) { window.scrollTo({ top: 0, behavior: 'smooth' }); loadPage(currentPage - 1); }
  });
  wrap.querySelector('[data-action="next"]')?.addEventListener('click', () => {
    if (hasNextPage) { window.scrollTo({ top: 0, behavior: 'smooth' }); loadPage(currentPage + 1); }
  });
  wrap.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page);
      if (p !== currentPage) { window.scrollTo({ top: 0, behavior: 'smooth' }); loadPage(p); }
    });
  });
}

// ─── Search Pagination ───
function renderSearchPagination() {
  const wrap = document.getElementById('pagination-wrap');
  if (!wrap) return;
  const totalPages = Math.ceil(filteredPosts.length / POSTS_PER_PAGE);
  if (totalPages <= 1) { wrap.innerHTML = ''; return; }

  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('…');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('…');
    pages.push(totalPages);
  }

  let html = `<button class="page-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>‹</button>`;
  pages.forEach(p => {
    if (p === '…') html += `<span class="page-ellipsis">···</span>`;
    else html += `<button class="page-btn${p === currentPage ? ' active' : ''}" data-page="${p}">${p}</button>`;
  });
  html += `<button class="page-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>›</button>`;

  wrap.innerHTML = html;
  wrap.querySelectorAll('.page-btn[data-page]:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      renderSearchPage(parseInt(btn.dataset.page));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

// ─── Setup Search (300ms 디바운스) ───
function setupSearch() {
  let debounceTimer;
  document.getElementById('community-search')?.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applySearch, 300);
  });
}

// ─── Render Ad Slot ───
function renderAdSlot() {
  const feed = document.getElementById('posts-feed');
  const slot = document.createElement('div');
  slot.className = 'feed-banner';
  slot.style.cssText = 'position:relative;background:rgba(255,255,255,0.04);border:1px dashed rgba(255,255,255,0.35);border-radius:24px;margin-bottom:12px;min-height:90px;display:flex;align-items:center;justify-content:center;overflow:hidden;';
  slot.innerHTML = `
    <!-- TODO: AdSense 코드를 아래에 삽입하세요 -->
    <div class="feed-banner-inner"></div>
  `;
  feed.appendChild(slot);
}

// ─── Render Post Card ───
function renderPostCard(post) {
  const feed = document.getElementById('posts-feed');
  const card = document.createElement('article');
  card.className = 'post-card';
  card.dataset.id = post.id;
  card.style.cursor = 'pointer';

  const isLiked = currentUser && likedPostIds.has(post.id);
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
      ${post.imageUrl?.startsWith('https://') ? `<img class="post-card-thumb" src="${escapeHtml(post.imageUrl)}" alt="이미지" loading="lazy" />` : ''}
    </div>
    <div class="post-footer">
      <button class="post-like-btn${isLiked ? ' liked' : ''}" data-id="${post.id}" ${isMine ? 'disabled title="내 글에는 좋아요를 누를 수 없습니다"' : ''}>
        <span class="like-heart">${isLiked ? '❤️' : '🤍'}</span>
        <span class="like-count">${likeCount}</span>
        ${likeCount >= 5 ? '<span class="like-maxed">MAX</span>' : ''}
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

// ─── Like (서버 트랜잭션으로 처리) ───
async function handleLike(postId, authorUid) {
  if (!currentUser) { openLoginModal(); return; }

  const card = document.querySelector(`[data-id="${postId}"]`);
  if (!card) return;
  const btn = card.querySelector('.post-like-btn');
  const heart = btn.querySelector('.like-heart');
  const countEl = btn.querySelector('.like-count');
  const wasLiked = btn.classList.contains('liked');
  const beforeCount = parseInt(countEl.textContent) || 0;

  // Optimistic UI
  btn.disabled = true;
  btn.classList.toggle('liked', !wasLiked);
  const newCount = wasLiked ? Math.max(0, beforeCount - 1) : beforeCount + 1;
  countEl.textContent = newCount;
  heart.textContent = wasLiked ? '🤍' : '❤️';
  const existingMax = btn.querySelector('.like-maxed');
  if (existingMax) existingMax.remove();
  if (newCount >= 5) {
    const span = document.createElement('span');
    span.className = 'like-maxed';
    span.textContent = 'MAX';
    btn.appendChild(span);
  }
  btn.style.transform = 'scale(1.3)';
  setTimeout(() => btn.style.transform = '', 200);

  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/like-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
      body: JSON.stringify({ postId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '좋아요 처리 실패');
    }
    const { liked, likes } = await res.json();

    // 서버 응답으로 실제 상태 동기화
    btn.classList.toggle('liked', liked);
    heart.textContent = liked ? '❤️' : '🤍';
    countEl.textContent = likes;
    if (liked) likedPostIds.add(postId); else likedPostIds.delete(postId);
    const maxEl = btn.querySelector('.like-maxed');
    if (maxEl) maxEl.remove();
    if (likes >= 5) {
      const span = document.createElement('span');
      span.className = 'like-maxed';
      span.textContent = 'MAX';
      btn.appendChild(span);
    }
  } catch (e) {
    // Revert
    btn.classList.toggle('liked', wasLiked);
    heart.textContent = wasLiked ? '❤️' : '🤍';
    countEl.textContent = beforeCount;
    const maxEl = btn.querySelector('.like-maxed');
    if (maxEl) maxEl.remove();
    if (beforeCount >= 5) {
      const span = document.createElement('span');
      span.className = 'like-maxed';
      span.textContent = 'MAX';
      btn.appendChild(span);
    }
    console.error('like error:', e);
    showToast(e.message || '좋아요 처리 중 오류가 발생했습니다.', 'error');
  } finally {
    btn.disabled = false;
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
  // 업로드됐지만 게시글에 저장 안 된 이미지 삭제
  if (pendingImageUrl) {
    deleteObject(storageRef(storage, pendingImageUrl)).catch(() => {});
    pendingImageUrl = null;
  }
  selectedImageFile = null;
  document.getElementById('post-image-input').value = '';
  document.getElementById('image-preview-wrap').style.display = 'none';
  document.getElementById('write-modal').classList.remove('visible');
}

async function submitPost() {
  const title = document.getElementById('post-title').value.trim();
  const content = document.getElementById('post-content').value.trim();
  const isAnonymous = document.getElementById('anon-toggle').checked;
  const university = currentUserData?.university || localStorage.getItem(`gwatop_uni_${currentUser?.uid}`) || '';
  const btn = document.getElementById('write-modal-submit');

  if (!title) { showToast('제목을 입력해주세요.', 'error'); return; }
  if (!content) { showToast('내용을 입력해주세요.', 'error'); return; }
  if (!university) { showToast('학교를 먼저 설정해주세요.', 'error'); return; }
  if (!currentUser || !currentUserData) { openLoginModal(); return; }

  // 하루 3개 제한
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todaySnap = await getDocs(query(
    collection(db, 'community_posts'),
    where('uid', '==', currentUser.uid),
    where('createdAt', '>=', Timestamp.fromDate(todayStart))
  ));
  if (todaySnap.size >= 3) {
    showToast('하루 최대 3개까지 글을 쓸 수 있습니다.', 'error');
    return;
  }

  btn.disabled = true;

  let imageUrl = null;
  if (selectedImageFile) {
    btn.textContent = '이미지 업로드 중...';
    try {
      imageUrl = await uploadImage(selectedImageFile);
      pendingImageUrl = imageUrl; // 게시글 저장 전까지 추적
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
      titleLower: (title || '').toLowerCase(),
      content,
      likes: 0,
      commentCount: 0,
      anonymousCounter: 0,
      anonymousMap: {},
      createdAt: serverTimestamp()
    };
    if (imageUrl) postData.imageUrl = imageUrl;

    const docRef = await addDoc(collection(db, 'community_posts'), postData);
    pendingImageUrl = null; // 게시글에 정상 저장됨 → 추적 해제
    // Algolia 인덱싱 (백그라운드, 실패해도 게시 성공)
    fetch('/api/index-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await currentUser.getIdToken()}` },
      body: JSON.stringify({
        action: 'add',
        postId: docRef.id,
        post: { ...postData, createdAt: Date.now() },
      }),
    }).catch(() => {});
    closeWriteModal();
    showToast('게시글이 등록됐습니다.', 'success');
    loadAllPosts();
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
