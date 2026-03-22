// ============================================================
// GWATOP - 하나빼기 게임
// ============================================================

import { createHandScene } from './hand3d.js';
import { signInWithGoogle, signInWithKakao, signInWithNaver, logOut, onUserChange, ensureUserDoc } from './auth.js';
import { db, rtdb } from './auth.js';
import {
  collection, doc, query, where, limit, onSnapshot,
  getDocs, getDoc, addDoc, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  ref as rtdbRef, onValue, push as rtdbPush, off
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

let currentUser = null;
let currentUserData = null;
let activeGameId = null;
let activeGameListener = null;
let roomsListener = null;
let pendingListener = null;
let pendingPollingId = null;
let countdownInterval = null;
let allRoomDocs = [];
let chatListener = null;
let pendingJoinGameId = null;
let resultShown = false;

// 하나빼기 state
let selectedLeftHand = null;
let selectedRightHand = null;
let introFinished = false;
let latestGameState = null;    // buffer during intro
let latestGameIsP1 = false;

// 3D scene
let handScene = null;
let phase2HandsShown = false;
let myHandRemoved = false;
let oppHandRemoved = false;
let mySelectionEnabled = false;
let rematchTimeoutId = null;
let phase1TimerId = null;
let phase2TimerId = null;
let roomsPollingId = null;

const ACTIVE_GAME_KEY = 'gwatop_active_game';
const EMOJI = { '가위': '✌️', '바위': '✊', '보': '🖐️' };

// ─── Init ───
function init() {
  setupNav();
  setupUI();

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
      document.getElementById('my-fp').textContent = (userData?.freePoints ?? 0) + 'P';
      checkActiveGame();
    } else {
      lo.style.display = '';
      li.style.display = 'none';
      document.getElementById('my-fp').textContent = '로그인 필요';
      const bar = document.getElementById('game-fp-bar');
      if (bar) {
        bar.style.cursor = 'pointer';
        bar.title = '로그인하면 무료 포인트를 확인할 수 있어요';
        bar.onclick = openLoginModal;
      }
    }
    loadRooms();
  });
}

// ─── Nav ───
function setupNav() {
  document.getElementById('nav-login-btn')?.addEventListener('click', openLoginModal);
  document.getElementById('nav-logout-btn')?.addEventListener('click', () => logOut());
  document.getElementById('modal-login-google')?.addEventListener('click', () => { closeLoginModal(); signInWithGoogle(); });
  document.getElementById('modal-login-kakao')?.addEventListener('click', () => { closeLoginModal(); signInWithKakao(); });
  document.getElementById('modal-login-naver')?.addEventListener('click', () => { closeLoginModal(); signInWithNaver(); });
  document.getElementById('modal-close-btn')?.addEventListener('click', closeLoginModal);
  document.getElementById('login-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('login-modal')) closeLoginModal();
  });
}

// ─── UI ───
function setupUI() {
  const slider = document.getElementById('wager-slider');
  const valEl = document.getElementById('wager-val');
  slider?.addEventListener('input', () => { valEl.textContent = slider.value; });

  const titleInput = document.getElementById('room-title-input');
  const titleCount = document.getElementById('room-title-count');
  titleInput?.addEventListener('input', () => { titleCount.textContent = titleInput.value.length; });

  const pwInput = document.getElementById('room-pw-input');
  document.getElementById('room-pw-toggle')?.addEventListener('click', () => {
    pwInput.type = pwInput.type === 'password' ? 'text' : 'password';
  });

  // 방 만들기 모달 열기/닫기
  document.getElementById('open-create-modal-btn')?.addEventListener('click', () => {
    if (!currentUser) { openLoginModal(); return; }
    document.getElementById('create-room-modal')?.classList.add('visible');
  });
  document.getElementById('create-room-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('create-room-modal')?.classList.remove('visible');
  });
  document.getElementById('create-room-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('create-room-modal')) {
      document.getElementById('create-room-modal').classList.remove('visible');
    }
  });

  const joinPwInput = document.getElementById('join-pw-input');
  document.getElementById('join-pw-toggle')?.addEventListener('click', () => {
    joinPwInput.type = joinPwInput.type === 'password' ? 'text' : 'password';
  });
  document.getElementById('join-pw-confirm')?.addEventListener('click', () => {
    const pw = joinPwInput.value.trim();
    if (!pw) { showToast('비밀번호를 입력해주세요', 'warning'); return; }
    const gameId = pendingJoinGameId;
    closeJoinPwModal();
    joinRoom(gameId, pw);
  });
  document.getElementById('join-pw-cancel')?.addEventListener('click', closeJoinPwModal);
  joinPwInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const pw = joinPwInput.value.trim();
      if (!pw) return;
      const gameId = pendingJoinGameId;
      closeJoinPwModal();
      joinRoom(gameId, pw);
    }
  });

  const searchInput = document.getElementById('room-search');
  const searchWrap = document.getElementById('room-search-wrap');
  const searchClear = document.getElementById('room-search-clear');
  searchInput?.addEventListener('input', () => {
    const q = searchInput.value.trim();
    searchWrap.classList.toggle('has-value', q.length > 0);
    renderRooms(filterRooms(q));
  });
  searchClear?.addEventListener('click', () => {
    searchInput.value = '';
    searchWrap.classList.remove('has-value');
    renderRooms(allRoomDocs);
  });

  document.getElementById('create-room-btn')?.addEventListener('click', async () => {
    if (!currentUser) { openLoginModal(); return; }
    const stored = getStoredGame();
    if (stored) { showToast('이미 대기 중인 방이 있습니다', 'warning'); return; }
    const wager = parseInt(slider.value);
    const fp = currentUserData?.freePoints ?? 0;
    if (fp < wager) { showToast(`무료 포인트 부족 (보유: ${fp}P)`, 'error'); return; }
    const btn = document.getElementById('create-room-btn');
    btn.disabled = true;
    btn.textContent = '생성 중...';
    const title = titleInput?.value.trim() || '';
    const password = pwInput?.value.trim() || '';
    await createRoom(wager, title, password);
    btn.disabled = false;
    btn.textContent = '방 만들기';
    document.getElementById('create-room-modal')?.classList.remove('visible');
    if (titleInput) titleInput.value = '';
    if (titleCount) titleCount.textContent = '0';
    if (pwInput) pwInput.value = '';
  });

  document.getElementById('result-close-btn')?.addEventListener('click', closeModal);
  document.getElementById('game-modal')?.addEventListener('click', e => {
    if (e.target !== document.getElementById('game-modal')) return;
    if (document.getElementById('state-result').style.display !== 'none') closeModal();
  });

  // 재대결 신청
  document.getElementById('rematch-btn')?.addEventListener('click', async () => {
    if (!currentUser) { openLoginModal(); return; }
    const wager = parseInt(document.getElementById('rematch-wager-input').value);
    if (!wager || wager < 1 || wager > 10) { showToast('배팅은 1~10P', 'warning'); return; }
    const fp = currentUserData?.freePoints ?? 0;
    if (fp < wager) { showToast(`무료 포인트 부족 (보유: ${fp}P)`, 'error'); return; }
    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/game-rps', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rematch_request', gameId: activeGameId, wager }),
    });
    const data = await res.json();
    if (data.error) { showToast(data.error, 'error'); return; }
    showRematchSection('pending', wager);
    startRematchTimeout();
  });

  document.getElementById('rematch-cancel-btn')?.addEventListener('click', async () => {
    clearRematchTimeout();
    const idToken = await currentUser.getIdToken();
    await fetch('/api/game-rps', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rematch_decline', gameId: activeGameId }),
    });
    showRematchSection('request');
  });

  document.getElementById('rematch-accept-btn')?.addEventListener('click', async () => {
    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/game-rps', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rematch_accept', gameId: activeGameId }),
    });
    const data = await res.json();
    if (data.error) { showToast(data.error, 'error'); return; }
    closeModal();
    openGameModal(data.newGameId, data.isP1);
  });

  document.getElementById('rematch-decline-btn')?.addEventListener('click', async () => {
    const idToken = await currentUser.getIdToken();
    await fetch('/api/game-rps', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rematch_decline', gameId: activeGameId }),
    });
    showRematchSection('request');
  });

  // Phase 1: 왼손/오른손 선택
  document.getElementById('left-hand-choices')?.addEventListener('click', e => {
    const btn = e.target.closest('.hand-btn');
    if (!btn || btn.disabled) return;
    document.querySelectorAll('#left-hand-choices .hand-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedLeftHand = btn.dataset.hand;
    updateSubmitHandsBtn();
  });

  document.getElementById('right-hand-choices')?.addEventListener('click', e => {
    const btn = e.target.closest('.hand-btn');
    if (!btn || btn.disabled) return;
    document.querySelectorAll('#right-hand-choices .hand-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedRightHand = btn.dataset.hand;
    updateSubmitHandsBtn();
  });

  document.getElementById('submit-hands-btn')?.addEventListener('click', () => {
    if (!selectedLeftHand || !selectedRightHand) return;
    submitHands(selectedLeftHand, selectedRightHand);
  });
}

function updateSubmitHandsBtn() {
  const btn = document.getElementById('submit-hands-btn');
  if (btn) btn.disabled = !(selectedLeftHand && selectedRightHand);
}

// ─── localStorage 헬퍼 ───
function storeGame(gameId, uid) {
  localStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify({ gameId, uid }));
}
function clearStoredGame() {
  localStorage.removeItem(ACTIVE_GAME_KEY);
}
function getStoredGame() {
  try {
    const d = JSON.parse(localStorage.getItem(ACTIVE_GAME_KEY) || 'null');
    if (d && currentUser && d.uid === currentUser.uid) return d;
    return null;
  } catch { return null; }
}

// ─── 재방문 시 활성 게임 복원 ───
function checkActiveGame() {
  const stored = getStoredGame();
  if (!stored) return;
  if (pendingListener) { pendingListener(); pendingListener = null; }
  if (pendingPollingId) { clearInterval(pendingPollingId); pendingPollingId = null; }

  const poll = async () => {
    try {
      const snap = await getDoc(doc(db, 'games', stored.gameId));
      if (!snap.exists()) {
        clearStoredGame();
        clearInterval(pendingPollingId); pendingPollingId = null;
        return;
      }
      const game = { id: snap.id, ...snap.data() };
      if (game.status === 'cancelled' || game.status === 'finished') {
        clearStoredGame();
        clearInterval(pendingPollingId); pendingPollingId = null;
      } else if (game.status === 'ready' || game.status === 'hands_shown') {
        clearStoredGame();
        clearInterval(pendingPollingId); pendingPollingId = null;
        const isP1 = game.player1?.uid === currentUser?.uid;
        if (game.status === 'ready') showToast('상대방이 입장했습니다! 게임을 시작하세요 🎮', 'success');
        openGameModal(stored.gameId, isP1);
      }
    } catch (e) { console.error('checkActiveGame poll:', e); }
  };

  poll();
  pendingPollingId = setInterval(poll, 3000);
}

function getRemainingMin(createdAt) {
  if (!createdAt) return 10;
  const t = typeof createdAt === 'string' ? new Date(createdAt) : (createdAt.toDate?.() || new Date());
  return Math.max(0, Math.ceil((10 * 60 * 1000 - (Date.now() - t.getTime())) / 60000));
}

function filterRooms(query) {
  if (!query) return allRoomDocs;
  const q = query.toLowerCase();
  return allRoomDocs.filter(d => {
    const g = d.data();
    return (g.title || '').toLowerCase().includes(q) || (g.player1?.name || '').toLowerCase().includes(q);
  });
}

function renderRooms(docs) {
  const list = document.getElementById('rooms-list');
  if (!list) return;
  if (!docs.length) {
    const isSearch = document.getElementById('room-search')?.value.trim();
    list.innerHTML = `<div class="room-empty">${isSearch ? '검색 결과가 없습니다' : '열린 게임방이 없습니다'}</div>`;
    return;
  }
  list.innerHTML = docs.map(d => {
    const g = d.data();
    const isMine = currentUser && g.player1?.uid === currentUser.uid;
    const lockBadge = g.hasPassword ? ' <span class="room-lock-badge">🔒 비공개</span>' : '';
    const safeTitle = escapeHtml(g.title);
    const safeName = escapeHtml(g.player1?.name || '익명');
    const titleHtml = g.title
      ? `<div class="room-title-on-card">${safeTitle}${lockBadge}</div><div class="room-host-name">${safeName}</div>`
      : `<div class="room-title-on-card">${safeName}의 방${lockBadge}</div>`;
    if (isMine) {
      const remaining = getRemainingMin(g.createdAt);
      return `<div class="room-card mine">
        <div class="room-card-left">
          <div>
            <div style="display:flex;align-items:center;gap:6px">
              ${g.title ? `<span class="room-name" style="color:var(--text-primary)">${safeTitle}</span>` : '<span class="room-name" style="color:var(--text-primary)">내 방</span>'}
              <span class="room-mine-badge">대기 중</span>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">상대방 기다리는 중 · <span class="room-expire-min">${remaining}</span>분 후 만료</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="room-wager">🟢 ${g.wager}P</span>
          <button class="btn btn-ghost btn-sm cancel-inline-btn" data-id="${d.id}" style="white-space:nowrap">방 취소</button>
        </div>
      </div>`;
    }
    return `<button class="room-card" data-id="${d.id}">
      <div class="room-card-left">
        <div>${titleHtml}</div>
      </div>
      <span class="room-wager">🟢 ${g.wager}P</span>
    </button>`;
  }).join('');

  list.querySelectorAll('.room-card:not(.mine)').forEach(card => {
    card.addEventListener('click', () => {
      const d = allRoomDocs.find(d => d.id === card.dataset.id);
      if (d?.data().hasPassword) openJoinPwModal(card.dataset.id);
      else joinRoom(card.dataset.id);
    });
  });
  list.querySelectorAll('.cancel-inline-btn').forEach(btn => {
    btn.addEventListener('click', () => cancelRoomById(btn.dataset.id));
  });

  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    list.querySelectorAll('.room-expire-min').forEach(el => {
      const current = parseInt(el.textContent);
      if (current <= 0) return;
      el.textContent = current - 1;
      if (current - 1 <= 2) el.style.color = '#ef4444';
    });
  }, 60000);
}

function loadRooms() {
  if (roomsListener) { roomsListener(); roomsListener = null; }
  if (roomsPollingId) { clearInterval(roomsPollingId); roomsPollingId = null; }
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }

  fetchRooms();
  roomsPollingId = setInterval(fetchRooms, 10000);
}

async function fetchRooms() {
  try {
    const q = query(collection(db, 'games'), where('status', '==', 'waiting'), limit(30));
    const snap = await getDocs(q);
    const now = Date.now();
    allRoomDocs = snap.docs.filter(d => {
      const ts = d.data().createdAt;
      if (!ts) return true;
      const t = typeof ts === 'string' ? new Date(ts) : (ts.toDate?.() || new Date());
      return now - t.getTime() < 10 * 60 * 1000;
    });
    const searchQuery = document.getElementById('room-search')?.value.trim() || '';
    renderRooms(filterRooms(searchQuery));
  } catch { /* 네트워크 오류 시 현재 상태 유지 */ }
}

async function createRoom(wager, title = '', password = '') {
  const idToken = await currentUser.getIdToken();
  let res = await fetch('/api/game-rps', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', wager, title, password }),
  });
  let data = await res.json();
  // Firestore 문서 없음 → 재생성 후 1회 재시도
  if (res.status === 404 && data.error?.includes('계정 정보')) {
    try { await ensureUserDoc(currentUser, { provider: currentUser.providerData?.[0]?.providerId?.replace('.com','') || '' }); } catch (_) {}
    const idToken2 = await currentUser.getIdToken(true);
    res = await fetch('/api/game-rps', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${idToken2}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', wager, title, password }),
    });
    data = await res.json();
  }
  if (data.error) { showToast(data.error, 'error'); return; }
  storeGame(data.gameId, currentUser.uid);
  showToast('방이 생성됐습니다! 상대방을 기다리는 중...', 'success');
  checkActiveGame();
}

function openJoinPwModal(gameId) {
  pendingJoinGameId = gameId;
  const input = document.getElementById('join-pw-input');
  if (input) { input.value = ''; input.type = 'password'; }
  document.getElementById('join-pw-modal').classList.add('visible');
  setTimeout(() => input?.focus(), 100);
}
function closeJoinPwModal() {
  document.getElementById('join-pw-modal').classList.remove('visible');
  pendingJoinGameId = null;
}

async function joinRoom(gameId, password = '') {
  if (!currentUser) { openLoginModal(); return; }
  const idToken = await currentUser.getIdToken();
  let res = await fetch('/api/game-rps', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'join', gameId, password }),
  });
  let data = await res.json();
  // Firestore 문서 없음 → 재생성 후 1회 재시도
  if (res.status === 404 && data.error?.includes('계정 정보')) {
    try { await ensureUserDoc(currentUser, { provider: currentUser.providerData?.[0]?.providerId?.replace('.com','') || '' }); } catch (_) {}
    const idToken2 = await currentUser.getIdToken(true);
    res = await fetch('/api/game-rps', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${idToken2}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'join', gameId, password }),
    });
    data = await res.json();
  }
  if (data.error) { showToast(data.error, 'error'); return; }
  storeGame(gameId, currentUser.uid);
  openGameModal(gameId, false);
}

async function cancelRoomById(gameId) {
  const idToken = await currentUser.getIdToken();
  await fetch('/api/game-rps', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'cancel', gameId }),
  });
  clearStoredGame();
  if (pendingPollingId) { clearInterval(pendingPollingId); pendingPollingId = null; }
  showToast('방이 취소됐습니다', 'success');
}

// ─── 게임 모달 오픈 ───
function openGameModal(gameId, isP1) {
  // 게임 중에는 방 목록 폴링 불필요
  if (roomsPollingId) { clearInterval(roomsPollingId); roomsPollingId = null; }
  activeGameId = gameId;
  resultShown = false;
  introFinished = false;
  latestGameState = null;
  latestGameIsP1 = isP1;

  // Reset selections and 3D state
  selectedLeftHand = null;
  selectedRightHand = null;
  phase2HandsShown = false;
  myHandRemoved = false;
  oppHandRemoved = false;
  mySelectionEnabled = false;
  clearPhaseTimers();
  document.querySelectorAll('#left-hand-choices .hand-btn, #right-hand-choices .hand-btn').forEach(b => {
    b.classList.remove('selected');
    b.disabled = false;
  });
  document.getElementById('submit-hands-btn').disabled = true;
  document.getElementById('rps-status').textContent = '';
  document.getElementById('rps-status-final').textContent = '';

  document.getElementById('game-modal').classList.add('visible');

  openChat(gameId);
  if (activeGameListener) { activeGameListener(); activeGameListener = null; }
  const gameRef = doc(db, 'games', gameId);
  activeGameListener = onSnapshot(gameRef, snap => {
    if (!snap.exists()) return;
    syncModal({ id: gameId, ...snap.data() }, isP1);
  });

  // "건승을 빕니다." 인트로 → 2초 후 선택 화면
  showState('start');
  setTimeout(() => {
    introFinished = true;
    showState('choose');
    showPhase('hands');
    if (latestGameState) {
      syncModal(latestGameState, latestGameIsP1);
      latestGameState = null;
    }
  }, 2000);
}

function syncModal(game, isP1) {
  if (!introFinished) {
    latestGameState = game;
    latestGameIsP1 = isP1;
    return;
  }

  document.getElementById('c-wager').textContent = game.wager;

  if (game.status === 'ready') {
    document.getElementById('chat-section').style.display = '';

    // VS display
    const me = isP1 ? (game.player1 || {}) : (game.player2 || {});
    const opp = isP1 ? (game.player2 || {}) : (game.player1 || {});
    document.getElementById('vs-display').innerHTML = `
      <div class="rps-player">
        <span class="rps-player-name">${opp.name || '익명'}</span>
      </div>
      <span class="rps-vs-text">VS</span>
      <div class="rps-player">
        <span class="rps-player-name" style="font-weight:800;color:var(--text-primary)">${me.name || '익명'} <span style="font-size:9px;color:#34d399">나</span></span>
      </div>`;

    showPhase('hands');

    // Opponent submission status
    const oppSubmitted = isP1 ? game.p2HandsSubmitted : game.p1HandsSubmitted;
    const mySubmitted  = isP1 ? game.p1HandsSubmitted : game.p2HandsSubmitted;
    const statusEl = document.getElementById('rps-status');

    if (!phase1TimerId) startPhase1Timer();

    if (mySubmitted) {
      // Disable hand buttons after submission
      document.querySelectorAll('#left-hand-choices .hand-btn, #right-hand-choices .hand-btn').forEach(b => b.disabled = true);
      document.getElementById('submit-hands-btn').disabled = true;
      if (oppSubmitted) {
        statusEl.textContent = '둘 다 제출 완료! 결과 집계 중...';
        statusEl.style.color = '';
      } else {
        statusEl.textContent = '양손 제출 완료! 상대방 기다리는 중...';
        statusEl.style.color = '';
      }
    } else if (oppSubmitted) {
      statusEl.textContent = '상대방이 양손을 제출했습니다! 빨리 선택하세요 ⚡';
      statusEl.style.color = '#f59e0b';
    }
  }

  if (game.status === 'hands_shown') {
    stopPhase1Timer();
    document.getElementById('chat-section').style.display = '';
    showPhase('final');
    renderPhase2(game, isP1);
  }

  if (game.status === 'finished') {
    if (!resultShown) {
      resultShown = true;
      stopPhase2Timer();

      const result   = game.result || {};
      const oppHands = isP1
        ? { left: game.p2LeftHand, right: game.p2RightHand }
        : { left: game.p1LeftHand, right: game.p1RightHand };
      const oppFinalHand = isP1 ? result.p2FinalHand : result.p1FinalHand;

      // 상대방 카드 제거 (드라마틱 reveal)
      if (oppFinalHand && handScene && !oppHandRemoved) {
        oppHandRemoved = true;
        const removeSide = oppFinalHand === oppHands.left ? 'right' : 'left';
        handScene.removeHand('opp', removeSide);
      }

      const delay = (oppFinalHand && handScene) ? 900 : 0;
      setTimeout(() => {
        if (game.drawRematchId) {
          clearStoredGame();
          storeGame(game.drawRematchId, currentUser.uid);
          showState('draw');
          const drawEmoji = document.getElementById('draw-emoji');
          if (drawEmoji) drawEmoji.style.animation = 'drawShake 0.6s ease-in-out 0.3s both';
          setTimeout(() => openGameModal(game.drawRematchId, isP1), 2500);
          return;
        }
        showResult(game, isP1);
      }, delay);
    }
    // 재대결 신청 상태 반영
    const rr = game.rematchRequest;
    if (!rr) return;
    if (rr.status === 'pending') {
      if (rr.fromUid === currentUser?.uid) {
        showRematchSection('pending', rr.wager);
      } else {
        showRematchSection('incoming');
        document.getElementById('rematch-incoming-text').textContent =
          `${rr.fromName || '상대방'}이 재대결을 신청했습니다! (${rr.wager}P)`;
      }
    } else if (rr.status === 'accepted' && rr.newGameId && rr.fromUid === currentUser?.uid) {
      clearRematchTimeout();
      closeModal();
      openGameModal(rr.newGameId, game.player1?.uid === currentUser.uid);
    } else if (rr.status === 'declined' && rr.fromUid === currentUser?.uid) {
      clearRematchTimeout();
      showRematchSection('request');
      showToast('상대방이 재대결을 거절했습니다', 'warning');
    }
  }
}

function renderPhase2(game, isP1) {
  const me = isP1
    ? { left: game.p1LeftHand, right: game.p1RightHand }
    : { left: game.p2LeftHand, right: game.p2RightHand };
  const opp = isP1
    ? { left: game.p2LeftHand, right: game.p2RightHand }
    : { left: game.p1LeftHand, right: game.p1RightHand };
  const myFinalSubmitted  = isP1 ? game.p1FinalSubmitted : game.p2FinalSubmitted;
  const oppFinalSubmitted = isP1 ? game.p2FinalSubmitted : game.p1FinalSubmitted;
  const myFinalHand  = isP1 ? game.p1FinalHand : game.p2FinalHand;
  const oppFinalHand = isP1 ? game.p2FinalHand : game.p1FinalHand;

  // ── 3D 씬 초기화 (처음 한 번만) ──
  if (!phase2HandsShown) {
    phase2HandsShown = true;
    const canvas = document.getElementById('hand-3d-canvas');
    if (canvas) {
      if (handScene) { handScene.dispose(); handScene = null; }
      handScene = createHandScene(canvas);
      handScene.showHands(me, opp);
    }
  }

  // ── 3D 카드 선택 활성화 (처음 한 번만) ──
  if (!myFinalSubmitted && !mySelectionEnabled && handScene) {
    mySelectionEnabled = true;
    handScene.enableSelection(side => {
      stopPhase2Timer();
      myHandRemoved = true;
      submitFinal(side === 'left' ? me.left : me.right);
    });
    if (!phase2TimerId) startPhase2Timer(handScene);
  } else if (myFinalSubmitted && !myHandRemoved && myFinalHand) {
    // 이미 제출됐는데 3D 제거가 안 됐다면 (새로고침 복원 시)
    myHandRemoved = true;
    const removeSide = myFinalHand === me.left ? 'right' : 'left';
    setTimeout(() => handScene?.removeHand('my', removeSide), 400);
  }

  // ── 상태 텍스트 ──
  const statusEl = document.getElementById('rps-status-final');
  if (myFinalSubmitted && oppFinalSubmitted) {
    statusEl.textContent = '둘 다 선택 완료! 결과 집계 중...';
    statusEl.style.color = '';
  } else if (myFinalSubmitted) {
    statusEl.textContent = '최종 선택 완료! 상대방 기다리는 중...';
    statusEl.style.color = '';
  } else if (oppFinalSubmitted) {
    statusEl.textContent = '상대방이 선택했습니다! 빨리 선택하세요 ⚡';
    statusEl.style.color = '#f59e0b';
  } else {
    statusEl.textContent = '카드를 눌러 낼 손을 선택하세요';
  }
}

function showPhase(phase) {
  document.getElementById('phase-hands').style.display = phase === 'hands' ? '' : 'none';
  document.getElementById('phase-final').style.display  = phase === 'final'  ? '' : 'none';
}

function showRematchSection(section, wager) {
  document.getElementById('rematch-request-section').style.display  = section === 'request'  ? '' : 'none';
  document.getElementById('rematch-pending-section').style.display  = section === 'pending'  ? '' : 'none';
  document.getElementById('rematch-incoming-section').style.display = section === 'incoming' ? '' : 'none';
  if (section === 'pending' && wager) {
    document.getElementById('rematch-pending-text').textContent = `재대결 신청 중... (${wager}P)`;
  }
}

function showState(state) {
  document.getElementById('state-start').style.display  = state === 'start'  ? '' : 'none';
  document.getElementById('state-draw').style.display   = state === 'draw'   ? '' : 'none';
  document.getElementById('state-choose').style.display = state === 'choose' ? '' : 'none';
  document.getElementById('state-result').style.display = state === 'result' ? '' : 'none';
}

function showResult(game, isP1) {
  const result = game.result || {};
  const myUid = currentUser?.uid;
  const amIP1 = isP1 ?? (game.player1?.uid === myUid);
  const myChoice  = amIP1 ? result.p1FinalHand : result.p2FinalHand;
  const oppChoice = amIP1 ? result.p2FinalHand : result.p1FinalHand;

  let icon, title, pts, cls;
  if (!game.winner) {
    icon = '🤝'; title = '비겼습니다!'; pts = '±0P'; cls = 'draw';
  } else if (game.winner === myUid) {
    icon = '🏆'; title = result.timeout ? '상대방 시간 초과!' : '승리!'; pts = `+${game.wager}P`; cls = 'win';
    if (currentUserData) {
      currentUserData.freePoints = (currentUserData.freePoints || 0) + game.wager;
      document.getElementById('my-fp').textContent = currentUserData.freePoints + 'P';
    }
  } else {
    icon = '😢'; title = result.timeout ? '시간 초과 패배...' : '패배...'; pts = `-${game.wager}P`; cls = 'lose';
    if (currentUserData) {
      currentUserData.freePoints = Math.max(0, (currentUserData.freePoints || 0) - game.wager);
      document.getElementById('my-fp').textContent = currentUserData.freePoints + 'P';
    }
  }

  clearStoredGame();
  document.getElementById('result-icon').textContent = icon;
  document.getElementById('result-title').textContent = title;
  document.getElementById('result-choices').innerHTML = `
    <div class="rps-result-side"><span class="rps-result-emoji">${EMOJI[myChoice] || '?'}</span><span class="rps-result-label">나</span></div>
    <span class="rps-result-vs-txt">VS</span>
    <div class="rps-result-side"><span class="rps-result-emoji">${EMOJI[oppChoice] || '?'}</span><span class="rps-result-label">상대</span></div>`;
  document.getElementById('result-points').textContent = pts;
  document.getElementById('result-points').className = `rps-point-change ${cls}`;
  showRematchSection('request');
  showState('result');
}

// ─── Phase 1 제출 ───
async function submitHands(leftHand, rightHand) {
  const btn = document.getElementById('submit-hands-btn');
  btn.disabled = true;
  document.querySelectorAll('#left-hand-choices .hand-btn, #right-hand-choices .hand-btn').forEach(b => b.disabled = true);
  const idToken = await currentUser.getIdToken();
  const res = await fetch('/api/game-rps', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'submit_hands', gameId: activeGameId, leftHand, rightHand }),
  });
  const data = await res.json();
  if (data.error) {
    showToast(data.error, 'error');
    btn.disabled = false;
    document.querySelectorAll('#left-hand-choices .hand-btn, #right-hand-choices .hand-btn').forEach(b => b.disabled = false);
  }
}

// ─── 시간 초과 패배 ───
async function submitTimeout() {
  if (!activeGameId || !currentUser) return;
  const idToken = await currentUser.getIdToken();
  await fetch('/api/game-rps', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'timeout', gameId: activeGameId }),
  });
}

// ─── Phase 2 제출 ───
async function submitFinal(finalHand) {
  const idToken = await currentUser.getIdToken();
  const res = await fetch('/api/game-rps', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'submit_final', gameId: activeGameId, finalHand }),
  });
  const data = await res.json();
  if (data.error) {
    showToast(data.error, 'error');
  }
}

// ─── 채팅 ───
function openChat(gameId) {
  if (chatListener) { off(rtdbRef(rtdb, `game_chat/${gameId}`)); chatListener = null; }
  document.getElementById('chat-section').style.display = '';

  const chatRef = rtdbRef(rtdb, `game_chat/${gameId}`);
  chatListener = onValue(chatRef, snap => {
    const messages = [];
    snap.forEach(child => messages.push({ id: child.key, ...child.val() }));
    renderMessages(messages);
  }, err => {
    console.error('chat onValue error:', err);
    const container = document.getElementById('chat-messages');
    if (container) container.innerHTML = '<div class="chat-empty">채팅을 사용할 수 없습니다 (서버 오류)</div>';
  });

  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');

  const doSend = async () => {
    const text = input.value.trim();
    if (!text || !currentUser) return;
    input.value = '';
    try {
      await rtdbPush(rtdbRef(rtdb, `game_chat/${gameId}`), {
        uid: currentUser.uid,
        name: currentUserData?.nickname || currentUser.displayName || '익명',
        text: text.slice(0, 100),
        createdAt: Date.now(),
      });
    } catch (e) { console.error('chat send error', e); showToast('채팅 전송 실패', 'error'); }
  };

  sendBtn.onclick = doSend;
  input.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); doSend(); } };
}

function renderMessages(messages) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  if (!messages.length) {
    container.innerHTML = '<div class="chat-empty">상대방과 채팅해보세요 💬</div>';
    return;
  }
  container.innerHTML = messages.map(m => {
    const isMine = m.uid === currentUser?.uid;
    const name = isMine ? '' : `<span class="chat-msg-name">${escapeHtml(m.name || '익명')}</span>`;
    return `<div class="chat-msg ${isMine ? 'mine' : 'other'}">${name}<div class="chat-bubble">${escapeHtml(m.text)}</div></div>`;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── 모달 닫기 ───
function closeModal() {
  clearRematchTimeout();
  clearPhaseTimers();
  document.getElementById('game-modal').classList.remove('visible');
  if (activeGameListener) {
    activeGameListener();
    activeGameListener = null;
  }
  if (chatListener) {
    off(rtdbRef(rtdb, `game_chat/${activeGameId}`));
    chatListener = null;
  }
  document.getElementById('chat-section').style.display = 'none';
  if (handScene) { handScene.dispose(); handScene = null; }
  activeGameId = null;
  // 모달 닫히면 방 목록 폴링 재개
  if (!roomsPollingId) {
    fetchRooms();
    roomsPollingId = setInterval(fetchRooms, 10000);
  }
}

function startPhase1Timer() {
  let timeLeft = 30;
  const timerEl = document.getElementById('phase1-timer');
  const timerVal = document.getElementById('phase1-timer-val');
  if (timerEl) timerEl.style.display = '';
  function paint() {
    if (!timerVal) return;
    timerVal.textContent = timeLeft;
    timerVal.style.color = timeLeft <= 10 ? '#ef4444' : timeLeft <= 15 ? '#f59e0b' : '#34d399';
  }
  paint();
  phase1TimerId = setInterval(async () => {
    timeLeft--;
    paint();
    if (timeLeft <= 0) {
      stopPhase1Timer();
      document.querySelectorAll('#left-hand-choices .hand-btn, #right-hand-choices .hand-btn').forEach(b => b.disabled = true);
      document.getElementById('submit-hands-btn').disabled = true;
      showToast('시간 초과! 자동 패배 처리됩니다 ⏱', 'warning');
      submitTimeout();
    }
  }, 1000);
}

function stopPhase1Timer() {
  if (!phase1TimerId) return;
  clearInterval(phase1TimerId);
  phase1TimerId = null;
  const timerEl = document.getElementById('phase1-timer');
  if (timerEl) timerEl.style.display = 'none';
}

function startPhase2Timer(scene) {
  let timeLeft = 20;
  const timerEl = document.getElementById('phase2-timer');
  const timerVal = document.getElementById('phase2-timer-val');
  if (timerEl) timerEl.style.display = '';
  function paint() {
    if (!timerVal) return;
    timerVal.textContent = timeLeft;
    timerVal.style.color = timeLeft <= 5 ? '#ef4444' : timeLeft <= 10 ? '#f59e0b' : '#34d399';
  }
  paint();
  phase2TimerId = setInterval(() => {
    timeLeft--;
    paint();
    if (timeLeft <= 0) {
      stopPhase2Timer();
      if (!myHandRemoved) {
        myHandRemoved = true;
        if (scene) scene.disableSelection();
        showToast('시간 초과! 자동 패배 처리됩니다 ⏱', 'warning');
        submitTimeout();
      }
    }
  }, 1000);
}

function stopPhase2Timer() {
  if (!phase2TimerId) return;
  clearInterval(phase2TimerId);
  phase2TimerId = null;
  const timerEl = document.getElementById('phase2-timer');
  if (timerEl) timerEl.style.display = 'none';
}

function clearPhaseTimers() {
  stopPhase1Timer();
  stopPhase2Timer();
}

function startRematchTimeout() {
  clearRematchTimeout();
  rematchTimeoutId = setTimeout(async () => {
    rematchTimeoutId = null;
    if (!activeGameId || !currentUser) return;
    try {
      const idToken = await currentUser.getIdToken();
      await fetch('/api/game-rps', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rematch_decline', gameId: activeGameId }),
      });
    } catch (e) { /* ignore */ }
    showRematchSection('request');
    showToast('상대방이 응답하지 않았습니다. 상대방이 나간 것 같아요.', 'warning');
  }, 45000);
}

function clearRematchTimeout() {
  if (rematchTimeoutId) { clearTimeout(rematchTimeoutId); rematchTimeoutId = null; }
}

function openLoginModal() { document.getElementById('login-modal').classList.add('visible'); }
function closeLoginModal() { document.getElementById('login-modal').classList.remove('visible'); }

function showToast(msg, type = 'success') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const icons = { success: '✅', error: '❌', warning: '⚠️' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type] || '💬'}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('removing'); setTimeout(() => t.remove(), 300); }, 3500);
}

init();
