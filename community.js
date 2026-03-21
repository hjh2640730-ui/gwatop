// ============================================================
// GWATOP - Community Page Logic v4.0.0
// ============================================================

// ─── Algolia 설정 ───
const ALGOLIA_APP_ID = 'THOWOPCXWC';
const ALGOLIA_SEARCH_KEY = 'f926a04651ab3a962b0367c3dcdf5290';
const ALGOLIA_INDEX = 'posts';

import { signInWithGoogle, signInWithKakao, signInWithNaver, logOut, onUserChange } from './auth.js';
import { checkAndShowNicknameModal } from './nickname.js';
import { db, app } from './auth.js';
import {
  collection, doc, getDoc, addDoc, getDocs, updateDoc,
  query, orderBy, where, limit, startAfter,
  serverTimestamp, Timestamp, onSnapshot
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

const CATEGORY_LABELS = { '자유': '💬 자유', '질문': '❓ 질문', '정보': '📢 정보', '유머': '😂 유머', '거래': '💰 거래' };
const BOOKMARKS_KEY = 'gwatop_bookmarks';

// ─── State ───
let currentUser = null;
let currentUserData = null;
let currentSort = 'latest';       // 'latest' | 'popular'
let hotMode = false;
let currentCategory = '전체';
let showMyUniversityOnly = false;
let selectedImageFiles = [];      // 다중 이미지 (최대 3)
let pendingImageUrls = [];        // 업로드됐지만 아직 게시글에 저장 안 된 URL들
let pollOptions = [];             // 투표 옵션 텍스트 배열
let selectedWriteCategory = '자유';
let postRenderCount = 0;
let authInitialized = false;
let likedPostIds = new Set();
let checkedPostIds = new Set(); // 이미 likes 조회 완료된 postId 캐시
let pageStartCursors = [null];
let currentPagePosts = [];
let hasNextPage = false;
let isSearchMode = false;
let searchAllPosts = [];
let filteredPosts = [];
let currentPage = 1;
let searchLoading = false;
let categoryPosts = [];           // 카테고리 필터링된 게시글 풀
let isCategoryMode = false;
const POSTS_PER_PAGE = 10;

// ─── Bookmarks (localStorage) ───
function getBookmarks() {
  try { return new Set(JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || '[]')); }
  catch { return new Set(); }
}
function saveBookmarks(set) {
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify([...set]));
}
function isBookmarked(postId) { return getBookmarks().has(postId); }
function toggleBookmark(postId, title) {
  const bm = getBookmarks();
  if (bm.has(postId)) {
    bm.delete(postId);
    showToast('북마크가 해제됐습니다.', 'success');
  } else {
    bm.add(postId);
    showToast('북마크에 추가됐습니다.', 'success');
  }
  saveBookmarks(bm);
  // 버튼 상태 즉시 반영
  document.querySelectorAll(`.bookmark-btn[data-id="${postId}"]`).forEach(btn => {
    btn.classList.toggle('bookmarked', bm.has(postId));
    btn.textContent = bm.has(postId) ? '🔖' : '북마크';
  });
}

// ─── Share ───
async function handleShare(postId, title) {
  const url = `${location.origin}/post.html?id=${postId}`;
  const text = title || '놀이터 게시글';
  if (navigator.share) {
    try {
      await navigator.share({ title: text, url });
      return;
    } catch { /* 취소 시 fallback */ }
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast('링크가 복사됐습니다.', 'success');
  } catch {
    showToast('링크 복사에 실패했습니다.', 'error');
  }
}

// ─── Init ───
async function init() {
  setupNav();
  setupFilters();
  setupUniversityModal();
  setupWriteModal();
  setupLoginModal();
  setupAttendanceModal();
  setupSearch();
  loadRanking();
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
      checkAttendance();
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

  window.addEventListener('nickname-set', e => {
    if (currentUserData) currentUserData.nickname = e.detail.nickname;
    checkAndShowUniversityModal(currentUser, currentUserData);
  });
}

// ─── Attendance Check ───
async function checkAttendance() {
  if (!currentUser) return;
  const today = new Intl.DateTimeFormat('sv', { timeZone: 'Asia/Seoul' }).format(new Date()); // KST YYYY-MM-DD
  const storageKey = `gwatop_attendance_${currentUser.uid}`;
  const btn = document.getElementById('attendance-btn');
  if (!btn) return;

  // 로컬캐시로 빠르게 체크 (서버 확인 전)
  if (localStorage.getItem(storageKey) === today) {
    btn.classList.add('checked');
    btn.textContent = '✅ 출석 완료';
    return;
  }

  btn.onclick = async () => {
    if (btn.classList.contains('checked') || btn.disabled) return;
    btn.disabled = true;
    btn.textContent = '처리 중...';
    try {
      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.alreadyChecked) {
        localStorage.setItem(storageKey, today);
        btn.classList.add('checked');
        btn.textContent = '✅ 출석 완료';
        btn.disabled = false;
      } else if (data.success) {
        localStorage.setItem(storageKey, today);
        btn.classList.add('checked');
        btn.textContent = '✅ 출석 완료';
        btn.disabled = false;
        const newFP = (currentUserData?.freePoints || 0) + 3;
        updateFreePointsDisplay(newFP);
        if (currentUserData) currentUserData.freePoints = newFP;
        const totalEl = document.getElementById('attendance-total-fp');
        if (totalEl) totalEl.textContent = newFP;
        document.getElementById('attendance-modal')?.classList.add('visible');
      } else {
        btn.disabled = false;
        btn.textContent = '📅 출석 체크';
        showToast('출석 처리 중 오류가 발생했습니다.', 'error');
      }
    } catch {
      btn.disabled = false;
      btn.textContent = '📅 출석 체크';
    }
  };
}

// ─── Ranking Widget ───
async function loadRanking() {
  const listEl = document.getElementById('ranking-list');
  if (!listEl) return;
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const snap = await getDocs(
      query(
        collection(db, 'community_posts'),
        where('createdAt', '>=', Timestamp.fromDate(sevenDaysAgo)),
        orderBy('createdAt', 'desc'),
        limit(50)
      )
    );
    const posts = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.likes || 0) - (a.likes || 0))
      .slice(0, 5);

    if (!posts.length) {
      listEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:8px 0">이번 주 게시글이 없습니다</div>';
      return;
    }

    listEl.innerHTML = posts.map((p, i) => {
      const numClass = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
      const title = escapeHtml(p.title || p.content?.slice(0, 40) || '(내용 없음)');
      return `<a class="ranking-item" href="/post.html?id=${p.id}">
        <span class="ranking-num ${numClass}">${i + 1}</span>
        <span class="ranking-text">${title}</span>
        <span class="ranking-likes">❤️ ${p.likes || 0}</span>
      </a>`;
    }).join('');
  } catch {
    listEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:8px 0">불러오기 실패</div>';
  }

  document.getElementById('ranking-toggle')?.addEventListener('click', () => {
    document.getElementById('ranking-widget')?.classList.toggle('collapsed');
  });
}

// ─── University Setup Modal ───
function checkAndShowUniversityModal(user, userData) {
  if (!user) return;
  if (!userData?.nickname) return;
  if (userData?.university) return;
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
    const matches = filter ? UNIVERSITIES.filter(u => u.includes(filter)) : UNIVERSITIES;
    optionsList.innerHTML = matches.map(u => `<li class="uni-opt-item">${escapeHtml(u)}</li>`).join('');
    optionsList.style.display = matches.length ? 'block' : 'none';
  }

  searchInput.addEventListener('focus', () => renderOptions(searchInput.value));
  searchInput.addEventListener('input', () => { selectedUni = ''; confirmBtn.disabled = true; renderOptions(searchInput.value); });
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
    } catch {
      showToast('저장 실패. 다시 시도해주세요.', 'error');
      confirmBtn.disabled = false;
      confirmBtn.textContent = '확인';
    }
  });
}

// ─── Sort Filters ───
function setupFilters() {
  document.getElementById('sort-latest').addEventListener('click', () => {
    if (currentSort === 'latest') return;
    currentSort = 'latest';
    setSortActive('sort-latest');
    resetSearchState();
    loadAllPosts();
  });
  document.getElementById('sort-popular').addEventListener('click', () => {
    if (currentSort === 'popular') return;
    currentSort = 'popular';
    setSortActive('sort-popular');
    resetSearchState();
    loadAllPosts();
  });
  document.getElementById('my-uni-btn').addEventListener('click', () => {
    if (!currentUser) { openLoginModal(); return; }
    showMyUniversityOnly = !showMyUniversityOnly;
    document.getElementById('my-uni-btn').classList.toggle('active', showMyUniversityOnly);
    loadAllPosts();
  });
}

function setSortActive(id) {
  ['sort-latest', 'sort-popular'].forEach(sid => {
    document.getElementById(sid)?.classList.toggle('active', sid === id);
  });
}

function resetSearchState() {
  isSearchMode = false;
  searchAllPosts = [];
  filteredPosts = [];
  document.getElementById('community-search').value = '';
}

// ─── Load Likes ───
async function loadLikesForPosts(postIds) {
  if (!currentUser || !postIds.length) return;
  // 이미 조회한 포스트는 스킵 (세션 내 캐시)
  const uncached = postIds.filter(id => !checkedPostIds.has(id));
  if (!uncached.length) return;
  try {
    const snaps = await Promise.all(uncached.map(id => getDoc(doc(db, 'post_likes', `${id}_${currentUser.uid}`))));
    snaps.forEach((snap, i) => {
      checkedPostIds.add(uncached[i]);
      if (snap.exists()) likedPostIds.add(uncached[i]);
    });
  } catch (e) { console.error('loadLikesForPosts:', e); }
}

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

// ─── Load All Posts ───
async function loadAllPosts() {
  pageStartCursors = [null];
  hasNextPage = false;
  currentPagePosts = [];
  currentPage = 1;
  categoryPosts = [];
  isCategoryMode = false;

  const searchVal = document.getElementById('community-search')?.value.trim() || '';
  if (isSearchMode && searchVal) {
    searchAllPosts = [];
    await loadPostsForSearch(searchVal);
    return;
  }

  if (currentCategory !== '전체') {
    await loadByCategory(currentCategory);
    return;
  }

  await loadPage(1);
}

// ─── Hot Posts ───
async function loadHotPosts() {
  const feed = document.getElementById('posts-feed');
  const emptyEl = document.getElementById('posts-empty');
  feed.innerHTML = '<div class="post-skeleton"></div><div class="post-skeleton"></div><div class="post-skeleton"></div>';
  emptyEl.style.display = 'none';
  document.getElementById('pagination-wrap').innerHTML = '';

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const snap = await getDocs(
      query(
        collection(db, 'community_posts'),
        where('createdAt', '>=', Timestamp.fromDate(sevenDaysAgo)),
        orderBy('createdAt', 'desc'),
        limit(100)
      )
    );
    let posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (showMyUniversityOnly && currentUserData?.university) {
      posts = posts.filter(p => p.university === currentUserData.university);
    }
    posts.sort((a, b) => (b.likes || 0) - (a.likes || 0));

    feed.innerHTML = '';
    if (!posts.length) { emptyEl.style.display = ''; return; }

    // Hot 배너
    feed.insertAdjacentHTML('beforeend', `<div class="hot-mode-banner">🔥 최근 7일 인기 게시글 ${posts.length}개</div>`);

    await loadLikesForPosts(posts.map(p => p.id));
    posts.forEach(post => renderPostCard(post));
  } catch (e) {
    feed.innerHTML = '';
    console.error('loadHotPosts:', e);
    showToast('게시글을 불러오지 못했습니다.', 'error');
  }
}

// ─── Load By Category (클라이언트 사이드 필터링) ───
async function loadByCategory(category) {
  const feed = document.getElementById('posts-feed');
  const emptyEl = document.getElementById('posts-empty');
  feed.innerHTML = '<div class="post-skeleton"></div><div class="post-skeleton"></div><div class="post-skeleton"></div>';
  emptyEl.style.display = 'none';
  document.getElementById('pagination-wrap').innerHTML = '';

  try {
    const sortField = currentSort === 'popular' ? 'likes' : 'createdAt';
    const snap = await getDocs(
      query(collection(db, 'community_posts'), where('category', '==', category), orderBy(sortField, 'desc'), limit(50))
    );
    let posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (showMyUniversityOnly && currentUserData?.university) {
      posts = posts.filter(p => p.university === currentUserData.university);
    }

    categoryPosts = posts;
    isCategoryMode = true;
    currentPage = 1;
    await loadLikesForPosts(categoryPosts.map(p => p.id));
    renderCategoryPage(1);
  } catch (e) {
    feed.innerHTML = '';
    console.error('loadByCategory:', e);
    showToast('게시글을 불러오지 못했습니다.', 'error');
  }
}

function renderCategoryPage(page) {
  currentPage = page;
  const feed = document.getElementById('posts-feed');
  const emptyEl = document.getElementById('posts-empty');
  feed.innerHTML = '';
  postRenderCount = 0;
  if (!categoryPosts.length) { emptyEl.style.display = ''; document.getElementById('pagination-wrap').innerHTML = ''; return; }
  emptyEl.style.display = 'none';
  const start = (page - 1) * POSTS_PER_PAGE;
  const pagePosts = categoryPosts.slice(start, start + POSTS_PER_PAGE);
  pagePosts.forEach(post => { renderPostCard(post); postRenderCount++; if (postRenderCount % 5 === 0) renderAdSlot(); });
  renderSimplePagination(Math.ceil(categoryPosts.length / POSTS_PER_PAGE), page, renderCategoryPage);
}

// ─── Cursor-based Pagination ───
async function loadPage(pageNum) {
  const feed = document.getElementById('posts-feed');
  const emptyEl = document.getElementById('posts-empty');
  feed.innerHTML = '<div class="post-skeleton"></div><div class="post-skeleton"></div><div class="post-skeleton"></div>';
  emptyEl.style.display = 'none';
  document.getElementById('pagination-wrap').innerHTML = '';

  try {
    const postsRef = collection(db, 'community_posts');
    const sortField = currentSort === 'popular' ? 'likes' : 'createdAt';
    const cursor = pageStartCursors[pageNum - 1];
    let q = cursor
      ? query(postsRef, orderBy(sortField, 'desc'), startAfter(cursor), limit(POSTS_PER_PAGE + 1))
      : query(postsRef, orderBy(sortField, 'desc'), limit(POSTS_PER_PAGE + 1));

    const snap = await getDocs(q);
    let docs = snap.docs;
    hasNextPage = docs.length > POSTS_PER_PAGE;
    let pageDocs = docs.slice(0, POSTS_PER_PAGE);

    if (hasNextPage && pageDocs.length > 0 && !pageStartCursors[pageNum]) {
      pageStartCursors[pageNum] = pageDocs[pageDocs.length - 1];
    }

    currentPage = pageNum;
    let posts = pageDocs.map(d => ({ id: d.id, ...d.data() }));
    if (showMyUniversityOnly && currentUserData?.university) {
      posts = posts.filter(p => p.university === currentUserData.university);
    }
    currentPagePosts = posts;
    await loadLikesForPosts(currentPagePosts.map(p => p.id));
    renderCurrentPage();
  } catch (e) {
    feed.innerHTML = '';
    console.error('loadPage:', e);
    showToast('게시글을 불러오지 못했습니다.', 'error');
  }
}

// ─── Search (Algolia) ───
async function loadPostsForSearch(searchQuery) {
  if (searchLoading) return;
  searchLoading = true;
  const feed = document.getElementById('posts-feed');
  feed.innerHTML = '<div class="post-skeleton"></div><div class="post-skeleton"></div><div class="post-skeleton"></div>';
  document.getElementById('posts-empty').style.display = 'none';
  document.getElementById('pagination-wrap').innerHTML = '';
  try {
    const body = { query: searchQuery, hitsPerPage: 50 };
    if (currentCategory !== '전체') body.filters = `category:${currentCategory}`;
    const res = await fetch(
      `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`,
      {
        method: 'POST',
        headers: {
          'X-Algolia-Application-Id': ALGOLIA_APP_ID,
          'X-Algolia-API-Key': ALGOLIA_SEARCH_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) throw new Error('Algolia 검색 실패');
    const data = await res.json();
    const hits = data.hits || [];
    // Firestore에서 실제 존재 여부 확인 (삭제된 게시물 필터링)
    const snapshots = await Promise.all(hits.map(hit => getDoc(doc(db, 'community_posts', hit.objectID))));
    searchAllPosts = hits
      .filter((_, i) => snapshots[i].exists())
      .map(hit => ({
        id: hit.objectID,
        title: hit.title,
        content: hit.content,
        nickname: hit.nickname,
        university: hit.university,
        uid: hit.uid,
        isAnonymous: hit.isAnonymous,
        category: hit.category || '자유',
        createdAt: { seconds: Math.floor((hit.createdAt || Date.now()) / 1000) },
        likes: hit.likes || 0,
        commentCount: hit.commentCount || 0,
        imageUrl: hit.imageUrl || '',
        imageUrls: hit.imageUrls || [],
      }));
    filteredPosts = searchAllPosts;
    isSearchMode = true;
    renderSearchPage(1);
  } catch {
    feed.innerHTML = '';
    showToast('검색 중 오류가 발생했습니다.', 'error');
  } finally {
    searchLoading = false;
  }
}

function applySearchFilter(searchQuery) {
  const q = searchQuery.toLowerCase();
  filteredPosts = searchAllPosts.filter(p =>
    (p.title || '').toLowerCase().includes(q) ||
    (p.content || '').toLowerCase().includes(q) ||
    (p.nickname || '').toLowerCase().includes(q)
  );
  renderSearchPage(1);
}

function applySearch() {
  const q = document.getElementById('community-search')?.value.trim().toLowerCase() || '';
  if (!q) {
    if (isSearchMode) { isSearchMode = false; searchAllPosts = []; filteredPosts = []; loadPage(1); }
    return;
  }
  if (!isSearchMode || !searchAllPosts.length) loadPostsForSearch(q);
  else applySearchFilter(q);
}

// ─── Render ───
function renderCurrentPage() {
  const feed = document.getElementById('posts-feed');
  const emptyEl = document.getElementById('posts-empty');
  feed.innerHTML = '';
  postRenderCount = 0;
  if (!currentPagePosts.length) { emptyEl.style.display = ''; document.getElementById('pagination-wrap').innerHTML = ''; return; }
  emptyEl.style.display = 'none';
  currentPagePosts.forEach(post => { renderPostCard(post); postRenderCount++; if (postRenderCount % 5 === 0) renderAdSlot(); });
  renderCursorPagination();
}

async function renderSearchPage(page) {
  currentPage = page;
  const feed = document.getElementById('posts-feed');
  const emptyEl = document.getElementById('posts-empty');
  feed.innerHTML = '';
  postRenderCount = 0;
  if (!filteredPosts.length) { emptyEl.style.display = ''; document.getElementById('pagination-wrap').innerHTML = ''; return; }
  emptyEl.style.display = 'none';
  const start = (page - 1) * POSTS_PER_PAGE;
  const pagePosts = filteredPosts.slice(start, start + POSTS_PER_PAGE);
  await loadLikesForPosts(pagePosts.map(p => p.id));
  pagePosts.forEach(post => { renderPostCard(post); postRenderCount++; if (postRenderCount % 5 === 0) renderAdSlot(); });
  renderSimplePagination(Math.ceil(filteredPosts.length / POSTS_PER_PAGE), page, renderSearchPage);
}

// ─── Pagination ───
function renderCursorPagination() {
  const wrap = document.getElementById('pagination-wrap');
  if (!wrap) return;
  const knownPages = pageStartCursors.length;
  if (knownPages <= 1 && !hasNextPage) { wrap.innerHTML = ''; return; }
  let html = `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-action="prev">‹</button>`;
  for (let i = 1; i <= knownPages; i++) html += `<button class="page-btn${i === currentPage ? ' active' : ''}" data-page="${i}">${i}</button>`;
  if (hasNextPage) html += `<span class="page-ellipsis">···</span>`;
  html += `<button class="page-btn" ${!hasNextPage ? 'disabled' : ''} data-action="next">›</button>`;
  wrap.innerHTML = html;
  wrap.querySelector('[data-action="prev"]')?.addEventListener('click', () => { if (currentPage > 1) { window.scrollTo({ top: 0, behavior: 'smooth' }); loadPage(currentPage - 1); } });
  wrap.querySelector('[data-action="next"]')?.addEventListener('click', () => { if (hasNextPage) { window.scrollTo({ top: 0, behavior: 'smooth' }); loadPage(currentPage + 1); } });
  wrap.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => { const p = parseInt(btn.dataset.page); if (p !== currentPage) { window.scrollTo({ top: 0, behavior: 'smooth' }); loadPage(p); } });
  });
}

function renderSimplePagination(totalPages, page, onPageChange) {
  const wrap = document.getElementById('pagination-wrap');
  if (!wrap) return;
  if (totalPages <= 1) { wrap.innerHTML = ''; return; }
  const pages = [];
  if (totalPages <= 7) for (let i = 1; i <= totalPages; i++) pages.push(i);
  else {
    pages.push(1);
    if (page > 3) pages.push('…');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('…');
    pages.push(totalPages);
  }
  let html = `<button class="page-btn" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>‹</button>`;
  pages.forEach(p => {
    if (p === '…') html += `<span class="page-ellipsis">···</span>`;
    else html += `<button class="page-btn${p === page ? ' active' : ''}" data-page="${p}">${p}</button>`;
  });
  html += `<button class="page-btn" data-page="${page + 1}" ${page === totalPages ? 'disabled' : ''}>›</button>`;
  wrap.innerHTML = html;
  wrap.querySelectorAll('.page-btn[data-page]:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => { onPageChange(parseInt(btn.dataset.page)); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  });
}

// ─── Search Setup ───
function setupSearch() {
  let debounceTimer;
  document.getElementById('community-search')?.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applySearch, 300);
  });
}

// ─── Ad Slot ───
function renderAdSlot() {
  const feed = document.getElementById('posts-feed');
  const slot = document.createElement('div');
  slot.className = 'feed-banner';
  slot.innerHTML = `<div class="feed-banner-inner"></div>`;
  feed.appendChild(slot);
}

// ─── Post Card ───
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
  const bookmarked = isBookmarked(post.id);

  // 미리보기 텍스트
  const rawContent = post.content || '';
  const previewText = rawContent.length > 120 ? rawContent.slice(0, 120) + '...' : rawContent;

  // 이미지 (다중 지원)
  const images = Array.isArray(post.imageUrls) && post.imageUrls.length
    ? post.imageUrls
    : (post.imageUrl?.startsWith('https://') ? [post.imageUrl] : []);

  const imagesHtml = images.length
    ? `<div class="post-card-images">${images.slice(0, 3).map(u => `<img src="${escapeHtml(u)}" alt="이미지" loading="lazy" />`).join('')}</div>`
    : '';

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
      ${imagesHtml}
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
      <div class="post-footer-right">
        <button class="post-action-btn bookmark-btn${bookmarked ? ' bookmarked' : ''}" data-id="${post.id}">${bookmarked ? '🔖' : '북마크'}</button>
        <button class="post-action-btn share-btn" data-id="${post.id}" data-title="${escapeHtml(post.title || '')}">공유</button>
      </div>
    </div>
  `;

  card.querySelector('.post-like-btn').addEventListener('click', e => { e.stopPropagation(); handleLike(post.id, post.uid); });
  card.querySelector('.bookmark-btn').addEventListener('click', e => { e.stopPropagation(); toggleBookmark(post.id, post.title || ''); });
  card.querySelector('.share-btn').addEventListener('click', e => { e.stopPropagation(); handleShare(post.id, post.title || ''); });
  card.addEventListener('click', () => { window.location.href = `/post.html?id=${post.id}`; });

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
  const beforeCount = parseInt(countEl.textContent) || 0;
  btn.disabled = true;
  btn.classList.toggle('liked', !wasLiked);
  const newCount = wasLiked ? Math.max(0, beforeCount - 1) : beforeCount + 1;
  countEl.textContent = newCount;
  heart.textContent = wasLiked ? '🤍' : '❤️';
  const existingMax = btn.querySelector('.like-maxed');
  if (existingMax) existingMax.remove();
  if (newCount >= 5) { const span = document.createElement('span'); span.className = 'like-maxed'; span.textContent = 'MAX'; btn.appendChild(span); }
  btn.style.transform = 'scale(1.3)';
  setTimeout(() => btn.style.transform = '', 200);
  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/like-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
      body: JSON.stringify({ postId }),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || '좋아요 처리 실패'); }
    const { liked, likes } = await res.json();
    btn.classList.toggle('liked', liked);
    heart.textContent = liked ? '❤️' : '🤍';
    countEl.textContent = likes;
    if (liked) likedPostIds.add(postId); else likedPostIds.delete(postId);
    const maxEl = btn.querySelector('.like-maxed');
    if (maxEl) maxEl.remove();
    if (likes >= 5) { const span = document.createElement('span'); span.className = 'like-maxed'; span.textContent = 'MAX'; btn.appendChild(span); }
  } catch (e) {
    btn.classList.toggle('liked', wasLiked);
    heart.textContent = wasLiked ? '❤️' : '🤍';
    countEl.textContent = beforeCount;
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

  // 익명 토글
  const cb = document.getElementById('anon-toggle');
  const track = document.getElementById('toggle-track');
  const thumb = document.getElementById('toggle-thumb');
  cb.addEventListener('change', () => {
    track.style.background = cb.checked ? '#7c3aed' : 'var(--glass-border)';
    thumb.style.left = cb.checked ? '22px' : '2px';
  });

  // 이미지 업로드 (최대 3장)
  document.getElementById('image-upload-btn').addEventListener('click', () => {
    if (selectedImageFiles.length >= 3) { showToast('이미지는 최대 3장까지 첨부할 수 있습니다.', 'error'); return; }
    document.getElementById('post-image-input').click();
  });
  document.getElementById('post-image-input').addEventListener('change', e => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (selectedImageFiles.length >= 3) { showToast('이미지는 최대 3장까지 첨부할 수 있습니다.', 'error'); break; }
      if (file.size > 5 * 1024 * 1024) { showToast('이미지는 5MB 이하만 가능합니다.', 'error'); continue; }
      selectedImageFiles.push(file);
    }
    e.target.value = '';
    renderImagePreviews();
  });

  // 투표 기능
  document.getElementById('add-poll-btn').addEventListener('click', () => {
    if (pollOptions.length === 0) { pollOptions = ['', '']; }
    document.getElementById('poll-section').style.display = '';
    document.getElementById('add-poll-btn').style.display = 'none';
    renderPollOptions();
  });
  document.getElementById('poll-remove-btn').addEventListener('click', () => {
    pollOptions = [];
    document.getElementById('poll-section').style.display = 'none';
    document.getElementById('add-poll-btn').style.display = '';
  });
  document.getElementById('poll-add-option-btn').addEventListener('click', () => {
    if (pollOptions.length >= 4) { showToast('선택지는 최대 4개입니다.', 'error'); return; }
    pollOptions.push('');
    renderPollOptions();
  });
}

function renderImagePreviews() {
  const wrap = document.getElementById('image-previews-wrap');
  wrap.innerHTML = '';
  selectedImageFiles.forEach((file, i) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const item = document.createElement('div');
      item.className = 'image-preview-item';
      item.innerHTML = `<img src="${ev.target.result}" alt="미리보기" /><button class="image-preview-remove" data-idx="${i}">✕</button>`;
      item.querySelector('.image-preview-remove').addEventListener('click', () => {
        selectedImageFiles.splice(i, 1);
        renderImagePreviews();
      });
      wrap.appendChild(item);
    };
    reader.readAsDataURL(file);
  });
}

function renderPollOptions() {
  const listEl = document.getElementById('poll-options-list');
  listEl.innerHTML = '';
  pollOptions.forEach((opt, i) => {
    const row = document.createElement('div');
    row.className = 'poll-option-row';
    row.innerHTML = `
      <input class="poll-option-input" type="text" placeholder="선택지 ${i + 1}" value="${escapeHtml(opt)}" maxlength="50" data-idx="${i}" />
      ${pollOptions.length > 2 ? `<button class="poll-option-del" data-idx="${i}">✕</button>` : ''}
    `;
    row.querySelector('.poll-option-input').addEventListener('input', e => { pollOptions[i] = e.target.value; });
    row.querySelector('.poll-option-del')?.addEventListener('click', () => { pollOptions.splice(i, 1); renderPollOptions(); });
    listEl.appendChild(row);
  });
  const addBtn = document.getElementById('poll-add-option-btn');
  if (addBtn) addBtn.style.display = pollOptions.length >= 4 ? 'none' : '';
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
  selectedImageFiles = [];
  pendingImageUrls = [];
  pollOptions = [];
  document.getElementById('image-previews-wrap').innerHTML = '';
  document.getElementById('poll-section').style.display = 'none';
  document.getElementById('add-poll-btn').style.display = '';
  document.getElementById('write-modal').classList.add('visible');
  setTimeout(() => document.getElementById('post-title').focus(), 120);
}

function closeWriteModal() {
  // 업로드됐지만 게시글에 저장 안 된 이미지 삭제
  if (pendingImageUrls.length) {
    const storage = getStorage(app);
    pendingImageUrls.forEach(url => {
      try { deleteObject(storageRef(storage, url)).catch(() => {}); } catch { /* ignore */ }
    });
    pendingImageUrls = [];
  }
  selectedImageFiles = [];
  pollOptions = [];
  document.getElementById('image-previews-wrap').innerHTML = '';
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

  // 투표 유효성 검사
  const validPollOptions = pollOptions.filter(o => o.trim());
  if (pollOptions.length > 0 && validPollOptions.length < 2) {
    showToast('투표 선택지를 최소 2개 이상 입력해주세요.', 'error'); return;
  }

  btn.disabled = true;

  // 하루 3개 제한
  try {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todaySnap = await getDocs(query(
      collection(db, 'community_posts'),
      where('uid', '==', currentUser.uid),
      where('createdAt', '>=', Timestamp.fromDate(todayStart))
    ));
    if (todaySnap.size >= 3) {
      showToast('하루 최대 3개까지 글을 쓸 수 있습니다.', 'error');
      btn.disabled = false;
      return;
    }
  } catch { /* 인덱스 미생성 시 제한 스킵 */ }

  // 이미지 업로드
  let imageUrls = [];
  if (selectedImageFiles.length > 0) {
    btn.textContent = '이미지 업로드 중...';
    try {
      imageUrls = await uploadImages(selectedImageFiles);
      pendingImageUrls = [...imageUrls];
    } catch {
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
      category: selectedWriteCategory,
      likes: 0,
      commentCount: 0,
      anonymousCounter: 0,
      anonymousMap: {},
      createdAt: serverTimestamp(),
    };
    if (imageUrls.length === 1) {
      postData.imageUrl = imageUrls[0];
      postData.imageUrls = imageUrls;
    } else if (imageUrls.length > 1) {
      postData.imageUrls = imageUrls;
      postData.imageUrl = imageUrls[0];
    }
    if (validPollOptions.length >= 2) {
      postData.pollOptions = validPollOptions.map(text => ({ text, votes: 0 }));
      postData.pollVoters = {};
    }

    const docRef = await addDoc(collection(db, 'community_posts'), postData);
    pendingImageUrls = [];

    // Algolia 인덱싱 (백그라운드)
    fetch('/api/index-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await currentUser.getIdToken()}` },
      body: JSON.stringify({
        action: 'add',
        postId: docRef.id,
        post: { ...postData, createdAt: Date.now(), imageUrls, imageUrl: imageUrls[0] || '' },
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

// ─── Multi-Image Upload ───
async function uploadImages(files) {
  const storage = getStorage(app);
  const urls = await Promise.all(files.map(async file => {
    const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
    const path = `community_images/${currentUser.uid}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const fileRef = storageRef(storage, path);
    await uploadBytes(fileRef, file);
    return getDownloadURL(fileRef);
  }));
  return urls;
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

function setupAttendanceModal() {
  const close = () => document.getElementById('attendance-modal')?.classList.remove('visible');
  document.getElementById('attendance-modal-close')?.addEventListener('click', close);
  document.getElementById('attendance-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('attendance-modal')) close();
  });
}

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
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
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

// placeholder — game logic is in game.js
function updateFreePointsDisplay() {}
