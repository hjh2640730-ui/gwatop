// ============================================================
// GWATOP - Game Page (Rock Paper Scissors)
// ============================================================

import { signInWithGoogle, signInWithKakao, signInWithNaver, logOut, onUserChange } from './auth.js';
import { db } from './auth.js';
import {
  collection, doc, query, where, limit, onSnapshot,
  addDoc, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

let currentUser = null;
let currentUserData = null;
let activeGameId = null;        // 현재 진행 중인 게임 ID
let activeGameListener = null;  // onSnapshot 구독 해제 함수
let roomsListener = null;       // 방 목록 구독 해제 함수
let pendingListener = null;     // 내 방 대기 구독
let countdownInterval = null;   // 방 만료 타이머
let allRoomDocs = [];           // 전체 방 목록 (검색 필터링용)
let chatListener = null;        // 채팅 onSnapshot 구독

const ACTIVE_GAME_KEY = 'gwatop_active_game';

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
      checkActiveGame(); // 이전에 만든 방이 있는지 복원
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

  // 방 제목 글자수 카운터
  const titleInput = document.getElementById('room-title-input');
  const titleCount = document.getElementById('room-title-count');
  titleInput?.addEventListener('input', () => { titleCount.textContent = titleInput.value.length; });

  // 방 검색
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
    // 이미 내 방이 있으면 중복 생성 방지
    const stored = getStoredGame();
    if (stored) { showToast('이미 대기 중인 방이 있습니다', 'warning'); return; }
    const wager = parseInt(slider.value);
    const fp = currentUserData?.freePoints ?? 0;
    if (fp < wager) { showToast(`무료 포인트 부족 (보유: ${fp}P)`, 'error'); return; }
    const btn = document.getElementById('create-room-btn');
    btn.disabled = true;
    btn.textContent = '생성 중...';
    const title = titleInput?.value.trim() || '';
    await createRoom(wager, title);
    btn.disabled = false;
    btn.textContent = '✊ 방 만들기';
    if (titleInput) titleInput.value = '';
    if (titleCount) titleCount.textContent = '0';
  });

  // 게임 모달: 결과 닫기
  document.getElementById('result-close-btn')?.addEventListener('click', closeModal);
  document.getElementById('game-modal')?.addEventListener('click', e => {
    if (e.target !== document.getElementById('game-modal')) return;
    if (document.getElementById('state-result').style.display !== 'none') closeModal();
  });

  // 가위바위보 선택
  document.querySelectorAll('.rps-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!activeGameId || btn.disabled) return;
      document.querySelectorAll('.rps-btn').forEach(b => { b.disabled = true; b.classList.remove('selected'); });
      btn.classList.add('selected');
      document.getElementById('rps-status').textContent = '선택 완료! 상대방 기다리는 중...';
      submitChoice(btn.dataset.choice);
    });
  });
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
  pendingListener = onSnapshot(doc(db, 'games', stored.gameId), snap => {
    if (!snap.exists()) { clearStoredGame(); return; }
    const game = { id: snap.id, ...snap.data() };
    if (game.status === 'cancelled' || game.status === 'finished') {
      clearStoredGame();
      if (pendingListener) { pendingListener(); pendingListener = null; }
    } else if (game.status === 'ready') {
      // 상대방 입장! 선택 모달 자동 오픈
      clearStoredGame();
      if (pendingListener) { pendingListener(); pendingListener = null; }
      const isP1 = game.player1?.uid === currentUser?.uid;
      showToast('상대방이 입장했습니다! 게임을 시작하세요 🎮', 'success');
      openGameModal(stored.gameId, isP1);
    }
    // 'waiting' 상태면 방 목록에 이미 표시됨 — 아무것도 안 해도 됨
  });
}

// ─── 방 만료까지 남은 분 계산 ───
function getRemainingMin(createdAt) {
  if (!createdAt) return 10;
  const t = typeof createdAt === 'string' ? new Date(createdAt) : (createdAt.toDate?.() || new Date());
  return Math.max(0, Math.ceil((10 * 60 * 1000 - (Date.now() - t.getTime())) / 60000));
}

// ─── 검색 필터 ───
function filterRooms(query) {
  if (!query) return allRoomDocs;
  const q = query.toLowerCase();
  return allRoomDocs.filter(d => {
    const g = d.data();
    return (g.title || '').toLowerCase().includes(q) || (g.player1?.name || '').toLowerCase().includes(q);
  });
}

// ─── 방 목록 렌더링 ───
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
    const titleHtml = g.title
      ? `<div class="room-title-on-card">${g.title}</div><div class="room-host-name">${g.player1?.name || '익명'}</div>`
      : `<div class="room-title-on-card">${g.player1?.name || '익명'}의 방</div>`;
    if (isMine) {
      const remaining = getRemainingMin(g.createdAt);
      return `<div class="room-card mine">
        <div class="room-card-left">
          <div>
            <div style="display:flex;align-items:center;gap:6px">
              ${g.title ? `<span class="room-name" style="color:var(--text-primary)">${g.title}</span>` : '<span class="room-name" style="color:var(--text-primary)">내 방</span>'}
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
    card.addEventListener('click', () => joinRoom(card.dataset.id));
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

// ─── 방 목록 (실시간) ───
function loadRooms() {
  if (roomsListener) { roomsListener(); roomsListener = null; }
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }

  const q = query(collection(db, 'games'), where('status', '==', 'waiting'), limit(30));
  roomsListener = onSnapshot(q, snap => {
    const now = Date.now();
    allRoomDocs = snap.docs.filter(d => {
      const ts = d.data().createdAt;
      if (!ts) return true;
      const t = typeof ts === 'string' ? new Date(ts) : (ts.toDate?.() || new Date());
      return now - t.getTime() < 10 * 60 * 1000;
    });
    const searchQuery = document.getElementById('room-search')?.value.trim() || '';
    renderRooms(filterRooms(searchQuery));
  });
}

// ─── 방 만들기 ───
async function createRoom(wager, title = '') {
  const idToken = await currentUser.getIdToken();
  const res = await fetch('/api/game-rps', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', wager, title }),
  });
  const data = await res.json();
  if (data.error) { showToast(data.error, 'error'); return; }

  // 모달 없이 방 목록에 표시 + localStorage에 기억
  storeGame(data.gameId, currentUser.uid);
  showToast('방이 생성됐습니다! 상대방을 기다리는 중...', 'success');

  // 상대 입장 감지 리스너 시작
  checkActiveGame();
}

// ─── 방 입장 ───
async function joinRoom(gameId) {
  if (!currentUser) { openLoginModal(); return; }
  const fp = currentUserData?.freePoints ?? 0;
  const idToken = await currentUser.getIdToken();
  const res = await fetch('/api/game-rps', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'join', gameId }),
  });
  const data = await res.json();
  if (data.error) { showToast(data.error, 'error'); return; }
  // player2도 나갔다 와도 복원할 수 있도록 저장
  storeGame(gameId, currentUser.uid);
  openGameModal(gameId, false);
}

// ─── 방 취소 (목록에서) ───
async function cancelRoomById(gameId) {
  const idToken = await currentUser.getIdToken();
  await fetch('/api/game-rps', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'cancel', gameId }),
  });
  clearStoredGame();
  if (pendingListener) { pendingListener(); pendingListener = null; }
  showToast('방이 취소됐습니다', 'success');
}

// ─── 게임 모달 오픈 (선택 단계) ───
function openGameModal(gameId, isP1) {
  activeGameId = gameId;
  document.getElementById('game-modal').classList.add('visible');
  showState('choose');
  document.querySelectorAll('.rps-btn').forEach(b => { b.disabled = false; b.classList.remove('selected'); });
  document.getElementById('rps-status').textContent = '';

  openChat(gameId);

  if (activeGameListener) { activeGameListener(); activeGameListener = null; }
  activeGameListener = onSnapshot(doc(db, 'games', gameId), snap => {
    if (!snap.exists()) return;
    syncModal({ id: snap.id, ...snap.data() }, isP1);
  });
}

function syncModal(game, isP1) {
  document.getElementById('c-wager').textContent = game.wager;

  if (game.status === 'ready') {
    document.getElementById('chat-section').style.display = '';
    const p1 = game.player1 || {}, p2 = game.player2 || {};
    document.getElementById('vs-display').innerHTML = `
      <div class="rps-player">
        <img class="rps-player-avatar" src="${p1.photo || ''}" onerror="this.src='/favicon.svg'" />
        <span class="rps-player-name">${p1.name || '익명'}</span>
      </div>
      <span class="rps-vs-text">VS</span>
      <div class="rps-player">
        <img class="rps-player-avatar" src="${p2.photo || ''}" onerror="this.src='/favicon.svg'" />
        <span class="rps-player-name">${p2.name || '익명'}</span>
      </div>`;
  }
  if (game.status === 'finished') showResult(game, isP1);
}

function showState(state) {
  document.getElementById('state-choose').style.display = state === 'choose' ? '' : 'none';
  document.getElementById('state-result').style.display = state === 'result' ? '' : 'none';
}

function showResult(game, isP1) {
  const result = game.result || {};
  const myUid = currentUser?.uid;
  const amIP1 = isP1 ?? (game.player1?.uid === myUid);
  const myChoice = amIP1 ? result.p1Choice : result.p2Choice;
  const oppChoice = amIP1 ? result.p2Choice : result.p1Choice;
  const emojiMap = { '가위': '✌️', '바위': '✊', '보': '🖐️' };

  let icon, title, pts, cls;
  if (!game.winner) {
    icon = '🤝'; title = '비겼습니다!'; pts = '±0P'; cls = 'draw';
  } else if (game.winner === myUid) {
    icon = '🏆'; title = '승리!'; pts = `+${game.wager}P`; cls = 'win';
    if (currentUserData) {
      currentUserData.freePoints = (currentUserData.freePoints || 0) + game.wager;
      document.getElementById('my-fp').textContent = currentUserData.freePoints + 'P';
    }
  } else {
    icon = '😢'; title = '패배...'; pts = `-${game.wager}P`; cls = 'lose';
    if (currentUserData) {
      currentUserData.freePoints = Math.max(0, (currentUserData.freePoints || 0) - game.wager);
      document.getElementById('my-fp').textContent = currentUserData.freePoints + 'P';
    }
  }

  clearStoredGame();
  document.getElementById('result-icon').textContent = icon;
  document.getElementById('result-title').textContent = title;
  document.getElementById('result-choices').innerHTML = `
    <div class="rps-result-side"><span class="rps-result-emoji">${emojiMap[myChoice] || '?'}</span><span class="rps-result-label">나</span></div>
    <span class="rps-result-vs-txt">VS</span>
    <div class="rps-result-side"><span class="rps-result-emoji">${emojiMap[oppChoice] || '?'}</span><span class="rps-result-label">상대</span></div>`;
  document.getElementById('result-points').textContent = pts;
  document.getElementById('result-points').className = `rps-point-change ${cls}`;
  showState('result');
}

// ─── 선택 제출 ───
async function submitChoice(choice) {
  const idToken = await currentUser.getIdToken();
  const res = await fetch('/api/game-rps', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'submit', gameId: activeGameId, choice }),
  });
  const data = await res.json();
  if (data.error) showToast(data.error, 'error');
}

// ─── 채팅 오픈 ───
function openChat(gameId) {
  if (chatListener) { chatListener(); chatListener = null; }
  document.getElementById('chat-section').style.display = '';

  const q = query(
    collection(db, 'games', gameId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(100)
  );
  chatListener = onSnapshot(q, snap => renderMessages(snap.docs));

  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');

  const doSend = async () => {
    const text = input.value.trim();
    if (!text || !currentUser) return;
    input.value = '';
    try {
      await addDoc(collection(db, 'games', gameId, 'messages'), {
        uid: currentUser.uid,
        name: currentUserData?.nickname || currentUser.displayName || '익명',
        text: text.slice(0, 100),
        createdAt: serverTimestamp(),
      });
    } catch (e) { console.error('chat send error', e); }
  };

  sendBtn.onclick = doSend;
  input.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) doSend(); };
}

function renderMessages(docs) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  if (!docs.length) {
    container.innerHTML = '<div class="chat-empty">상대방과 채팅해보세요 💬</div>';
    return;
  }
  container.innerHTML = docs.map(d => {
    const m = d.data();
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
  document.getElementById('game-modal').classList.remove('visible');
  if (activeGameListener) { activeGameListener(); activeGameListener = null; }
  if (chatListener) { chatListener(); chatListener = null; }
  document.getElementById('chat-section').style.display = 'none';
  activeGameId = null;
}

// ─── Login Modal ───
function openLoginModal() { document.getElementById('login-modal').classList.add('visible'); }
function closeLoginModal() { document.getElementById('login-modal').classList.remove('visible'); }

// ─── Toast ───
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
