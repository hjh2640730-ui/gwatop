// ============================================================
// GWATOP - Post Detail Page Logic v2.0.0
// ============================================================

import { signInWithGoogle, signInWithKakao, signInWithNaver, logOut, onUserChange } from './auth.js';
import { checkAndShowNicknameModal } from './nickname.js';
import { db, app } from './auth.js';
import {
  collection, doc, getDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, limit, increment
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getStorage, ref as storageRef, deleteObject
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

const storage = getStorage(app);
const BOOKMARKS_KEY = 'gwatop_bookmarks';
const CATEGORY_LABELS = { '자유': '💬 자유', '질문': '❓ 질문', '정보': '📢 정보', '유머': '😂 유머', '거래': '💰 거래' };

// ─── State ───
let currentUser = null;
let currentUserData = null;
let postData = null;
let isPostLiked = false;
let editCategory = '자유';
const postId = new URLSearchParams(window.location.search).get('id');

// ─── Bookmarks ───
function getBookmarks() {
  try { return new Set(JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || '[]')); } catch { return new Set(); }
}
function saveBookmarks(set) { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify([...set])); }

// ─── Init ───
async function init() {
  if (!postId) {
    document.getElementById('post-view').innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:60px 0">게시글을 찾을 수 없습니다.</p>';
    return;
  }
  setupNav();
  setupLoginModal();
  setupEditModal();
  await loadPost();
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
    } else {
      lo.style.display = '';
      li.style.display = 'none';
      isPostLiked = false;
    }
    checkAndShowNicknameModal(user, userData);
    if (postData) {
      await checkPostLiked();
      renderPostFooter();
      // 투표 위젯 재렌더 (로그인 후 내 투표 상태 반영)
      const pollEl = document.querySelector('.poll-widget');
      if (pollEl) {
        const newHtml = renderPollWidget();
        if (newHtml) {
          const tmp = document.createElement('div');
          tmp.innerHTML = newHtml;
          pollEl.replaceWith(tmp.firstElementChild);
          document.querySelectorAll('.poll-option-btn').forEach((btn, i) => {
            btn.addEventListener('click', () => handleVote(i));
          });
        }
      }
      renderCommentForm();
      loadComments();
    }
  });
}

// ─── Check Post Liked ───
async function checkPostLiked() {
  if (!currentUser || !postId) { isPostLiked = false; return; }
  try {
    const snap = await getDoc(doc(db, 'post_likes', `${postId}_${currentUser.uid}`));
    isPostLiked = snap.exists();
  } catch { isPostLiked = false; }
}

// ─── Load Post ───
async function loadPost() {
  const postView = document.getElementById('post-view');
  try {
    const snap = await getDoc(doc(db, 'community_posts', postId));
    if (!snap.exists()) {
      postView.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:60px 0">게시글을 찾을 수 없습니다.</p>';
      return;
    }
    postData = { id: snap.id, ...snap.data() };
    // 동적 타이틀
    if (postData.title) document.title = `${postData.title} - GWATOP 놀이터`;
    await checkPostLiked();
    renderPost();
    loadComments();
  } catch (e) {
    console.error('loadPost:', e);
    postView.innerHTML = '<p style="text-align:center;color:#f87171;padding:60px 0">게시글을 불러오지 못했습니다.</p>';
  }
}

// ─── Render Post ───
function renderPost() {
  const postView = document.getElementById('post-view');
  const displayName = postData.isAnonymous ? '익명' : (postData.nickname || '알 수 없음');
  const avatarColor = postData.isAnonymous ? '#374151' : getAvatarColor(postData.uid || displayName);
  const avatarChar = postData.isAnonymous ? '?' : displayName[0];
  // 이미지 (다중 지원)
  const images = Array.isArray(postData.imageUrls) && postData.imageUrls.length
    ? postData.imageUrls
    : (postData.imageUrl?.startsWith('https://') ? [postData.imageUrl] : []);

  const imagesHtml = images.length
    ? `<div class="post-images-gallery ${images.length === 1 ? 'single' : 'multi'}">
        ${images.map(u => `<img src="${escapeHtml(u)}" alt="이미지" loading="lazy" />`).join('')}
      </div>`
    : '';

  const editedBadge = postData.editedAt ? `<span class="post-edited-badge">(수정됨)</span>` : '';

  postView.innerHTML = `
    <div class="post-detail-header">
      <div class="post-author-row">
        <div class="post-avatar" style="background:${avatarColor}">${escapeHtml(avatarChar)}</div>
        <div>
          <span class="post-author-name">${escapeHtml(displayName)}</span>
          <span class="post-uni-badge">${escapeHtml(postData.university || '')}</span>
        </div>
      </div>
      <span class="post-time">${timeAgo(postData.createdAt)}${editedBadge}</span>
    </div>
    ${postData.title ? `<h1 class="post-detail-title">${escapeHtml(postData.title)}</h1>` : ''}
    <div class="post-detail-content">${formatContent(postData.content || '')}</div>
    ${imagesHtml}
    ${renderPollWidget()}
    <div class="post-detail-footer" id="post-detail-footer">
      <div id="post-like-wrap"></div>
      <div class="post-footer-right" id="post-action-wrap"></div>
    </div>
  `;

  // 이미지 라이트박스
  postView.querySelectorAll('.post-images-gallery img').forEach(img => {
    img.addEventListener('click', () => {
      document.getElementById('lightbox-img').src = img.src;
      document.getElementById('img-lightbox').style.display = 'flex';
    });
  });

  // 투표 버튼 이벤트
  postView.querySelectorAll('.poll-option-btn').forEach((btn, i) => {
    btn.addEventListener('click', () => handleVote(i));
  });

  renderPostFooter();
}

// ─── Poll Widget ───
function renderPollWidget() {
  const options = postData.pollOptions;
  if (!Array.isArray(options) || !options.length) return '';

  const voters = postData.pollVoters || {};
  const myVote = currentUser && voters[currentUser.uid] !== undefined ? parseInt(voters[currentUser.uid]) : -1;
  const totalVotes = options.reduce((s, o) => s + (o.votes || 0), 0);

  const optionsHtml = options.map((opt, i) => {
    const votes = opt.votes || 0;
    const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
    const isVoted = myVote === i;
    return `
      <button class="poll-option-btn${isVoted ? ' voted' : ''}" data-idx="${i}">
        <div class="poll-option-bar" style="width:${pct}%"></div>
        <span class="poll-option-text">${escapeHtml(opt.text || '')}</span>
        <span class="poll-option-count">${votes}표</span>
        <span class="poll-option-pct">${pct}%</span>
      </button>`;
  }).join('');

  return `
    <div class="poll-widget">
      <div class="poll-widget-title">📊 투표</div>
      ${optionsHtml}
      <div class="poll-total">총 ${totalVotes}명 참여</div>
    </div>`;
}

async function handleVote(optionIndex) {
  if (!currentUser) { openLoginModal(); return; }
  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
      body: JSON.stringify({ postId, optionIndex }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '투표 처리 실패');

    // 로컬 업데이트
    const options = [...(postData.pollOptions || [])];
    options.forEach((o, i) => { options[i] = { ...o, votes: data.votes[i] ?? o.votes }; });
    postData.pollOptions = options;
    if (!postData.pollVoters) postData.pollVoters = {};
    if (data.voted) postData.pollVoters[currentUser.uid] = optionIndex;
    else delete postData.pollVoters[currentUser.uid];

    // 투표 위젯 재렌더
    const pollPlaceholder = document.querySelector('.poll-widget');
    if (pollPlaceholder) {
      pollPlaceholder.outerHTML = renderPollWidget();
      document.querySelectorAll('.poll-option-btn').forEach((btn, i) => {
        btn.addEventListener('click', () => handleVote(i));
      });
    }
  } catch (e) {
    showToast(e.message || '투표 처리 중 오류가 발생했습니다.', 'error');
  }
}

// ─── Post Footer ───
function renderPostFooter() {
  renderLikeButton();

  const wrap = document.getElementById('post-action-wrap');
  if (!wrap || !postData) return;

  const bookmarked = getBookmarks().has(postId);
  let html = `
    <button class="post-action-btn${bookmarked ? ' bookmarked' : ''}" id="detail-bookmark-btn">${bookmarked ? '🔖' : '북마크'}</button>
    <button class="post-action-btn" id="detail-share-btn">공유</button>
  `;

  if (currentUser?.uid === postData.uid) {
    html += `<button class="post-action-btn" id="post-edit-btn">✏️ 수정</button>
             <button class="post-action-btn" id="post-delete-btn" style="color:#f87171">🗑️ 삭제</button>`;
  }

  wrap.innerHTML = html;

  document.getElementById('detail-share-btn')?.addEventListener('click', handleShare);
  document.getElementById('detail-bookmark-btn')?.addEventListener('click', handleBookmark);
  document.getElementById('post-edit-btn')?.addEventListener('click', openEditModal);
  document.getElementById('post-delete-btn')?.addEventListener('click', deletePost);
}

// ─── Share ───
async function handleShare() {
  const url = `${location.origin}/post.html?id=${postId}`;
  const title = postData?.title || '놀이터 게시글';
  if (navigator.share) {
    try { await navigator.share({ title, url }); return; } catch { /* 취소 시 fallback */ }
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast('링크가 복사됐습니다.', 'success');
  } catch { showToast('링크 복사에 실패했습니다.', 'error'); }
}

// ─── Bookmark ───
function handleBookmark() {
  const bm = getBookmarks();
  const btn = document.getElementById('detail-bookmark-btn');
  if (bm.has(postId)) {
    bm.delete(postId);
    if (btn) { btn.classList.remove('bookmarked'); btn.textContent = '북마크'; }
    showToast('북마크가 해제됐습니다.', 'success');
  } else {
    bm.add(postId);
    if (btn) { btn.classList.add('bookmarked'); btn.textContent = '🔖'; }
    showToast('북마크에 추가됐습니다.', 'success');
  }
  saveBookmarks(bm);
}

// ─── Edit Modal ───
function setupEditModal() {
  document.getElementById('edit-modal-close')?.addEventListener('click', closeEditModal);
  document.getElementById('edit-modal-cancel')?.addEventListener('click', closeEditModal);
  document.getElementById('edit-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('edit-modal')) closeEditModal();
  });
  document.getElementById('edit-post-content')?.addEventListener('input', () => {
    const len = document.getElementById('edit-post-content').value.length;
    document.getElementById('edit-char-count').textContent = `${len} / 1000`;
  });
  document.getElementById('edit-modal-save')?.addEventListener('click', saveEdit);
}

function openEditModal() {
  if (!postData) return;
  document.getElementById('edit-post-title').value = postData.title || '';
  document.getElementById('edit-post-content').value = postData.content || '';
  document.getElementById('edit-char-count').textContent = `${(postData.content || '').length} / 1000`;
  document.getElementById('edit-modal').classList.add('visible');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('visible');
}

async function saveEdit() {
  const title = document.getElementById('edit-post-title').value.trim();
  const content = document.getElementById('edit-post-content').value.trim();
  const btn = document.getElementById('edit-modal-save');

  if (!content) { showToast('내용을 입력해주세요.', 'error'); return; }
  btn.disabled = true;
  btn.textContent = '저장 중...';

  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/edit-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
      body: JSON.stringify({ postId, title, content, category: editCategory }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '수정 실패');

    // 로컬 데이터 업데이트
    postData.title = title;
    postData.content = content;
    postData.category = editCategory;
    postData.editedAt = new Date().toISOString();

    closeEditModal();
    renderPost();
    showToast('게시글이 수정됐습니다.', 'success');
  } catch (e) {
    showToast(e.message || '수정 중 오류가 발생했습니다.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '저장하기';
  }
}

// ─── Delete Post ───
async function deletePost() {
  if (!currentUser || currentUser.uid !== postData.uid) return;
  if (!confirm('글을 삭제하시겠습니까?')) return;
  try {
    const likesEarned = Math.min(postData.likes || 0, 5);
    if (likesEarned > 0) {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        credits: increment(-likesEarned),
        referralCredits: increment(-likesEarned),
      });
    }
    // 이미지 삭제 (다중 지원)
    const images = Array.isArray(postData.imageUrls) && postData.imageUrls.length
      ? postData.imageUrls
      : (postData.imageUrl ? [postData.imageUrl] : []);
    for (const url of images) {
      try { await deleteObject(storageRef(storage, url)); } catch { /* ignore */ }
    }
    await deleteDoc(doc(db, 'community_posts', postId));
    // Algolia 인덱스 제거 (백그라운드)
    fetch('/api/index-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await currentUser.getIdToken()}` },
      body: JSON.stringify({ action: 'remove', postId, post: { uid: postData.uid } }),
    }).catch(() => {});
    window.location.href = '/community.html';
  } catch (e) {
    console.error('deletePost:', e);
    showToast('글 삭제 실패', 'error');
  }
}

// ─── Like Button ───
function renderLikeButton() {
  const wrap = document.getElementById('post-like-wrap');
  if (!wrap || !postData) return;
  const isMine = currentUser?.uid === postData.uid;
  const likeCount = postData.likes || 0;
  wrap.innerHTML = `
    <button class="post-like-btn${isPostLiked ? ' liked' : ''}" id="detail-like-btn" ${isMine ? 'disabled title="내 글에는 좋아요를 누를 수 없습니다"' : ''}>
      <span class="like-heart">${isPostLiked ? '❤️' : '🤍'}</span>
      <span class="like-count">${likeCount}</span>
      ${likeCount >= 5 ? '<span class="like-maxed">MAX</span>' : ''}
    </button>
  `;
  document.getElementById('detail-like-btn')?.addEventListener('click', handleLike);
}

// ─── Like ───
async function handleLike() {
  if (!currentUser) { openLoginModal(); return; }
  if (!postData) return;
  const btn = document.getElementById('detail-like-btn');
  if (!btn) return;
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
  isPostLiked = !wasLiked;
  postData.likes = newCount;
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
    isPostLiked = liked;
    postData.likes = likes;
    const maxEl = btn.querySelector('.like-maxed');
    if (maxEl) maxEl.remove();
    if (likes >= 5) { const span = document.createElement('span'); span.className = 'like-maxed'; span.textContent = 'MAX'; btn.appendChild(span); }
  } catch (e) {
    btn.classList.toggle('liked', wasLiked);
    heart.textContent = wasLiked ? '❤️' : '🤍';
    countEl.textContent = beforeCount;
    isPostLiked = wasLiked;
    postData.likes = beforeCount;
    console.error('like error:', e);
    showToast(e.message || '좋아요 처리 중 오류가 발생했습니다.', 'error');
  } finally {
    btn.disabled = false;
  }
}

// ─── Load Comments ───
async function loadComments() {
  const section = document.getElementById('comments-section');
  if (!section || !postData) return;
  try {
    const snap = await getDocs(
      query(collection(db, 'community_posts', postId, 'comments'), orderBy('createdAt', 'asc'), limit(300))
    );
    const allComments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const topLevel = allComments.filter(c => !c.parentId);
    const replies = allComments.filter(c => !!c.parentId);
    const replyMap = {};
    replies.forEach(r => { if (!replyMap[r.parentId]) replyMap[r.parentId] = []; replyMap[r.parentId].push(r); });
    const countEl = document.getElementById('comments-count-title');
    if (countEl) countEl.textContent = `댓글 ${allComments.length}개`;
    const listEl = document.getElementById('comments-list');
    if (!listEl) return;
    if (!topLevel.length) { listEl.innerHTML = '<p class="comments-empty">첫 댓글을 남겨보세요!</p>'; }
    else {
      listEl.innerHTML = '';
      topLevel.forEach(comment => {
        listEl.appendChild(buildCommentEl(comment, false));
        (replyMap[comment.id] || []).forEach(reply => listEl.appendChild(buildCommentEl(reply, true)));
      });
    }
    renderCommentForm();
  } catch (e) {
    console.error('loadComments:', e);
    const listEl = document.getElementById('comments-list');
    if (listEl) listEl.innerHTML = '<p style="color:#f87171;text-align:center;padding:16px">댓글을 불러오지 못했습니다.</p>';
  }
}

function getDisplayInfo(comment) {
  if (postData && comment.uid === postData.uid) return { name: '작성자', isAuthor: true };
  if (comment.isAnonymous) return { name: `익명${comment.anonNumber || ''}`, isAuthor: false };
  return { name: comment.nickname || '알 수 없음', isAuthor: false };
}

function buildCommentEl(comment, isReply) {
  const { name, isAuthor } = getDisplayInfo(comment);
  const isMine = currentUser && comment.uid === currentUser.uid;
  const isCommentLiked = currentUser && Array.isArray(comment.likedBy) && comment.likedBy.includes(currentUser.uid);
  const avatarColor = isAuthor ? '#10b981' : (comment.isAnonymous ? '#374151' : getAvatarColor(comment.uid || name));
  const avatarChar = name[0] || '?';
  const wrap = document.createElement('div');
  wrap.className = isReply ? 'comment-item comment-reply' : 'comment-item';
  wrap.dataset.commentId = comment.id;
  if (comment.deleted) {
    wrap.innerHTML = `<div class="comment-deleted-row${isReply ? ' reply-indent' : ''}"><span class="comment-deleted-text">삭제된 댓글입니다.</span></div>`;
    return wrap;
  }
  wrap.innerHTML = `
    <div class="comment-inner${isReply ? ' reply-indent' : ''}">
      <div class="comment-avatar" style="background:${avatarColor}">${escapeHtml(avatarChar)}</div>
      <div class="comment-body">
        <div class="comment-meta">
          <span class="comment-author">${escapeHtml(name)}</span>
          ${isAuthor ? '<span class="author-badge">작성자</span>' : ''}
          <span class="comment-uni">${escapeHtml(comment.university || '')}</span>
          <span class="comment-time">${timeAgo(comment.createdAt)}</span>
          ${isMine ? `<button class="comment-delete-btn" data-id="${comment.id}">삭제</button>` : ''}
        </div>
        <div class="comment-text">${formatContent(comment.content || '')}</div>
        <div class="comment-actions-row">
          ${!isReply ? `<button class="reply-toggle-btn" data-id="${comment.id}">답글</button>` : ''}
          <button class="comment-like-btn${isCommentLiked ? ' liked' : ''}" data-id="${comment.id}">
            ${isCommentLiked ? '❤️' : '🤍'} <span class="comment-like-count">${comment.likes || 0}</span>
          </button>
        </div>
        <div class="reply-form-wrap" id="reply-form-${comment.id}" style="display:none"></div>
      </div>
    </div>
  `;
  wrap.querySelector('.comment-delete-btn')?.addEventListener('click', () => deleteComment(comment.id));
  wrap.querySelector('.comment-like-btn')?.addEventListener('click', () => handleCommentLike(comment, wrap));
  if (!isReply) {
    wrap.querySelector('.reply-toggle-btn')?.addEventListener('click', () => {
      const replyWrap = document.getElementById(`reply-form-${comment.id}`);
      if (!replyWrap) return;
      if (replyWrap.style.display !== 'none') { replyWrap.style.display = 'none'; replyWrap.innerHTML = ''; }
      else { replyWrap.style.display = ''; renderReplyForm(replyWrap, comment.id); }
    });
  }
  return wrap;
}

function renderCommentForm() {
  const wrap = document.getElementById('comment-form-wrap');
  if (!wrap || !postData) return;
  if (!currentUser) {
    wrap.innerHTML = `<div class="comment-login-prompt"><span>로그인 후 댓글을 달 수 있습니다</span><button class="btn btn-primary btn-sm" id="comment-login-btn">로그인</button></div>`;
    document.getElementById('comment-login-btn')?.addEventListener('click', openLoginModal);
    return;
  }
  const isPostAuthor = currentUser.uid === postData.uid;
  wrap.innerHTML = `
    <div class="comment-input-block">
      ${!isPostAuthor ? `<div class="comment-anon-row"><label class="comment-anon-label"><input type="checkbox" id="comment-anon-cb" /> 익명으로 댓글</label></div>` : `<div style="font-size:12px;color:#10b981;margin-bottom:8px;font-weight:600">✓ 작성자로 표시됩니다</div>`}
      <div class="comment-input-row">
        <textarea id="comment-input" class="comment-textarea" placeholder="댓글을 입력하세요..." maxlength="500" rows="2"></textarea>
        <button class="btn btn-primary btn-sm" id="comment-submit-btn">등록</button>
      </div>
    </div>
  `;
  const submitBtn = document.getElementById('comment-submit-btn');
  const inputEl = document.getElementById('comment-input');
  const anonCb = document.getElementById('comment-anon-cb');
  submitBtn.addEventListener('click', async () => {
    const text = inputEl.value.trim();
    if (!text) return;
    submitBtn.disabled = true;
    submitBtn.textContent = '등록 중...';
    await submitComment(text, anonCb?.checked || false, null);
    inputEl.value = '';
    submitBtn.disabled = false;
    submitBtn.textContent = '등록';
  });
  inputEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitBtn.click(); } });
}

function renderReplyForm(container, parentId) {
  if (!currentUser) {
    container.innerHTML = `<div class="comment-login-prompt" style="margin-top:8px"><span>로그인 후 답글을 달 수 있습니다</span><button class="btn btn-primary btn-sm reply-login-btn">로그인</button></div>`;
    container.querySelector('.reply-login-btn')?.addEventListener('click', openLoginModal);
    return;
  }
  const isPostAuthor = currentUser.uid === postData.uid;
  container.innerHTML = `
    <div class="comment-input-block reply-input-block">
      ${!isPostAuthor ? `<div class="comment-anon-row"><label class="comment-anon-label"><input type="checkbox" class="reply-anon-cb" /> 익명으로 답글</label></div>` : `<div style="font-size:12px;color:#10b981;margin-bottom:6px;font-weight:600">✓ 작성자로 표시됩니다</div>`}
      <div class="comment-input-row">
        <textarea class="reply-input comment-textarea" placeholder="답글을 입력하세요..." maxlength="500" rows="2"></textarea>
        <button class="btn btn-primary btn-sm reply-submit-btn">등록</button>
      </div>
    </div>
  `;
  const submitBtn = container.querySelector('.reply-submit-btn');
  const inputEl = container.querySelector('.reply-input');
  const anonCb = container.querySelector('.reply-anon-cb');
  submitBtn.addEventListener('click', async () => {
    const text = inputEl.value.trim();
    if (!text) return;
    submitBtn.disabled = true;
    submitBtn.textContent = '등록 중...';
    await submitComment(text, anonCb?.checked || false, parentId);
    container.style.display = 'none';
    container.innerHTML = '';
    submitBtn.disabled = false;
    submitBtn.textContent = '등록';
  });
  inputEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitBtn.click(); } });
  inputEl.focus();
}

async function submitComment(content, isAnonymous, parentId) {
  if (!currentUser || !postData) return;
  const university = currentUserData?.university || localStorage.getItem(`gwatop_uni_${currentUser.uid}`) || '';
  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
      body: JSON.stringify({ action: 'add', postId, content, isAnonymous, parentId: parentId || null, nickname: currentUserData?.nickname || currentUser.displayName || '', university }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    postData.commentCount = (postData.commentCount || 0) + 1;
    await loadComments();
  } catch (e) {
    console.error('submitComment:', e);
    showToast(e.message || '댓글 등록 실패', 'error');
  }
}

async function deleteComment(commentId) {
  if (!currentUser) return;
  if (!confirm('댓글을 삭제하시겠습니까?')) return;
  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
      body: JSON.stringify({ action: 'delete', postId, commentId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    postData.commentCount = Math.max(0, (postData.commentCount || 1) - 1);
    await loadComments();
  } catch (e) {
    console.error('deleteComment:', e);
    showToast(e.message || '댓글 삭제 실패', 'error');
  }
}

async function handleCommentLike(comment, wrap) {
  if (!currentUser) { openLoginModal(); return; }
  const btn = wrap.querySelector('.comment-like-btn');
  if (!btn || btn.disabled) return;
  const countEl = btn.querySelector('.comment-like-count');
  const wasLiked = btn.classList.contains('liked');
  const beforeCount = parseInt(countEl.textContent) || 0;
  btn.disabled = true;
  btn.classList.toggle('liked');
  countEl.textContent = wasLiked ? Math.max(0, beforeCount - 1) : beforeCount + 1;
  btn.childNodes[0].textContent = wasLiked ? '🤍' : '❤️';
  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/like-comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
      body: JSON.stringify({ postId, commentId: comment.id }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    btn.classList.toggle('liked', data.liked);
    countEl.textContent = data.likes;
    btn.childNodes[0].textContent = data.liked ? '❤️' : '🤍';
  } catch {
    btn.classList.toggle('liked', wasLiked);
    countEl.textContent = beforeCount;
    btn.childNodes[0].textContent = wasLiked ? '❤️' : '🤍';
  } finally {
    btn.disabled = false;
  }
}

// ─── Login Modal ───
function setupLoginModal() {
  document.getElementById('modal-login-google')?.addEventListener('click', () => { closeLoginModal(); signInWithGoogle(); });
  document.getElementById('modal-login-kakao')?.addEventListener('click', () => { closeLoginModal(); signInWithKakao(); });
  document.getElementById('modal-login-naver')?.addEventListener('click', () => { closeLoginModal(); signInWithNaver(); });
  document.getElementById('modal-close-btn')?.addEventListener('click', closeLoginModal);
  document.getElementById('login-modal')?.addEventListener('click', e => { if (e.target === document.getElementById('login-modal')) closeLoginModal(); });
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
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function formatContent(str) { return escapeHtml(str).replace(/\n/g, '<br>'); }
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
