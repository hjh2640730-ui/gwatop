// ============================================================
// GWATOP - Post Detail Page Logic v1.0.0
// ============================================================

import { signInWithGoogle, signInWithKakao, signInWithNaver, logOut, onUserChange } from './auth.js';
import { checkAndShowNicknameModal } from './nickname.js';
import { db } from './auth.js';
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, limit, increment,
  arrayUnion, arrayRemove, serverTimestamp, runTransaction
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ─── State ───
let currentUser = null;
let currentUserData = null;
let postData = null;
const postId = new URLSearchParams(window.location.search).get('id');

// ─── Init ───
async function init() {
  if (!postId) {
    document.getElementById('post-view').innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:60px 0">게시글을 찾을 수 없습니다.</p>';
    return;
  }
  setupNav();
  setupLoginModal();
  await loadPost();
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
    // Re-render after auth state changes
    if (postData) {
      renderPostFooter();
      renderCommentForm();
      loadComments();
    }
  });
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

  postView.innerHTML = `
    <div class="post-detail-header">
      <div class="post-author-row">
        <div class="post-avatar" style="background:${avatarColor}">${escapeHtml(avatarChar)}</div>
        <div>
          <span class="post-author-name">${escapeHtml(displayName)}</span>
          <span class="post-uni-badge">${escapeHtml(postData.university || '')}</span>
        </div>
      </div>
      <span class="post-time">${timeAgo(postData.createdAt)}</span>
    </div>
    ${postData.title ? `<h1 class="post-detail-title">${escapeHtml(postData.title)}</h1>` : ''}
    <div class="post-detail-content">${formatContent(postData.content || '')}</div>
    ${postData.imageUrl ? `
      <div class="post-detail-image-wrap">
        <img class="post-detail-image" src="${escapeHtml(postData.imageUrl)}" alt="이미지" loading="lazy" />
      </div>` : ''}
    <div class="post-detail-footer" id="post-detail-footer">
      <div id="post-like-wrap"></div>
      <div id="post-action-wrap"></div>
    </div>
  `;

  // Lightbox for image
  const img = postView.querySelector('.post-detail-image');
  if (img) {
    img.addEventListener('click', () => {
      document.getElementById('lightbox-img').src = img.src;
      document.getElementById('img-lightbox').style.display = 'flex';
    });
  }

  renderPostFooter();
}

// ─── Render Post Footer (like + delete) ───
function renderPostFooter() {
  renderLikeButton();

  const wrap = document.getElementById('post-action-wrap');
  if (!wrap || !postData) return;

  if (currentUser?.uid === postData.uid) {
    wrap.innerHTML = `<button id="post-delete-btn" style="margin-left:8px;font-size:13px;color:var(--text-muted);background:none;border:none;cursor:pointer;padding:4px 8px;font-family:var(--font);">삭제</button>`;
    document.getElementById('post-delete-btn').addEventListener('click', deletePost);
    document.getElementById('post-delete-btn').addEventListener('mouseover', e => e.target.style.color = '#f87171');
    document.getElementById('post-delete-btn').addEventListener('mouseout', e => e.target.style.color = 'var(--text-muted)');
  } else {
    wrap.innerHTML = '';
  }
}

// ─── Delete Post ───
async function deletePost() {
  if (!currentUser || currentUser.uid !== postData.uid) return;
  if (!confirm('글을 삭제하시겠습니까?')) return;
  try {
    // 좋아요로 받은 크레딧 회수 (최대 10개)
    const likesEarned = Math.min(postData.likes || 0, 10);
    if (likesEarned > 0) {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        credits: increment(-likesEarned)
      });
    }
    await deleteDoc(doc(db, 'community_posts', postId));
    window.location.href = '/community.html';
  } catch (e) {
    console.error('deletePost:', e);
    showToast('글 삭제 실패', 'error');
  }
}

// ─── Render Like Button ───
function renderLikeButton() {
  const wrap = document.getElementById('post-like-wrap');
  if (!wrap || !postData) return;
  const isLiked = currentUser && Array.isArray(postData.likedBy) && postData.likedBy.includes(currentUser.uid);
  const isMine = currentUser?.uid === postData.uid;
  const likeCount = postData.likes || 0;

  wrap.innerHTML = `
    <button class="post-like-btn${isLiked ? ' liked' : ''}" id="detail-like-btn" ${isMine ? 'disabled title="내 글에는 좋아요를 누를 수 없습니다"' : ''}>
      <span class="like-heart">${isLiked ? '❤️' : '🤍'}</span>
      <span class="like-count">${likeCount}</span>
      ${likeCount >= 10 ? '<span class="like-maxed">MAX</span>' : ''}
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
  const maxedEl = btn.querySelector('.like-maxed');
  const wasLiked = btn.classList.contains('liked');
  const beforeCount = parseInt(countEl.textContent) || 0;
  const authorUid = postData.uid;

  // Optimistic UI
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

  // Update postData optimistically
  if (wasLiked) {
    postData.likes = Math.max(0, (postData.likes || 0) - 1);
    postData.likedBy = (postData.likedBy || []).filter(u => u !== currentUser.uid);
  } else {
    postData.likes = (postData.likes || 0) + 1;
    postData.likedBy = [...(postData.likedBy || []), currentUser.uid];
  }

  try {
    const postRef = doc(db, 'community_posts', postId);
    const giveCredit = authorUid && authorUid !== currentUser.uid;
    if (wasLiked) {
      await updateDoc(postRef, { likes: increment(-1), likedBy: arrayRemove(currentUser.uid) });
      if (giveCredit && beforeCount <= 10) {
        await updateDoc(doc(db, 'users', authorUid), { credits: increment(-1) });
      }
    } else {
      await updateDoc(postRef, { likes: increment(1), likedBy: arrayUnion(currentUser.uid) });
      if (giveCredit && beforeCount < 10) {
        await updateDoc(doc(db, 'users', authorUid), { credits: increment(1) });
      }
    }
  } catch (e) {
    // Revert
    btn.classList.toggle('liked');
    countEl.textContent = beforeCount;
    heart.textContent = wasLiked ? '❤️' : '🤍';
    if (wasLiked) {
      postData.likes = (postData.likes || 0) + 1;
      if (!postData.likedBy) postData.likedBy = [];
      postData.likedBy.push(currentUser.uid);
    } else {
      postData.likes = Math.max(0, (postData.likes || 0) - 1);
      postData.likedBy = (postData.likedBy || []).filter(u => u !== currentUser.uid);
    }
    console.error('like error:', e);
  }
}

// ─── Load Comments ───
async function loadComments() {
  const section = document.getElementById('comments-section');
  if (!section || !postData) return;

  try {
    const snap = await getDocs(
      query(collection(db, 'community_posts', postId, 'comments'), orderBy('createdAt', 'asc'), limit(200))
    );

    const allComments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const topLevel = allComments.filter(c => !c.parentId);
    const replies = allComments.filter(c => !!c.parentId);

    // Build reply map
    const replyMap = {};
    replies.forEach(r => {
      if (!replyMap[r.parentId]) replyMap[r.parentId] = [];
      replyMap[r.parentId].push(r);
    });

    // Update comment count heading
    const countEl = document.getElementById('comments-count-title');
    if (countEl) countEl.textContent = `댓글 ${allComments.length}개`;

    // Render list
    const listEl = document.getElementById('comments-list');
    if (!listEl) return;

    if (topLevel.length === 0) {
      listEl.innerHTML = '<p class="comments-empty">첫 댓글을 남겨보세요!</p>';
    } else {
      listEl.innerHTML = '';
      topLevel.forEach(comment => {
        listEl.appendChild(buildCommentEl(comment, false));
        // Render replies
        const commentReplies = replyMap[comment.id] || [];
        commentReplies.forEach(reply => {
          listEl.appendChild(buildCommentEl(reply, true));
        });
      });
    }

    renderCommentForm();
  } catch (e) {
    console.error('loadComments:', e);
    const listEl = document.getElementById('comments-list');
    if (listEl) listEl.innerHTML = '<p style="color:#f87171;text-align:center;padding:16px">댓글을 불러오지 못했습니다.</p>';
  }
}

// ─── Get Display Info ───
function getDisplayInfo(comment) {
  if (postData && comment.uid === postData.uid) {
    return { name: '작성자', isAuthor: true };
  }
  if (comment.isAnonymous) {
    return { name: `익명${comment.anonNumber || ''}`, isAuthor: false };
  }
  return { name: comment.nickname || '알 수 없음', isAuthor: false };
}

// ─── Build Comment Element ───
function buildCommentEl(comment, isReply) {
  const { name, isAuthor } = getDisplayInfo(comment);
  const isMine = currentUser && comment.uid === currentUser.uid;
  const avatarColor = isAuthor ? '#10b981' : (comment.isAnonymous ? '#374151' : getAvatarColor(comment.uid || name));
  const avatarChar = name[0] || '?';

  const wrap = document.createElement('div');
  wrap.className = isReply ? 'comment-item comment-reply' : 'comment-item';
  wrap.dataset.commentId = comment.id;

  if (comment.deleted) {
    wrap.innerHTML = `
      <div class="comment-deleted-row${isReply ? ' reply-indent' : ''}">
        <span class="comment-deleted-text">삭제된 댓글입니다.</span>
      </div>
    `;
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
        </div>
        <div class="reply-form-wrap" id="reply-form-${comment.id}" style="display:none"></div>
      </div>
    </div>
  `;

  // Delete
  wrap.querySelector('.comment-delete-btn')?.addEventListener('click', () => deleteComment(comment.id));

  // Reply toggle
  if (!isReply) {
    wrap.querySelector('.reply-toggle-btn')?.addEventListener('click', () => {
      const replyWrap = document.getElementById(`reply-form-${comment.id}`);
      if (!replyWrap) return;
      if (replyWrap.style.display !== 'none') {
        replyWrap.style.display = 'none';
        replyWrap.innerHTML = '';
      } else {
        replyWrap.style.display = '';
        renderReplyForm(replyWrap, comment.id);
      }
    });
  }

  return wrap;
}

// ─── Render Comment Form ───
function renderCommentForm() {
  const wrap = document.getElementById('comment-form-wrap');
  if (!wrap || !postData) return;

  if (!currentUser) {
    wrap.innerHTML = `
      <div class="comment-login-prompt">
        <span>로그인 후 댓글을 달 수 있습니다</span>
        <button class="btn btn-primary btn-sm" id="comment-login-btn">로그인</button>
      </div>
    `;
    document.getElementById('comment-login-btn')?.addEventListener('click', openLoginModal);
    return;
  }

  const isPostAuthor = currentUser.uid === postData.uid;

  wrap.innerHTML = `
    <div class="comment-input-block">
      ${!isPostAuthor ? `
      <div class="comment-anon-row">
        <label class="comment-anon-label">
          <input type="checkbox" id="comment-anon-cb" />
          익명으로 댓글
        </label>
      </div>` : `<div style="font-size:12px;color:#10b981;margin-bottom:8px;font-weight:600">✓ 작성자로 표시됩니다</div>`}
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

  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitBtn.click();
    }
  });
}

// ─── Render Reply Form ───
function renderReplyForm(container, parentId) {
  if (!currentUser) {
    container.innerHTML = `
      <div class="comment-login-prompt" style="margin-top:8px">
        <span>로그인 후 답글을 달 수 있습니다</span>
        <button class="btn btn-primary btn-sm reply-login-btn">로그인</button>
      </div>
    `;
    container.querySelector('.reply-login-btn')?.addEventListener('click', openLoginModal);
    return;
  }

  const isPostAuthor = currentUser.uid === postData.uid;

  container.innerHTML = `
    <div class="comment-input-block reply-input-block">
      ${!isPostAuthor ? `
      <div class="comment-anon-row">
        <label class="comment-anon-label">
          <input type="checkbox" class="reply-anon-cb" />
          익명으로 답글
        </label>
      </div>` : `<div style="font-size:12px;color:#10b981;margin-bottom:6px;font-weight:600">✓ 작성자로 표시됩니다</div>`}
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

  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitBtn.click();
    }
  });

  inputEl.focus();
}

// ─── Submit Comment ───
async function submitComment(content, isAnonymous, parentId) {
  if (!currentUser || !postData) return;

  const university = currentUserData?.university || localStorage.getItem(`gwatop_uni_${currentUser.uid}`) || '';
  const isPostAuthor = currentUser.uid === postData.uid;
  // Post author always shows as 작성자, never anonymous
  const effectiveAnonymous = isPostAuthor ? false : isAnonymous;

  let anonNumber = null;

  if (effectiveAnonymous) {
    // Get or assign anonymous number via transaction
    try {
      const postRef = doc(db, 'community_posts', postId);
      await runTransaction(db, async (transaction) => {
        const postSnap = await transaction.get(postRef);
        if (!postSnap.exists()) throw new Error('Post not found');
        const data = postSnap.data();
        const anonMap = data.anonymousMap || {};
        const counter = data.anonymousCounter || 0;

        if (anonMap[currentUser.uid] !== undefined) {
          anonNumber = anonMap[currentUser.uid];
        } else {
          anonNumber = counter + 1;
          const newMap = { ...anonMap, [currentUser.uid]: anonNumber };
          transaction.update(postRef, {
            anonymousMap: newMap,
            anonymousCounter: anonNumber
          });
        }
      });
    } catch (e) {
      console.error('anonNumber transaction error:', e);
      showToast('댓글 등록 실패. 다시 시도해주세요.', 'error');
      return;
    }
  }

  try {
    await addDoc(collection(db, 'community_posts', postId, 'comments'), {
      uid: currentUser.uid,
      isAnonymous: effectiveAnonymous,
      anonNumber: anonNumber,
      nickname: currentUserData?.nickname || currentUser.displayName || '',
      university,
      content,
      parentId: parentId || null,
      deleted: false,
      createdAt: serverTimestamp()
    });

    await updateDoc(doc(db, 'community_posts', postId), { commentCount: increment(1) });
    // Update local postData commentCount
    postData.commentCount = (postData.commentCount || 0) + 1;

    await loadComments();
  } catch (e) {
    console.error('submitComment:', e);
    showToast('댓글 등록 실패', 'error');
  }
}

// ─── Delete Comment (soft) ───
async function deleteComment(commentId) {
  if (!currentUser) return;
  if (!confirm('댓글을 삭제하시겠습니까?')) return;
  try {
    const commentRef = doc(db, 'community_posts', postId, 'comments', commentId);
    await updateDoc(commentRef, { deleted: true, content: '' });
    await loadComments();
  } catch (e) {
    console.error('deleteComment:', e);
    showToast('댓글 삭제 실패', 'error');
  }
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
