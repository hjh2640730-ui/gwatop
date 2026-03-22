// ============================================================
// GWATOP - Admin Page Logic v2.0.0
// ============================================================

import { onAdminUserChange, signInWithGoogleAdmin, logOutAdmin } from './auth-admin.js';

const ADMIN_EMAIL = 'hjh2640730@gmail.com';

let currentUser = null;
let allUsers = [];
let allPosts = [];
let allPayments = [];
let allComments = [];
let allGames = [];
let editingUid = null;
let deletingUid = null;
let deletingPostId = null;
let genericDeleteCallback = null;
let activeTab = 'dashboard';
let dashboardLoaded = false;
let usersLoaded = false;
let postsLoaded = false;
let paymentsLoaded = false;
let commentsLoaded = false;
let gamesLoaded = false;

// ─── 탭 시스템 ───
const TABS = ['dashboard', 'users', 'posts', 'payments', 'comments', 'games', 'messages', 'system', 'monitor'];

function switchTab(tabName) {
  TABS.forEach(t => {
    document.getElementById(`tab-${t}`).style.display = t === tabName ? '' : 'none';
    document.querySelector(`[data-tab="${t}"]`).classList.toggle('active', t === tabName);
  });
  activeTab = tabName;

  // 모니터 탭 이탈 시 폴링 중단
  if (tabName !== 'monitor') stopMonitorPolling();

  if (tabName === 'dashboard' && !dashboardLoaded) loadDashboard();
  if (tabName === 'users' && !usersLoaded) loadUsers();
  if (tabName === 'posts' && !postsLoaded) loadPosts();
  if (tabName === 'payments' && !paymentsLoaded) loadPayments();
  if (tabName === 'messages') setupMessages();
  if (tabName === 'comments' && !commentsLoaded) loadComments();
  if (tabName === 'games' && !gamesLoaded) loadGames();
  if (tabName === 'system') setupSystem();
  if (tabName === 'monitor') setupMonitor();
}

async function init() {
  showState('loading');

  document.getElementById('admin-login-btn').addEventListener('click', () => signInWithGoogleAdmin());
  document.getElementById('admin-logout-btn').addEventListener('click', () => logOutAdmin());
  document.getElementById('denied-logout-btn').addEventListener('click', () => logOutAdmin());

  onAdminUserChange(async (user) => {
    currentUser = user;

    if (!user) {
      document.getElementById('admin-logout-btn').style.display = 'none';
      showState('login');
      return;
    }

    if (user.email !== ADMIN_EMAIL) {
      document.getElementById('admin-logout-btn').style.display = '';
      showState('denied');
      return;
    }

    document.getElementById('admin-logout-btn').style.display = '';
    showState('main');
    setupEvents();
    switchTab('dashboard');
  });
}

function showState(state) {
  document.getElementById('login-state').style.display    = state === 'login'   ? 'flex' : 'none';
  document.getElementById('loading-state').style.display  = state === 'loading' ? 'flex' : 'none';
  document.getElementById('access-denied').style.display  = state === 'denied'  ? 'flex' : 'none';
  document.getElementById('admin-main').style.display     = state === 'main'    ? ''     : 'none';
}

// ─── Load Comments ───
async function loadComments() {
  commentsLoaded = false;
  document.getElementById('comments-table-body').innerHTML = '<div class="empty-row">데이터 로딩 중...</div>';
  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch(`/api/admin?token=${idToken}&type=comments`);
    const data = await res.json();
    if (!res.ok || data.error) { showToast(data.error || '댓글 로드 실패', 'error'); return; }
    allComments = data.comments || [];
    renderComments(allComments);
    commentsLoaded = true;
  } catch (e) { showToast('네트워크 오류: ' + e.message, 'error'); }
}

function renderComments(comments) {
  const body = document.getElementById('comments-table-body');
  const showDeleted = document.getElementById('show-deleted-comments')?.checked;
  const filtered = showDeleted ? comments : comments.filter(c => !c.deleted);
  document.getElementById('comments-summary').textContent =
    `총 ${comments.length}개 (삭제됨 ${comments.filter(c=>c.deleted).length}개)`;
  if (!filtered.length) { body.innerHTML = '<div class="empty-row">댓글이 없습니다.</div>'; return; }
  body.innerHTML = filtered.map(c => {
    const rowClass = c.deleted ? 'comments-table-row td-deleted' : 'comments-table-row';
    const content = escapeHtml(c.content || '').slice(0, 80);
    const author = c.isAnonymous ? '익명' : (c.nickname || '-');
    return `<div class="${rowClass}">
      <div class="td" data-label="내용" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${content}${c.deleted ? ' [삭제됨]' : ''}</div>
      <div class="td" data-label="작성자">${author}</div>
      <div class="td" data-label="게시글"><a href="/post.html?id=${c.postId}" target="_blank" style="color:#60a5fa;font-size:11px">${c.postId.slice(-8)}</a></div>
      <div class="td" data-label="❤️">${c.likes}</div>
      <div class="td td-date" data-label="날짜">${formatDate(c.createdAt)}</div>
      <div class="td">${!c.deleted ? `<button class="btn-delete comment-delete-btn" data-postid="${c.postId}" data-commentid="${c.commentId}">삭제</button>` : '-'}</div>
    </div>`;
  }).join('');
  body.querySelectorAll('.comment-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => openGenericDelete(
      '댓글 삭제', `이 댓글을 삭제하시겠습니까?<br/><br/><span style="font-size:11px;color:var(--text-muted)">${escapeHtml((allComments.find(c=>c.commentId===btn.dataset.commentid)?.content||'').slice(0,60))}</span>`,
      async () => {
        const idToken = await currentUser.getIdToken();
        const res = await fetch('/api/admin', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ token: idToken, action: 'deleteComment', postId: btn.dataset.postid, commentId: btn.dataset.commentid }) });
        const d = await res.json();
        if (!res.ok || d.error) throw new Error(d.error || '삭제 실패');
        allComments = allComments.map(c => c.commentId === btn.dataset.commentid ? {...c, deleted: true} : c);
        renderComments(allComments);
        showToast('댓글이 삭제됐습니다.', 'success');
      }
    ));
  });
}


// ─── Load Games ───
async function loadGames() {
  gamesLoaded = false;
  document.getElementById('games-table-body').innerHTML = '<div class="empty-row">데이터 로딩 중...</div>';
  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch(`/api/admin?token=${idToken}&type=games`);
    const data = await res.json();
    if (!res.ok || data.error) { showToast(data.error || '게임 로드 실패', 'error'); return; }
    allGames = data.games || [];
    renderGames(filterGames());
    gamesLoaded = true;
  } catch (e) { showToast('네트워크 오류: ' + e.message, 'error'); }
}

function filterGames() {
  const q = (document.getElementById('game-search-input')?.value || '').toLowerCase();
  const status = document.getElementById('game-status-filter')?.value || '';
  return allGames.filter(g =>
    (!status || g.status === status) &&
    (!q || (g.title||'').toLowerCase().includes(q) ||
     (g.player1?.name||'').toLowerCase().includes(q) ||
     (g.player2?.name||'').toLowerCase().includes(q))
  );
}

function renderGames(games) {
  const body = document.getElementById('games-table-body');
  const counts = { waiting: 0, ready: 0, finished: 0, cancelled: 0 };
  allGames.forEach(g => { if (counts[g.status] !== undefined) counts[g.status]++; });
  document.getElementById('games-summary').textContent =
    `총 ${allGames.length}개 | 대기 ${counts.waiting} · 진행 ${counts.ready} · 완료 ${counts.finished} · 취소 ${counts.cancelled}`;
  if (!games.length) { body.innerHTML = '<div class="empty-row">게임이 없습니다.</div>'; return; }
  const statusBadge = s => {
    const map = { waiting:'대기 중', ready:'진행 중', finished:'완료', cancelled:'취소됨' };
    return `<span class="badge badge-${s}">${map[s]||s}</span>`;
  };
  body.innerHTML = games.map(g => {
    const result = g.p1Choice && g.p2Choice
      ? `${g.p1Choice}vs${g.p2Choice}`
      : '-';
    const winnerName = g.winner
      ? (g.winner === g.player1?.uid ? g.player1.name : g.player2?.name) || '?'
      : (g.status === 'finished' ? '무승부' : '-');
    const canCancel = g.status === 'waiting' || g.status === 'ready';
    return `<div class="games-table-row">
      <div class="td td-name" data-label="방 제목">${escapeHtml(g.title||'(제목없음)')}${g.hasPassword?' 🔒':''}</div>
      <div class="td" data-label="플레이어1">${escapeHtml(g.player1?.name||'-')}</div>
      <div class="td" data-label="플레이어2">${escapeHtml(g.player2?.name||'-')}</div>
      <div class="td" data-label="배팅" style="color:#a78bfa;font-weight:700">${g.wager}P</div>
      <div class="td" data-label="상태">${statusBadge(g.status)}</div>
      <div class="td" data-label="결과" style="font-size:12px">${result}<br><span style="color:#a78bfa;font-size:11px">${winnerName}</span></div>
      <div class="td td-date" data-label="날짜">${formatDate(g.createdAt)}</div>
      <div class="td">${canCancel ? `<button class="btn-delete game-cancel-btn" data-id="${g.id}">취소</button>` : '-'}</div>
    </div>`;
  }).join('');
  body.querySelectorAll('.game-cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => openGenericDelete(
      '게임 강제 취소 + 환불', '이 게임을 강제 취소하고 양쪽 포인트를 환불하시겠습니까?',
      async () => {
        const idToken = await currentUser.getIdToken();
        const res = await fetch('/api/admin', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ token: idToken, action: 'cancelGame', gameId: btn.dataset.id }) });
        const d = await res.json();
        if (!res.ok || d.error) throw new Error(d.error || '취소 실패');
        const game = allGames.find(g => g.id === btn.dataset.id);
        if (game) game.status = 'cancelled';
        renderGames(filterGames());
        const refundMsg = d.refunded?.length ? ` (${d.refunded.length}명 환불 완료)` : '';
        showToast(`게임이 취소됐습니다${refundMsg}`, 'success');
      }
    ));
  });
}

// ─── Messages Tab ───
let messagesReady = false;
let msgTarget = 'all';
let msgReward = 'none';

function setupMessages() {
  if (messagesReady) { loadSentMessages(); return; }
  messagesReady = true;

  // 받는 사람 토글
  let selectedUid = '';
  const picker = document.getElementById('msg-user-picker');
  const searchInput = document.getElementById('msg-user-search');
  const dropdown = document.getElementById('msg-user-dropdown');
  const selectedBox = document.getElementById('msg-user-selected');
  const selectedLabel = document.getElementById('msg-user-selected-label');

  function renderUserDropdown(query) {
    const q = query.toLowerCase();
    const filtered = allUsers.filter(u =>
      (u.displayName || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.nickname || '').toLowerCase().includes(q)
    ).slice(0, 30);

    if (!filtered.length) {
      dropdown.innerHTML = '<div style="padding:12px 14px;font-size:13px;color:var(--text-muted)">검색 결과 없음</div>';
    } else {
      dropdown.innerHTML = filtered.map(u => `
        <div class="msg-user-option" data-uid="${u.uid}" data-name="${escapeHtml(u.displayName||'(이름없음)')} (${escapeHtml(u.email||'')})">
          <div class="msg-user-option-name">${escapeHtml(u.displayName || '(이름없음)')} ${u.nickname ? `<span style="color:#a78bfa;font-weight:400">(${escapeHtml(u.nickname)})</span>` : ''}</div>
          <div class="msg-user-option-email">${escapeHtml(u.email || u.uid)}</div>
        </div>`).join('');
      dropdown.querySelectorAll('.msg-user-option').forEach(el => {
        el.addEventListener('click', () => {
          selectedUid = el.dataset.uid;
          selectedLabel.textContent = el.dataset.name;
          selectedBox.style.display = 'flex';
          searchInput.value = '';
          dropdown.style.display = 'none';
          searchInput.placeholder = '다시 검색하려면 입력...';
        });
      });
    }
    dropdown.style.display = '';
  }

  searchInput.addEventListener('input', () => {
    if (selectedUid) { selectedUid = ''; selectedBox.style.display = 'none'; }
    renderUserDropdown(searchInput.value);
  });
  searchInput.addEventListener('focus', () => {
    if (allUsers.length) renderUserDropdown(searchInput.value);
  });
  document.addEventListener('click', (e) => {
    if (!picker.contains(e.target)) dropdown.style.display = 'none';
  });
  document.getElementById('msg-user-clear').addEventListener('click', () => {
    selectedUid = '';
    selectedBox.style.display = 'none';
    searchInput.value = '';
    searchInput.focus();
  });

  document.querySelectorAll('.msg-target-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      msgTarget = btn.dataset.target;
      document.querySelectorAll('.msg-target-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (msgTarget === 'user') {
        picker.style.display = '';
        if (!allUsers.length) {
          searchInput.placeholder = '유저 목록 불러오는 중...';
          searchInput.disabled = true;
          await loadUsers();
          searchInput.disabled = false;
          searchInput.placeholder = '이름 또는 이메일로 검색...';
        }
        searchInput.focus();
      } else {
        picker.style.display = 'none';
        selectedUid = '';
        selectedBox.style.display = 'none';
        dropdown.style.display = 'none';
      }
    });
  });

  // 보상 토글
  document.querySelectorAll('.msg-reward-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      msgReward = btn.dataset.reward;
      document.querySelectorAll('.msg-reward-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('msg-reward-amount-wrap').style.display = msgReward === 'freePoints' ? 'flex' : 'none';
    });
  });

  // 보내기
  document.getElementById('msg-send-btn').addEventListener('click', async () => {
    const title = document.getElementById('msg-title').value.trim();
    const body = document.getElementById('msg-body').value.trim();
    const rewardAmount = parseInt(document.getElementById('msg-reward-amount').value) || 0;

    if (!title) { showToast('제목을 입력하세요.', 'error'); return; }
    if (!body) { showToast('내용을 입력하세요.', 'error'); return; }

    let target = msgTarget === 'all' ? 'all' : selectedUid;
    if (msgTarget === 'user' && !target) { showToast('유저를 선택하세요.', 'error'); return; }

    const targetLabel = target === 'all' ? '전체 유저' : (allUsers.find(u => u.uid === target)?.displayName || '특정 유저');
    if (!confirm(`"${title}" 메시지를 ${targetLabel}에게 보내시겠습니까?${msgReward === 'freePoints' ? `\n보상: +${rewardAmount}P` : ''}`)) return;

    const btn = document.getElementById('msg-send-btn');
    btn.disabled = true; btn.textContent = '전송 중...';
    const result = document.getElementById('msg-result');

    try {
      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: idToken, target, title, body, rewardType: msgReward, rewardAmount }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || '전송 실패');

      result.textContent = `✅ 전송 완료 (${targetLabel})`;
      showToast('메시지 전송 완료!', 'success');
      document.getElementById('msg-title').value = '';
      document.getElementById('msg-body').value = '';
      if (target === 'all') loadSentMessages();
    } catch (e) {
      result.textContent = '❌ ' + e.message;
      showToast(e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = '보내기';
    }
  });

  document.getElementById('msgs-refresh-btn').addEventListener('click', loadSentMessages);
  loadSentMessages();
}

async function loadSentMessages() {
  const wrap = document.getElementById('sent-messages-list');
  wrap.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:13px;padding:12px 0">불러오는 중...</div>';
  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch(`/api/admin?token=${idToken}&type=global_messages`);
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error);
    const msgs = data.messages || [];
    if (!msgs.length) {
      wrap.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:13px;padding:20px 0">보낸 공지가 없습니다.</div>';
      return;
    }
    wrap.innerHTML = msgs.map(m => {
      const hasReward = m.rewardType === 'freePoints' && m.rewardAmount > 0;
      return `<div class="sent-msg-item">
        <div class="sent-msg-title">${escapeHtml(m.title)}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin:4px 0;line-height:1.5">${escapeHtml(m.body).slice(0, 100)}${m.body?.length > 100 ? '...' : ''}</div>
        <div class="sent-msg-meta">
          ${hasReward ? `<span style="color:#34d399;font-weight:600">🎁 +${m.rewardAmount}P 보상 포함</span>` : ''}
          <span>${formatDate(m.createdAt)}</span>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    wrap.innerHTML = `<div style="text-align:center;color:#f87171;font-size:13px;padding:12px 0">${e.message}</div>`;
  }
}

// ─── System Tab ───
let systemReady = false;
function setupSystem() {
  if (systemReady) return;
  systemReady = true;

  // 무료 포인트 일괄 지급
  document.getElementById('grant-btn').addEventListener('click', async () => {
    const amount = parseInt(document.getElementById('grant-amount').value);
    if (!amount || amount < 1) { showToast('지급할 포인트 수를 입력하세요.', 'error'); return; }
    if (!confirm(`전체 유저에게 ${amount}P를 지급하시겠습니까?`)) return;
    const btn = document.getElementById('grant-btn');
    btn.disabled = true; btn.textContent = '지급 중...';
    const result = document.getElementById('grant-result');
    result.textContent = '처리 중...';
    try {
      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/admin', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ token: idToken, action: 'grantFreePoints', amount }) });
      const d = await res.json();
      if (!res.ok || d.error) throw new Error(d.error);
      result.textContent = `✅ ${d.count}명에게 ${amount}P 지급 완료`;
      showToast(`${d.count}명에게 ${amount}P 지급 완료!`, 'success');
      usersLoaded = false;
    } catch (e) {
      result.textContent = '❌ ' + e.message;
      showToast(e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = '전체 유저에게 지급';
    }
  });

  // 유저 CSV 내보내기
  document.getElementById('export-users-btn').addEventListener('click', async () => {
    if (!allUsers.length) { await loadUsers(); }
    const headers = ['uid','이름','닉네임','이메일','전화번호','크레딧','무료포인트','퀴즈수','추천수','로그인','가입일'];
    const rows = allUsers.map(u => [u.uid, u.displayName, u.nickname, u.email, formatPhone(u.phone), u.credits, u.freePoints, u.totalQuizzes, u.referralCredits, u.provider, formatDate(u.createdAt)]);
    downloadCSV('gwatop_users.csv', headers, rows);
    showToast('CSV 다운로드 완료', 'success');
  });

  // 결제 CSV 내보내기
  document.getElementById('export-payments-btn').addEventListener('click', async () => {
    if (!allPayments.length) { await loadPayments(); }
    const userMap = {};
    allUsers.forEach(u => { userMap[u.uid] = u; });
    const headers = ['주문번호','uid','이름','이메일','결제금액','크레딧','결제일시'];
    const rows = allPayments.map(p => {
      const u = userMap[p.uid];
      const d = p.processedAt ? new Date(p.processedAt) : null;
      return [p.orderId, p.uid, u?.displayName||'', u?.email||'', p.amount, p.credits, d ? d.toISOString() : ''];
    });
    downloadCSV('gwatop_payments.csv', headers, rows);
    showToast('CSV 다운로드 완료', 'success');
  });

  // 사이트 상태 확인
  document.getElementById('health-check-btn').addEventListener('click', runHealthCheck);

}

async function runHealthCheck() {
  const container = document.getElementById('health-items');
  const checks = [
    { name: 'Firestore 연결 (유저 API)', fn: async () => { const idToken = await currentUser.getIdToken(); const r = await fetch(`/api/admin?token=${idToken}`); if (!r.ok) throw new Error(r.status); return `${(await r.json()).users?.length}명 확인`; } },
    { name: '결제 API', fn: async () => { const idToken = await currentUser.getIdToken(); const r = await fetch(`/api/payment-history?token=${idToken}&all=1`); if (!r.ok) throw new Error(r.status); return `${(await r.json()).payments?.length}건 확인`; } },
    { name: '게임 Firestore', fn: async () => { const idToken = await currentUser.getIdToken(); const r = await fetch(`/api/admin?token=${idToken}&type=games`); if (!r.ok) throw new Error(r.status); return `${(await r.json()).games?.length}개 확인`; } },
  ];
  container.innerHTML = checks.map(c => `<div class="health-item" id="hc-${c.name}"><div class="health-dot health-pending"></div><span>${c.name}</span><span style="margin-left:auto;font-size:12px;color:var(--text-muted)">확인 중...</span></div>`).join('');
  for (const check of checks) {
    const el = document.getElementById(`hc-${check.name}`);
    try {
      const detail = await check.fn();
      el.querySelector('.health-dot').className = 'health-dot health-ok';
      el.querySelector('span:last-child').textContent = '✅ ' + detail;
    } catch (e) {
      el.querySelector('.health-dot').className = 'health-dot health-err';
      el.querySelector('span:last-child').textContent = '❌ ' + e.message;
    }
  }
}

function downloadCSV(filename, headers, rows) {
  const csvContent = [headers, ...rows].map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ─── Load Payments ───
async function loadPayments() {
  paymentsLoaded = false;
  document.getElementById('payments-table-body').innerHTML = '<div class="empty-row">데이터 로딩 중...</div>';
  try {
    const idToken = await currentUser.getIdToken();
    const [paymentsRes, usersRes] = await Promise.all([
      fetch(`/api/payment-history?token=${idToken}&all=1`),
      allUsers.length ? Promise.resolve(null) : fetch(`/api/admin?token=${idToken}`),
    ]);
    const paymentsData = await paymentsRes.json();
    if (!paymentsRes.ok || paymentsData.error) { showToast(paymentsData.error || '결제 내역 로드 실패', 'error'); return; }
    if (usersRes) {
      const usersData = await usersRes.json();
      if (usersRes.ok && !usersData.error) allUsers = usersData.users || [];
    }
    allPayments = paymentsData.payments || [];
    renderPayments(allPayments);
    paymentsLoaded = true;
  } catch (e) {
    showToast('네트워크 오류: ' + e.message, 'error');
  }
}

// ─── Render Payments ───
function renderPayments(payments) {
  const body = document.getElementById('payments-table-body');
  const summary = document.getElementById('payments-summary');

  const totalAmount = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const totalCredits = payments.reduce((s, p) => s + (p.credits || 0), 0);
  summary.textContent = `총 ${payments.length}건 · ${totalAmount.toLocaleString()}원 · ${totalCredits.toLocaleString()}크레딧`;

  if (!payments.length) {
    body.innerHTML = '<div class="empty-row">결제 내역이 없습니다.</div>';
    return;
  }

  // 결제 uid → 유저 이름 매핑
  const userMap = {};
  allUsers.forEach(u => { userMap[u.uid] = u; });

  body.innerHTML = payments.map(p => {
    const u = userMap[p.uid];
    const userLabel = u ? `${u.displayName || '(이름없음)'}<br><span style="font-size:11px;color:var(--text-muted)">${u.email || p.uid}</span>` : `<span style="font-size:11px;color:var(--text-muted)">${p.uid}</span>`;
    const date = p.processedAt ? new Date(p.processedAt) : null;
    const dateStr = date ? `${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}` : '-';
    const shortOrderId = p.orderId ? p.orderId.slice(-12) : '-';
    return `<div class="payments-table-row">
      <div class="td" data-label="주문번호" style="font-size:11px;color:var(--text-muted)">${shortOrderId}</div>
      <div class="td" data-label="유저">${userLabel}</div>
      <div class="td" data-label="결제금액" style="font-weight:700;color:#a78bfa">${p.amount ? p.amount.toLocaleString()+'원' : '-'}</div>
      <div class="td" data-label="충전 크레딧" style="font-weight:700">⚡ ${p.credits}</div>
      <div class="td td-date" data-label="결제일시">${dateStr}</div>
    </div>`;
  }).join('');
}

// ─── Load Dashboard ───
async function loadDashboard() {
  dashboardLoaded = false;
  try {
    const idToken = await currentUser.getIdToken();
    const [usersRes, postsRes, paymentsRes] = await Promise.all([
      fetch(`/api/admin?token=${idToken}`),
      fetch(`/api/admin?token=${idToken}&type=posts`),
      fetch(`/api/payment-history?token=${idToken}&all=1`),
    ]);

    const usersData = await usersRes.json();
    const postsData = await postsRes.json();
    const paymentsData = await paymentsRes.json();

    if (!usersRes.ok || usersData.error) { showToast(usersData.error || '유저 데이터 로드 실패', 'error'); return; }
    if (!postsRes.ok || postsData.error) { showToast(postsData.error || '게시글 데이터 로드 실패', 'error'); return; }

    const users = usersData.users;
    const posts = postsData.posts;
    const payments = paymentsData.payments || [];

    // 오늘 신규 가입자
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayUsers = users.filter(u => {
      if (!u.createdAt) return false;
      return u.createdAt.slice(0, 10) === todayStr;
    }).length;

    const totalLikes = posts.reduce((s, p) => s + (p.likes || 0), 0);
    const totalRevenue = payments.reduce((s, p) => s + (p.amount || 0), 0);

    document.getElementById('stat-total-users').textContent = users.length.toLocaleString();
    document.getElementById('stat-today-users').textContent = todayUsers.toLocaleString();
    document.getElementById('stat-total-quizzes').textContent = users.reduce((s, u) => s + u.totalQuizzes, 0).toLocaleString();
    document.getElementById('stat-total-credits').textContent = users.reduce((s, u) => s + u.credits, 0).toLocaleString();
    document.getElementById('stat-total-posts').textContent = posts.length.toLocaleString();
    document.getElementById('stat-total-likes').textContent = totalLikes.toLocaleString();
    document.getElementById('stat-total-revenue').textContent = totalRevenue.toLocaleString() + '원';
    document.getElementById('stat-total-payments').textContent = payments.length.toLocaleString() + '건';
    dashboardLoaded = true;
  } catch (e) {
    showToast('네트워크 오류: ' + e.message, 'error');
  }
}

// ─── Load Users ───
async function loadUsers() {
  usersLoaded = false;
  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch(`/api/admin?token=${idToken}`);
    const data = await res.json();

    if (!res.ok || data.error) {
      showToast(data.error || '데이터 로드 실패', 'error');
      return;
    }

    allUsers = data.users;
    renderTable(allUsers);
    usersLoaded = true;
  } catch (e) {
    showToast('네트워크 오류: ' + e.message, 'error');
  }
}

// ─── Render Table ───
function renderTable(users) {
  const body = document.getElementById('table-body');

  if (users.length === 0) {
    body.innerHTML = '<div class="empty-row">유저가 없습니다.</div>';
    return;
  }

  body.innerHTML = users.map(u => `
    <div class="table-row" data-uid="${u.uid}">
      <div class="td td-name" data-label="이름">${escapeHtml(u.displayName || '(이름 없음)')}</div>
      <div class="td" data-label="닉네임" style="color:#a78bfa;font-weight:600">${escapeHtml(u.nickname || '-')}</div>
      <div class="td" data-label="이메일">${escapeHtml(u.email || '-')}</div>
      <div class="td" data-label="전화번호">${escapeHtml(formatPhone(u.phone))}</div>
      <div class="td td-credits" data-label="크레딧">${u.credits}</div>
      <div class="td" data-label="무료P" style="color:#34d399;font-weight:600">${u.freePoints ?? 0}</div>
      <div class="td" data-label="퀴즈 수">${u.totalQuizzes}</div>
      <div class="td" data-label="추천">${u.referralCredits}</div>
      <div class="td" data-label="로그인">${formatProvider(u.provider)}</div>
      <div class="td td-date" data-label="가입일">${formatDate(u.createdAt)}</div>
      <div class="td"><button class="btn btn-glass btn-sm edit-btn" data-uid="${u.uid}">수정</button></div>
      <div class="td"><button class="btn-delete delete-btn" data-uid="${u.uid}">삭제</button></div>
    </div>
  `).join('');

  body.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openEditModal(btn.dataset.uid); });
  });
  body.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openDeleteModal(btn.dataset.uid); });
  });
}

// ─── Load Posts ───
async function loadPosts() {
  postsLoaded = false;
  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch(`/api/admin?token=${idToken}&type=posts`);
    const data = await res.json();

    if (!res.ok || data.error) {
      showToast(data.error || '게시글 데이터 로드 실패', 'error');
      return;
    }

    allPosts = data.posts;
    renderPosts(allPosts);
    postsLoaded = true;
  } catch (e) {
    showToast('네트워크 오류: ' + e.message, 'error');
  }
}

// ─── Render Posts ───
function renderPosts(posts) {
  const body = document.getElementById('posts-table-body');

  if (posts.length === 0) {
    body.innerHTML = '<div class="empty-row">게시글이 없습니다.</div>';
    return;
  }

  body.innerHTML = posts.map(p => `
    <div class="posts-table-row" data-id="${p.id}">
      <div class="td" style="padding-right:12px;">
        <div class="td-title">${escapeHtml(p.title || '제목없음')}</div>
        <div class="td-preview">${escapeHtml(p.content || '')}</div>
      </div>
      <div class="td" data-label="작성자">${p.isAnonymous ? '익명' : escapeHtml(p.nickname || '-')}</div>
      <div class="td" data-label="대학교">${escapeHtml(p.university || '-')}</div>
      <div class="td" data-label="좋아요">❤️ ${p.likes}</div>
      <div class="td" data-label="댓글">💬 ${p.commentCount}</div>
      <div class="td td-date" data-label="날짜">${formatDate(p.createdAt)}</div>
      <div class="td"><button class="btn-delete post-delete-btn" data-id="${p.id}">삭제</button></div>
    </div>
  `).join('');

  body.querySelectorAll('.post-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openPostDeleteModal(btn.dataset.id); });
  });
}

// ─── Search ───
function setupEvents() {
  // 탭 전환
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // 유저 검색
  document.getElementById('search-input').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = allUsers.filter(u =>
      (u.email || '').toLowerCase().includes(q) ||
      (u.displayName || '').toLowerCase().includes(q)
    );
    renderTable(filtered);
  });

  document.getElementById('refresh-btn').addEventListener('click', () => {
    usersLoaded = false;
    loadUsers();
  });

  // 게시글 검색
  document.getElementById('post-search-input').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = allPosts.filter(p =>
      (p.title || '').toLowerCase().includes(q) ||
      (p.nickname || '').toLowerCase().includes(q)
    );
    renderPosts(filtered);
  });

  document.getElementById('posts-refresh-btn').addEventListener('click', () => {
    postsLoaded = false;
    loadPosts();
  });

  // 댓글 검색
  document.getElementById('comment-search-input').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    renderComments(allComments.filter(c =>
      (c.content||'').toLowerCase().includes(q) ||
      (c.nickname||'').toLowerCase().includes(q) ||
      (c.postId||'').toLowerCase().includes(q)
    ));
  });
  document.getElementById('show-deleted-comments').addEventListener('change', () => renderComments(allComments));
  document.getElementById('comments-refresh-btn').addEventListener('click', () => { commentsLoaded = false; loadComments(); });

  // 게임 검색/필터
  document.getElementById('game-search-input').addEventListener('input', () => renderGames(filterGames()));
  document.getElementById('game-status-filter').addEventListener('change', () => renderGames(filterGames()));
  document.getElementById('games-refresh-btn').addEventListener('click', () => { gamesLoaded = false; loadGames(); });

  // 범용 삭제 모달
  document.getElementById('generic-delete-cancel').addEventListener('click', closeGenericDelete);
  document.getElementById('generic-delete-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('generic-delete-modal')) closeGenericDelete();
  });
  document.getElementById('generic-delete-confirm').addEventListener('click', async () => {
    if (!genericDeleteCallback) return;
    const btn = document.getElementById('generic-delete-confirm');
    btn.disabled = true; btn.textContent = '처리 중...';
    try {
      await genericDeleteCallback();
      closeGenericDelete();
    } catch (e) {
      showToast(e.message || '처리 실패', 'error');
    } finally {
      btn.disabled = false; btn.textContent = '삭제';
    }
  });

  // 유저 모달 히스토리 탭
  document.querySelectorAll('.modal-history-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.modal-history-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const ht = tab.dataset.htab;
      document.getElementById('modal-htab-quizzes').style.display = ht === 'quizzes' ? '' : 'none';
      document.getElementById('modal-htab-payments').style.display = ht === 'payments' ? '' : 'none';
    });
  });

  // 결제 검색
  document.getElementById('payment-search-input').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const userMap = {};
    allUsers.forEach(u => { userMap[u.uid] = u; });
    const filtered = allPayments.filter(p => {
      const u = userMap[p.uid];
      return (p.orderId || '').toLowerCase().includes(q) ||
        (u?.email || '').toLowerCase().includes(q) ||
        (u?.displayName || '').toLowerCase().includes(q);
    });
    renderPayments(filtered);
  });

  document.getElementById('payments-refresh-btn').addEventListener('click', () => {
    paymentsLoaded = false;
    loadPayments();
  });

  // Edit modal
  document.getElementById('edit-cancel-btn').addEventListener('click', closeEditModal);
  document.getElementById('edit-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('edit-modal')) closeEditModal();
  });
  document.getElementById('edit-save-btn').addEventListener('click', saveEdits);

  // Delete modal (user)
  document.getElementById('delete-cancel-btn').addEventListener('click', closeDeleteModal);
  document.getElementById('delete-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('delete-modal')) closeDeleteModal();
  });
  document.getElementById('delete-confirm-btn').addEventListener('click', confirmDelete);

  // Delete modal (post)
  document.getElementById('post-delete-cancel-btn').addEventListener('click', closePostDeleteModal);
  document.getElementById('post-delete-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('post-delete-modal')) closePostDeleteModal();
  });
  document.getElementById('post-delete-confirm-btn').addEventListener('click', confirmPostDelete);
}

// ─── 범용 삭제 모달 ───
function openGenericDelete(title, desc, onConfirm) {
  document.getElementById('generic-delete-title').textContent = title;
  document.getElementById('generic-delete-desc').innerHTML = desc;
  document.getElementById('generic-delete-modal').classList.add('visible');
  genericDeleteCallback = onConfirm;
}

function closeGenericDelete() {
  document.getElementById('generic-delete-modal').classList.remove('visible');
  genericDeleteCallback = null;
}

// ─── XSS 방지 ───
function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Edit Modal ───
function openEditModal(uid) {
  const user = allUsers.find(u => u.uid === uid);
  if (!user) return;
  editingUid = uid;
  document.getElementById('edit-name').textContent = user.displayName || '(이름 없음)';
  document.getElementById('edit-email').textContent = user.email || '-';
  document.getElementById('edit-phone').textContent = formatPhone(user.phone) || '-';
  document.getElementById('edit-university-input').value = user.university || '';
  document.getElementById('edit-nickname-input').value = user.nickname || '';
  document.getElementById('edit-credits-input').value = user.credits;
  document.getElementById('edit-freepoints-input').value = user.freePoints ?? 0;
  document.getElementById('edit-referral-input').value = user.referralCredits ?? 0;
  document.getElementById('edit-modal').classList.add('visible');

  // 히스토리 탭 초기화
  document.getElementById('modal-htab-quizzes').innerHTML = '<div class="modal-history-empty">불러오는 중...</div>';
  document.getElementById('modal-htab-payments').innerHTML = '<div class="modal-history-empty">불러오는 중...</div>';
  document.querySelectorAll('.modal-history-tab').forEach(t => t.classList.toggle('active', t.dataset.htab === 'quizzes'));
  document.getElementById('modal-htab-quizzes').style.display = '';
  document.getElementById('modal-htab-payments').style.display = 'none';

  // 비동기 로드
  loadUserHistory(uid);
}

async function loadUserHistory(uid) {
  try {
    const idToken = await currentUser.getIdToken();
    const [quizzesRes, paymentsRes] = await Promise.all([
      fetch(`/api/admin?token=${idToken}&type=user_quizzes&uid=${uid}`),
      fetch(`/api/admin?token=${idToken}&type=user_payments&uid=${uid}`),
    ]);
    const quizzesData = await quizzesRes.json();
    const paymentsData = await paymentsRes.json();

    // 퀴즈 히스토리
    const qWrap = document.getElementById('modal-htab-quizzes');
    const quizzes = quizzesData.quizzes || [];
    if (!quizzes.length) {
      qWrap.innerHTML = '<div class="modal-history-empty">생성한 퀴즈가 없습니다.</div>';
    } else {
      qWrap.innerHTML = quizzes.map(q => `
        <div class="modal-history-item">
          <span style="color:var(--text-primary)">${escapeHtml(q.subject) || '(주제없음)'}</span>
          <span style="color:var(--text-muted);font-size:12px">${q.questionCount}문제 · ${formatDate(q.createdAt)}</span>
        </div>`).join('');
    }

    // 결제 내역
    const pWrap = document.getElementById('modal-htab-payments');
    const payments = paymentsData.payments || [];
    if (!payments.length) {
      pWrap.innerHTML = '<div class="modal-history-empty">결제 내역이 없습니다.</div>';
    } else {
      pWrap.innerHTML = payments.map(p => {
        const d = p.processedAt ? new Date(p.processedAt) : null;
        const dateStr = d ? `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}` : '-';
        return `<div class="modal-history-item">
          <span style="color:var(--text-primary)">⚡ ${p.credits}문제</span>
          <span style="color:#a78bfa;font-weight:700">${p.amount ? p.amount.toLocaleString()+'원' : '-'} · ${dateStr}</span>
        </div>`;
      }).join('');
    }
  } catch (e) {
    document.getElementById('modal-htab-quizzes').innerHTML = '<div class="modal-history-empty">불러오기 실패</div>';
    document.getElementById('modal-htab-payments').innerHTML = '<div class="modal-history-empty">불러오기 실패</div>';
  }
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('visible');
  editingUid = null;
}

async function saveEdits() {
  if (!editingUid) return;
  const credits = parseInt(document.getElementById('edit-credits-input').value);
  const freePoints = parseInt(document.getElementById('edit-freepoints-input').value);
  const referralCredits = parseInt(document.getElementById('edit-referral-input').value);
  const nickname = document.getElementById('edit-nickname-input').value.trim();
  const university = document.getElementById('edit-university-input').value.trim();

  if (isNaN(credits) || credits < 0) {
    showToast('올바른 크레딧 값을 입력해주세요.', 'error');
    return;
  }
  if (isNaN(freePoints) || freePoints < 0) {
    showToast('올바른 무료 포인트 값을 입력해주세요.', 'error');
    return;
  }

  const saveBtn = document.getElementById('edit-save-btn');
  saveBtn.disabled = true;

  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: idToken, action: 'updateUser', uid: editingUid, credits, freePoints, referralCredits, nickname, university }),
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      showToast(data.error || '저장 실패', 'error');
      return;
    }

    const user = allUsers.find(u => u.uid === editingUid);
    if (user) {
      user.credits = credits;
      user.freePoints = freePoints;
      user.referralCredits = referralCredits;
      user.nickname = nickname;
      user.university = university;
    }
    showToast('유저 정보가 업데이트됐습니다.', 'success');
    closeEditModal();
    renderTable(allUsers);

    // 대시보드 통계 갱신 필요
    dashboardLoaded = false;
  } catch (e) {
    showToast('네트워크 오류: ' + e.message, 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

// ─── Delete Modal (User) ───
function openDeleteModal(uid) {
  const user = allUsers.find(u => u.uid === uid);
  if (!user) return;
  deletingUid = uid;
  const name = user.displayName || '(이름 없음)';
  const email = user.email || '-';
  document.getElementById('delete-desc').innerHTML = `<strong>${escapeHtml(name)}</strong> (${escapeHtml(email)})<br/>이 유저를 삭제하시겠습니까?<br/><span style="color:#f87171;font-size:13px">이 작업은 되돌릴 수 없습니다.</span>`;
  document.getElementById('delete-modal').classList.add('visible');
}

function closeDeleteModal() {
  document.getElementById('delete-modal').classList.remove('visible');
  deletingUid = null;
}

async function confirmDelete() {
  if (!deletingUid) return;
  const btn = document.getElementById('delete-confirm-btn');
  btn.disabled = true;
  btn.textContent = '삭제 중...';

  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: idToken, action: 'deleteUser', uid: deletingUid }),
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      showToast(data.error || '삭제 실패', 'error');
      return;
    }

    allUsers = allUsers.filter(u => u.uid !== deletingUid);
    showToast('유저가 삭제됐습니다.', 'success');
    closeDeleteModal();
    renderTable(allUsers);
    dashboardLoaded = false;
  } catch (e) {
    showToast('네트워크 오류: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '삭제';
  }
}

// ─── Delete Modal (Post) ───
function openPostDeleteModal(postId) {
  const post = allPosts.find(p => p.id === postId);
  deletingPostId = postId;
  const title = post?.title || '제목없음';
  document.getElementById('post-delete-desc').innerHTML = `<strong>${escapeHtml(title)}</strong><br/>이 게시글을 삭제하시겠습니까?<br/><span style="color:#f87171;font-size:13px">이 작업은 되돌릴 수 없습니다.</span>`;
  document.getElementById('post-delete-modal').classList.add('visible');
}

function closePostDeleteModal() {
  document.getElementById('post-delete-modal').classList.remove('visible');
  deletingPostId = null;
}

async function confirmPostDelete() {
  if (!deletingPostId) return;
  const btn = document.getElementById('post-delete-confirm-btn');
  btn.disabled = true;
  btn.textContent = '삭제 중...';

  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: idToken, action: 'deletePost', postId: deletingPostId }),
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      showToast(data.error || '삭제 실패', 'error');
      return;
    }

    allPosts = allPosts.filter(p => p.id !== deletingPostId);
    showToast('게시글이 삭제됐습니다.', 'success');
    closePostDeleteModal();
    renderPosts(allPosts);
    dashboardLoaded = false;
  } catch (e) {
    showToast('네트워크 오류: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '삭제';
  }
}

// ─── Utils ───
function formatProvider(provider) {
  if (provider === 'kakao') return '<span style="background:rgba(254,229,0,0.15);color:#f5c400;border:1px solid rgba(254,229,0,0.3);border-radius:4px;padding:2px 7px;font-size:11px;font-weight:700;">카카오</span>';
  if (provider === 'naver') return '<span style="background:rgba(3,199,90,0.15);color:#03c75a;border:1px solid rgba(3,199,90,0.3);border-radius:4px;padding:2px 7px;font-size:11px;font-weight:700;">네이버</span>';
  return '<span style="background:rgba(66,133,244,0.15);color:#4285f4;border:1px solid rgba(66,133,244,0.3);border-radius:4px;padding:2px 7px;font-size:11px;font-weight:700;">구글</span>';
}

function formatPhone(phone) {
  if (!phone) return '-';
  return phone.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
}

function formatDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success: '✅', error: '❌', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 300); }, 3500);
}

// ─── Monitor Tab ───
let monitorReady = false;
let monitorIntervalId = null;
let monitorAutoOn = true;

function setupMonitor() {
  if (!monitorReady) {
    monitorReady = true;
    document.getElementById('monitor-refresh-btn').addEventListener('click', () => fetchMonitor());
    document.getElementById('monitor-auto-btn').addEventListener('click', () => {
      monitorAutoOn = !monitorAutoOn;
      document.getElementById('monitor-auto-btn').textContent = monitorAutoOn ? '⏸ 자동 갱신 끄기' : '▶ 자동 갱신 켜기';
      document.getElementById('monitor-auto-label').textContent = monitorAutoOn ? '15초마다 자동 갱신' : '자동 갱신 꺼짐';
      document.getElementById('monitor-auto-dot').style.background = monitorAutoOn ? '#34d399' : '#6b7280';
      document.getElementById('monitor-auto-dot').style.boxShadow = monitorAutoOn ? '0 0 6px #34d399' : 'none';
      if (monitorAutoOn) startMonitorPolling();
      else stopMonitorPolling();
    });
  }
  fetchMonitor();
  startMonitorPolling();
}

function startMonitorPolling() {
  stopMonitorPolling();
  if (!monitorAutoOn) return;
  monitorIntervalId = setInterval(() => {
    if (activeTab === 'monitor') fetchMonitor();
  }, 15000);
}

function stopMonitorPolling() {
  if (monitorIntervalId) { clearInterval(monitorIntervalId); monitorIntervalId = null; }
}

async function fetchMonitor() {
  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch(`/api/monitor?token=${idToken}`);
    const data = await res.json();
    if (!res.ok || data.error) { showToast(data.error || '모니터 조회 실패', 'error'); return; }
    renderMonitor(data);
  } catch (e) { showToast('모니터 조회 실패: ' + e.message, 'error'); }
}

function barColor(ratio) {
  return ratio > 80 ? '#ef4444' : ratio > 60 ? '#f59e0b' : null;
}

function setBar(id, ratio, defaultColor) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.width = Math.min(ratio, 100) + '%';
  el.style.background = barColor(ratio) || defaultColor;
}

function renderMonitor(data) {
  const now = new Date();
  document.getElementById('monitor-last-updated').textContent =
    `마지막 갱신: ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;

  // 숫자 카드
  document.getElementById('mon-active-games').textContent = data.activeGames;
  document.getElementById('mon-waiting-rooms').textContent = data.waitingRooms;
  document.getElementById('mon-today-games').textContent = data.todayGames;
  document.getElementById('mon-today-users').textContent = data.todayUsers;
  document.getElementById('mon-daily-reads').textContent = (data.estimatedDailyReads || 0).toLocaleString();
  document.getElementById('mon-daily-writes').textContent = (data.estimatedDailyWrites || 0).toLocaleString();
  document.getElementById('mon-total-posts').textContent = data.totalPosts;
  document.getElementById('mon-today-quizzes').textContent = data.todayQuizzes;
  document.getElementById('mon-daily-kv').textContent = (data.estimatedDailyKvReads || 0).toLocaleString();

  // 비율 계산
  const readsRatio  = Math.min((data.estimatedDailyReads  / 50000) * 100, 100);
  const writesRatio = Math.min((data.estimatedDailyWrites / 20000) * 100, 100);
  const gamesRatio  = Math.min((data.activeGames          / 300)   * 100, 100);
  const roomsRatio  = Math.min((data.waitingRooms         / 30)    * 100, 100);
  const postsRatio  = Math.min((data.totalPosts           / 10000) * 100, 100);
  const kvRatio     = Math.min((data.estimatedDailyKvReads/ 100000)* 100, 100);
  const quizzesRatio= Math.min((data.todayQuizzes         / 300)   * 100, 100);

  // 카드 내 작은 바
  setBar('mon-reads-fill',   readsRatio,   '#34d399');
  setBar('mon-writes-fill',  writesRatio,  '#f87171');
  setBar('mon-active-games-fill', gamesRatio, '#a78bfa');
  setBar('mon-waiting-rooms-fill', roomsRatio, '#60a5fa');
  setBar('mon-posts-fill',   postsRatio,   '#e879f9');
  setBar('mon-quizzes-fill', quizzesRatio, '#fb923c');
  setBar('mon-kv-fill',      kvRatio,      '#38bdf8');

  // 한도 현황 바
  setBar('mon-reads-bar',  readsRatio,  '#34d399');
  setBar('mon-writes-bar', writesRatio, '#f87171');
  setBar('mon-games-bar',  gamesRatio,  '#a78bfa');
  setBar('mon-rooms-bar',  roomsRatio,  '#60a5fa');
  setBar('mon-posts-bar',  postsRatio,  '#e879f9');
  setBar('mon-kv-bar',     kvRatio,     '#38bdf8');

  // 라벨
  document.getElementById('mon-reads-label').textContent  = `${(data.estimatedDailyReads||0).toLocaleString()} / 50,000 (${readsRatio.toFixed(1)}%)`;
  document.getElementById('mon-writes-label').textContent = `${(data.estimatedDailyWrites||0).toLocaleString()} / 20,000 (${writesRatio.toFixed(1)}%)`;
  document.getElementById('mon-games-label').textContent  = `${data.activeGames} / 300 (${gamesRatio.toFixed(1)}%)`;
  document.getElementById('mon-rooms-label').textContent  = `${data.waitingRooms} / 30`;
  document.getElementById('mon-posts-label').textContent  = `${data.totalPosts} / 10,000 (${postsRatio.toFixed(1)}%)`;
  document.getElementById('mon-kv-label').textContent     = `${(data.estimatedDailyKvReads||0).toLocaleString()} / 100,000 (${kvRatio.toFixed(1)}%)`;

  // 로드맵
  renderRoadmap(data);

  // 경고 (조치 방법 포함)
  const warningsEl = document.getElementById('monitor-warnings');
  if (!data.warnings || data.warnings.length === 0) {
    warningsEl.innerHTML = '<div style="padding:12px 16px;background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.2);border-radius:10px;font-size:13px;color:#34d399;margin-bottom:16px">✅ 모든 지표 정상</div>';
  } else {
    warningsEl.innerHTML = data.warnings.map(w => {
      const isCritical = w.level === 'critical';
      const bg    = isCritical ? 'rgba(239,68,68,0.08)'  : 'rgba(245,158,11,0.08)';
      const border= isCritical ? 'rgba(239,68,68,0.3)'   : 'rgba(245,158,11,0.3)';
      const color = isCritical ? '#f87171'                : '#fbbf24';
      return `<div style="padding:14px 16px;background:${bg};border:1px solid ${border};border-radius:10px;margin-bottom:8px">
        <div style="font-size:13px;color:${color};font-weight:600;margin-bottom:6px">${isCritical ? '🚨' : '⚠️'} ${w.message}</div>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">👉 ${w.action}</div>
      </div>`;
    }).join('');
  }
}

function renderRoadmap(data) {
  // Firebase 월 예상 비용 계산
  const monthlyReads  = (data.estimatedDailyReads  || 0) * 30;
  const monthlyWrites = (data.estimatedDailyWrites || 0) * 30;
  const freeReads  = 1500000, freeWrites = 600000;
  const KRW_PER_USD = 1500;
  const readsCost  = Math.max(0, monthlyReads  - freeReads)  / 100000 * 0.06 * KRW_PER_USD;
  const writesCost = Math.max(0, monthlyWrites - freeWrites) / 100000 * 0.18 * KRW_PER_USD;
  const firebaseMonthlyCost = Math.round(readsCost + writesCost);

  const costEl = document.getElementById('mon-firebase-monthly-cost');
  if (costEl) {
    costEl.textContent = firebaseMonthlyCost === 0
      ? '₩0 (무료 티어 내)'
      : `₩${firebaseMonthlyCost.toLocaleString()}/월`;
  }

  // 현재 단계 판단
  const readsRatio  = (data.estimatedDailyReads  || 0) / 50000;
  const postsRatio  = (data.totalPosts           || 0) / 10000;
  let currentStage = 0;
  if (firebaseMonthlyCost >= 150000)                         currentStage = 3;
  else if (firebaseMonthlyCost >= 100000 || readsRatio >= 0.8) currentStage = 2;
  else if (readsRatio >= 0.6 || postsRatio >= 0.7)           currentStage = 1;

  const stages = [
    {
      label: '1단계 · 초기',
      color: '#34d399',
      desc: 'Firebase 무료 티어 내 운영',
      trigger: 'Firestore 읽기 < 60% · 게시글 < 7,000개',
      action: '현재 구조 유지. 모니터링 계속.',
      done: currentStage >= 0,
      active: currentStage === 0,
    },
    {
      label: '2단계 · 성장 주의',
      color: '#fbbf24',
      desc: 'Firestore 읽기 60% 초과 or 게시글 7,000개 이상',
      trigger: `현재: 읽기 ${((readsRatio)*100).toFixed(1)}% · 게시글 ${data.totalPosts || 0}개`,
      action: '📧 이메일 알림 발송됨 — Gemini 유료 전환 준비, Algolia → Firestore 검색 교체 검토',
      done: currentStage >= 1,
      active: currentStage === 1,
    },
    {
      label: '3단계 · 유료 전환',
      color: '#f97316',
      desc: 'Firebase 월 비용 ₩100,000 초과 or 읽기 80% 초과',
      trigger: `현재 월 예상 비용: ₩${firebaseMonthlyCost.toLocaleString()}`,
      action: '📧 이메일 알림 발송됨 — Algolia 교체 즉시 실행, Cloudflare Workers Paid 업그레이드',
      done: currentStage >= 2,
      active: currentStage === 2,
    },
    {
      label: '4단계 · 서버 이전 준비',
      color: '#ef4444',
      desc: 'Firebase 월 비용 ₩150,000 초과',
      trigger: '기준: ₩150,000/월',
      action: '📧 이메일 알림 발송됨 — Firebase → 자체 서버 + PostgreSQL 병렬 이전 시작 (서비스 중단 없음)',
      done: currentStage >= 3,
      active: currentStage === 3,
    },
  ];

  const roadmapEl = document.getElementById('mon-roadmap');
  if (!roadmapEl) return;
  roadmapEl.innerHTML = stages.map((s, i) => {
    const isActive = s.active;
    const isPast   = s.done && !s.active;
    const isFuture = !s.done;
    const bg     = isActive ? `rgba(${s.color === '#34d399' ? '52,211,153' : s.color === '#fbbf24' ? '251,191,36' : s.color === '#f97316' ? '249,115,22' : '239,68,68'},0.08)` : 'rgba(255,255,255,0.02)';
    const border = isActive ? s.color : 'rgba(255,255,255,0.07)';
    const dot    = isPast ? '#34d399' : isActive ? s.color : 'rgba(255,255,255,0.15)';
    const icon   = isPast ? '✅' : isActive ? '📍' : '⬜';
    return `<div style="display:flex;gap:14px;padding:14px 16px;background:${bg};border:1px solid ${border};border-radius:10px">
      <div style="width:10px;height:10px;border-radius:50%;background:${dot};margin-top:4px;flex-shrink:0"></div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700;color:${isActive ? s.color : isFuture ? 'var(--text-muted)' : 'var(--text-primary)'};margin-bottom:2px">${icon} ${s.label}${isActive ? ' ← 현재' : ''}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:${isActive ? '8px' : '0'}">${isActive ? s.trigger : s.desc}</div>
        ${isActive ? `<div style="font-size:12px;color:var(--text-secondary);line-height:1.5">👉 ${s.action}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

init();
