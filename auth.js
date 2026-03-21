// ============================================================
// GWATOP - Firebase Auth Module v1.3.0
// 크레딧 기반 과금 + 추천인 시스템
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCustomToken,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  limit,
  runTransaction
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import firebaseConfig from './firebase-config.js';

// ─── 소셜 로그인 공개 키 ───
const KAKAO_REST_API_KEY = '6750d096b2c523c0a557ee153c62ddbd';

const NAVER_CLIENT_ID = '7qK5JB94z8TvW5FFOnti';

// ─── Firebase Init ───
let app, auth, db, rtdb;
let isConfigured = false;

try {
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== 'YOUR_API_KEY') {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    rtdb = getDatabase(app);
    isConfigured = true;
  }
} catch (e) {
  console.warn('Firebase initialization failed:', e);
}

// ─── 추천인 파라미터 저장 ───
const refParam = new URLSearchParams(window.location.search).get('ref');
if (refParam) localStorage.setItem('gwatop_ref', refParam);

// ─── Google Sign-In ───
export async function signInWithGoogle() {
  if (!isConfigured) {
    alert('Firebase가 설정되지 않았습니다.');
    return;
  }
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
    // ensureUserDoc은 onAuthStateChanged에서만 호출 (중복 방지)
  } catch (e) {
    if (e.code === 'auth/popup-closed-by-user') return;
    console.error('Sign in error:', e);
    alert('로그인 오류: ' + e.message);
  }
}

// ─── Sign Out ───
export async function logOut() {
  if (!isConfigured) return;
  // gwatop_ 접두사 localStorage 전부 정리
  Object.keys(localStorage).filter(k => k.startsWith('gwatop_')).forEach(k => localStorage.removeItem(k));
  try { await signOut(auth); } catch (e) { console.error(e); }
  window.location.reload();
}

export async function handleRedirectResult() { return null; }

// ─── Ensure User Document (신규 가입 시 2 크레딧 무료 지급) ───
export async function ensureUserDoc(user, extra = {}) {
  if (!isConfigured || !db) return;
  // extra: 카카오/네이버처럼 Firebase Auth에 이메일/전화번호가 없을 때 직접 전달
  const email = user.email || extra.email || '';
  const displayName = user.displayName || extra.displayName || '';
  const photoURL = user.photoURL || extra.photoURL || '';
  const phone = extra.phone || '';
  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      // 중복 확인: 전화번호 우선, 없으면 이메일로 체크
      try {
        if (phone) {
          const phoneSnap = await getDocs(query(collection(db, 'users'), where('phone', '==', phone), limit(1)));
          if (!phoneSnap.empty) {
            try { await user.delete(); } catch (_) {}
            await signOut(auth);
            const err = new Error('이미 다른 방법으로 가입된 전화번호입니다. 기존 로그인 방법을 사용해주세요.');
            err.code = 'auth/duplicate-account';
            throw err;
          }
        } else if (email) {
          const emailSnap = await getDocs(query(collection(db, 'users'), where('email', '==', email), limit(1)));
          if (!emailSnap.empty) {
            try { await user.delete(); } catch (_) {}
            await signOut(auth);
            const err = new Error('이미 다른 방법으로 가입된 이메일입니다. 기존 로그인 방법을 사용해주세요.');
            err.code = 'auth/duplicate-account';
            throw err;
          }
        }
      } catch (e) {
        if (e.code === 'auth/duplicate-account') throw e;
      }

      await setDoc(ref, {
        uid: user.uid,
        email,
        displayName,
        photoURL,
        phone,
        credits: freeCredits,
        referralCredits: 0,
        totalQuizzes: 0,
        ...(extra.provider ? { provider: extra.provider } : {}),
        createdAt: serverTimestamp()
      });

      // 추천인 처리
      const refUid = localStorage.getItem('gwatop_ref');
      if (refUid && refUid !== user.uid) {
        await addReferralCredit(refUid);
        localStorage.removeItem('gwatop_ref');
      }
    } else {
      const data = snap.data();
      const updates = {};
      if (data.credits === undefined) updates.credits = 30;
      if (data.referralCredits === undefined) updates.referralCredits = 0;
      if (displayName && !data.displayName) updates.displayName = displayName;
      if (email && !data.email) updates.email = email;
      if (photoURL && !data.photoURL) updates.photoURL = photoURL;
      if (phone && !data.phone) updates.phone = phone;
      if (extra.provider && data.provider !== extra.provider) updates.provider = extra.provider;
      if (Object.keys(updates).length > 0) await updateDoc(ref, updates);
    }
  } catch (e) {
    console.warn('ensureUserDoc error:', e);
  }
}

// ─── 추천인 크레딧 지급 (최대 3회) ───
export async function addReferralCredit(referrerUid) {
  if (!isConfigured || !db) return;
  try {
    const ref = doc(db, 'users', referrerUid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    const referralCredits = data.referralCredits ?? 0;
    if (referralCredits >= 3) return; // 최대 3회 제한
    await updateDoc(ref, {
      credits: increment(5),
      referralCredits: increment(1)
    });
  } catch (e) {
    console.warn('addReferralCredit error:', e);
  }
}

// ─── Get User Data ───
export async function getUserData(uid) {
  if (!isConfigured || !db) return null;
  try {
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn('getUserData error:', e);
    return null;
  }
}

// ─── 닉네임 중복 확인 ───
export async function checkNicknameAvailable(nickname) {
  if (!isConfigured || !db) return true;
  try {
    const q = query(collection(db, 'users'), where('nickname', '==', nickname), limit(1));
    const snap = await getDocs(q);
    return snap.empty;
  } catch { return true; }
}

// ─── 닉네임 저장 ───
export async function setNickname(uid, nickname) {
  if (!isConfigured || !db) return;
  await updateDoc(doc(db, 'users', uid), { nickname });
}

// ─── Get Credits ───
export async function getCredits(uid) {
  const data = await getUserData(uid);
  return data?.credits ?? 0;
}

// ─── 문제 수 → 차감 크레딧 계산 (1문제 = 1크레딧) ───
export function calcCredits(count) {
  return count;
}

// ─── Deduct Credits (문제 수 기반 차감) ───
export async function deductCredit(uid, amount = 1) {
  return deductCreditMixed(uid, amount, false);
}

// ─── Deduct Credits (무료P 우선 혼합 차감) ───
// useFreeFirst: true이면 freePoints 먼저 소진, 부족분은 credits에서 차감
export async function deductCreditMixed(uid, amount = 1, useFreeFirst = false) {
  if (!isConfigured || !db) return true;
  try {
    const ref = doc(db, 'users', uid);
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error('사용자 문서 없음');
      const data = snap.data();
      const credits = data.credits ?? 0;
      const freePoints = data.freePoints ?? 0;

      let freeDeduct = 0;
      let creditDeduct = amount;
      if (useFreeFirst && freePoints > 0) {
        freeDeduct = Math.min(freePoints, amount);
        creditDeduct = amount - freeDeduct;
      }

      if (credits < creditDeduct) throw new Error('크레딧이 부족합니다.');

      const updates = { totalQuizzes: increment(1) };
      if (creditDeduct > 0) updates.credits = increment(-creditDeduct);
      if (freeDeduct > 0) updates.freePoints = increment(-freeDeduct);
      transaction.update(ref, updates);
    });
    return true;
  } catch (e) {
    console.error('deductCreditMixed error:', e);
    return false;
  }
}

// ─── Nav Cache ───
const NAV_CACHE_KEY = 'gwatop_nav_cache';

function applyNavCache() {
  try {
    const raw = localStorage.getItem(NAV_CACHE_KEY);
    if (!raw) return;
    const cache = JSON.parse(raw);
    const lo = document.getElementById('nav-auth-logged-out');
    const li = document.getElementById('nav-auth-logged-in');
    if (!lo || !li) return;
    lo.style.display = 'none';
    li.style.display = 'flex';
    const avatar = document.getElementById('nav-avatar');
    const username = document.getElementById('nav-username');
    const credits = document.getElementById('nav-credits');
    if (avatar) avatar.src = cache.photoURL || '';
    if (username) username.textContent = cache.nickname || cache.displayName || '';
    if (credits) credits.textContent = cache.credits ?? 0;
  } catch (_) {}
}

// ─── Auth State Observer ───
export function onUserChange(callback) {
  if (!isConfigured) {
    callback(null, null);
    return () => {};
  }

  // 캐시된 로그인 상태를 즉시 적용해 flash 방지
  applyNavCache();

  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    try {
      if (user) {
        const providerData = user.providerData || [];
        const isGoogle = providerData.some(p => p.providerId === 'google.com');
        await ensureUserDoc(user, isGoogle ? { provider: 'google' } : {});
        const userData = await getUserData(user.uid);
        localStorage.setItem(NAV_CACHE_KEY, JSON.stringify({
          photoURL: user.photoURL || '',
          displayName: user.displayName || '',
          nickname: userData?.nickname || '',
          credits: userData?.credits ?? 0
        }));
        injectInboxNav(user);
        callback(user, userData);
      } else {
        localStorage.removeItem(NAV_CACHE_KEY);
        document.getElementById('nav-inbox-btn')?.remove();
        document.getElementById('nav-inbox-flyout')?.remove();
        callback(null, null);
      }
    } catch (e) {
      if (e.code === 'auth/duplicate-account') {
        alert(e.message);
        callback(null, null);
        return;
      }
      console.warn('onUserChange error:', e);
      callback(user || null, null);
    }
  });
  return unsubscribe;
}

// ─── Kakao Sign-In ───
export function signInWithKakao() {
  if (!isConfigured) { alert('Firebase가 설정되지 않았습니다.'); return; }

  const redirectUri = `${window.location.origin}/kakao-callback.html`;
  const authUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_REST_API_KEY}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;

  const popup = window.open(authUrl, 'kakao-login', 'width=500,height=600,scrollbars=yes,resizable=yes');
  if (!popup) { alert('팝업이 차단되었습니다. 팝업을 허용해주세요.'); return; }

  const handleMessage = async (e) => {
    if (e.origin !== window.location.origin || !e.data?.kakaoCustomToken) return;
    window.removeEventListener('message', handleMessage);
    try {
      const credential = await signInWithCustomToken(auth, e.data.kakaoCustomToken);
      if (e.data.displayName || e.data.photoURL) {
        await updateProfile(credential.user, {
          displayName: e.data.displayName || '',
          photoURL: e.data.photoURL || ''
        });
      }
      await ensureUserDoc(auth.currentUser, {
        email: e.data.email,
        phone: e.data.phone,
        displayName: e.data.displayName,
        photoURL: e.data.photoURL,
        provider: 'kakao'
      });
      await _forceSocialProfile(auth.currentUser.uid, e.data.email, e.data.phone, e.data.displayName, e.data.photoURL, 'kakao');
      _updateNavAvatar(e.data.photoURL, e.data.displayName);
    } catch (err) {
      console.error('Kakao sign-in error:', err);
      if (err.code === 'auth/duplicate-account') {
        alert(err.message);
      } else {
        alert('카카오 로그인 처리 중 오류가 발생했습니다.');
      }
    }
  };
  window.addEventListener('message', handleMessage);
}

// ─── Naver Sign-In ───
export function signInWithNaver() {
  if (!isConfigured) { alert('Firebase가 설정되지 않았습니다.'); return; }
  if (!NAVER_CLIENT_ID) { alert('네이버 클라이언트 ID가 설정되지 않았습니다.\nauth.js의 NAVER_CLIENT_ID를 설정해주세요.'); return; }

  const redirectUri = encodeURIComponent(`${window.location.origin}/naver-callback.html`);
  const authUrl = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${NAVER_CLIENT_ID}&redirect_uri=${redirectUri}&state=gwatop`;

  const popup = window.open(authUrl, 'naver-login', 'width=500,height=600,scrollbars=yes,resizable=yes');
  if (!popup) { alert('팝업이 차단되었습니다. 팝업을 허용해주세요.'); return; }

  const handleMessage = async (e) => {
    if (e.origin !== window.location.origin || !e.data?.naverCustomToken) return;
    window.removeEventListener('message', handleMessage);
    console.log('[Naver] received:', { email: e.data.email, phone: e.data.phone, displayName: e.data.displayName });
    try {
      const credential = await signInWithCustomToken(auth, e.data.naverCustomToken);
      if (e.data.displayName || e.data.photoURL) {
        await updateProfile(credential.user, {
          displayName: e.data.displayName || '',
          photoURL: e.data.photoURL || ''
        });
      }
      await ensureUserDoc(auth.currentUser, {
        email: e.data.email,
        phone: e.data.phone,
        displayName: e.data.displayName,
        photoURL: e.data.photoURL,
        provider: 'naver'
      });
      await _forceSocialProfile(auth.currentUser.uid, e.data.email, e.data.phone, e.data.displayName, e.data.photoURL, 'naver');
      _updateNavAvatar(e.data.photoURL, e.data.displayName);
    } catch (err) {
      console.error('Naver sign-in error:', err);
      if (err.code === 'auth/duplicate-account') {
        alert(err.message);
      } else {
        alert('네이버 로그인 처리 중 오류가 발생했습니다.');
      }
    }
  };
  window.addEventListener('message', handleMessage);
}

// ─── 소셜 로그인 프로필 강제 저장 (레이스 컨디션 방지) ───
async function _forceSocialProfile(uid, email, phone, displayName, photoURL, provider) {
  if (!db) return;
  try {
    const updates = {};
    if (email) updates.email = email;
    if (phone) updates.phone = phone;
    if (displayName) updates.displayName = displayName;
    if (photoURL) updates.photoURL = photoURL;
    if (provider) updates.provider = provider;
    if (Object.keys(updates).length > 0) {
      await setDoc(doc(db, 'users', uid), updates, { merge: true });
    }
  } catch (e) {
    console.warn('_forceSocialProfile error:', e.code, e.message);
  }
}

// ─── 소셜 로그인 후 nav 즉시 업데이트 ───
function _updateNavAvatar(photoURL, displayName) {
  const avatar = document.getElementById('nav-avatar');
  const username = document.getElementById('nav-username');
  if (avatar && photoURL) avatar.src = photoURL;
  if (username && displayName) username.textContent = displayName;
}

export { isConfigured, auth, db, rtdb, app };

// ─── 메시지함 네비 버튼 ───
function injectInboxNav(user) {
  if (document.getElementById('nav-inbox-btn')) return;
  const navLi = document.getElementById('nav-auth-logged-in');
  if (!navLi) return;

  // 버튼 생성
  const btn = document.createElement('button');
  btn.id = 'nav-inbox-btn';
  btn.className = 'nav-inbox-btn';
  btn.title = '메시지함';
  btn.innerHTML = '📬<span class="nav-inbox-badge" id="nav-inbox-badge" style="display:none">0</span>';

  // credits 배지 앞에 삽입
  const creditsBadge = navLi.querySelector('.nav-plan-badge');
  creditsBadge ? navLi.insertBefore(btn, creditsBadge) : navLi.prepend(btn);

  // 플라이아웃 생성
  const flyout = document.createElement('div');
  flyout.id = 'nav-inbox-flyout';
  flyout.className = 'nav-inbox-flyout';
  flyout.innerHTML = '<div class="nav-inbox-head">📬 메시지함</div><div id="nav-inbox-body"><div class="nav-inbox-loading">불러오는 중...</div></div><a href="/mypage.html" class="nav-inbox-footer">전체 보기 →</a>';
  document.body.appendChild(flyout);

  let flyoutOpen = false;
  let flyoutLoaded = false;

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    flyoutOpen = !flyoutOpen;
    flyout.classList.toggle('open', flyoutOpen);
    btn.classList.toggle('active', flyoutOpen);

    // 위치 계산 (fixed)
    const rect = btn.getBoundingClientRect();
    flyout.style.top = (rect.bottom + 8) + 'px';
    flyout.style.right = Math.max(8, window.innerWidth - rect.right) + 'px';

    if (flyoutOpen && !flyoutLoaded) {
      flyoutLoaded = true;
      await renderInboxFlyout(user, document.getElementById('nav-inbox-body'));
    }
  });

  document.addEventListener('click', (e) => {
    if (!flyout.contains(e.target) && e.target !== btn) {
      flyoutOpen = false;
      flyout.classList.remove('open');
      btn.classList.remove('active');
    }
  });
  flyout.addEventListener('click', e => e.stopPropagation());

  // 뱃지 카운트 로드
  loadInboxBadgeCount(user);
}

async function loadInboxBadgeCount(user) {
  if (!db) return;
  try {
    // global_messages는 5분 캐시 (자주 변경되지 않음)
    const GM_CACHE_KEY = 'gm_cache';
    const GM_CACHE_TTL = 5 * 60 * 1000;
    let globalDocs;
    try {
      const cached = JSON.parse(localStorage.getItem(GM_CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.ts < GM_CACHE_TTL) {
        globalDocs = cached.docs;
      }
    } catch (_) {}
    if (!globalDocs) {
      const snap = await getDocs(query(collection(db, 'global_messages'), limit(50)));
      globalDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      try { localStorage.setItem(GM_CACHE_KEY, JSON.stringify({ ts: Date.now(), docs: globalDocs })); } catch (_) {}
    }

    const [claimedSnap, inboxSnap] = await Promise.all([
      getDocs(collection(db, 'users', user.uid, 'claimed')),
      getDocs(query(collection(db, 'users', user.uid, 'inbox'), where('claimed', '==', false))),
    ]);
    const claimedIds = new Set(claimedSnap.docs.map(d => d.id));
    const globalPending = globalDocs.filter(d => {
      return d.rewardType === 'freePoints' && d.rewardAmount > 0 && !claimedIds.has(d.id);
    }).length;
    const inboxPending = inboxSnap.docs.filter(d => {
      const data = d.data();
      return data.rewardType === 'freePoints' && data.rewardAmount > 0;
    }).length;
    const total = globalPending + inboxPending;
    const badge = document.getElementById('nav-inbox-badge');
    if (badge) {
      badge.textContent = total;
      badge.style.display = total > 0 ? '' : 'none';
    }
  } catch (_) {}
}

async function renderInboxFlyout(user, wrap) {
  if (!db) return;
  try {
    const [globalSnap, claimedSnap, inboxSnap] = await Promise.all([
      getDocs(query(collection(db, 'global_messages'), orderBy('createdAt', 'desc'), limit(10))),
      getDocs(collection(db, 'users', user.uid, 'claimed')),
      getDocs(query(collection(db, 'users', user.uid, 'inbox'), orderBy('createdAt', 'desc'), limit(10))),
    ]);
    const claimedIds = new Set(claimedSnap.docs.map(d => d.id));
    const messages = [];

    inboxSnap.docs.forEach(d => messages.push({ id: d.id, messageType: 'inbox', ...d.data() }));
    globalSnap.docs.forEach(d => messages.push({ id: d.id, messageType: 'global', claimed: claimedIds.has(d.id), ...d.data() }));

    messages.sort((a, b) => {
      const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
      return tb - ta;
    });

    if (!messages.length) {
      wrap.innerHTML = '<div class="nav-inbox-empty">메시지가 없습니다.</div>';
      return;
    }

    wrap.innerHTML = messages.slice(0, 8).map(m => {
      const hasReward = m.rewardType === 'freePoints' && m.rewardAmount > 0;
      const claimed = m.claimed;
      const isNew = hasReward && !claimed;
      return `<div class="nav-inbox-item${isNew ? ' nav-inbox-item-new' : ''}">
        <div class="nav-inbox-item-title">${isNew ? '<span class="nav-inbox-dot"></span>' : ''}${esc(m.title || '(제목없음)')}</div>
        <div class="nav-inbox-item-body">${esc((m.body || '').slice(0, 60))}${(m.body||'').length > 60 ? '...' : ''}</div>
        ${hasReward ? `<div style="margin-top:6px">${claimed
          ? '<span class="nav-inbox-claimed">✅ 수령 완료</span>'
          : `<button class="nav-inbox-claim-btn" data-id="${m.id}" data-type="${m.messageType}" data-amount="${m.rewardAmount}">🎁 +${m.rewardAmount}P 받기</button>`
        }</div>` : ''}
      </div>`;
    }).join('');

    // 받기 버튼
    wrap.querySelectorAll('.nav-inbox-claim-btn').forEach(claimBtn => {
      claimBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        claimBtn.disabled = true;
        claimBtn.textContent = '처리 중...';
        try {
          const idToken = await user.getIdToken();
          const res = await fetch('/api/claim-reward', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId: claimBtn.dataset.id, messageType: claimBtn.dataset.type }),
          });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error);
          claimBtn.parentElement.innerHTML = '<span class="nav-inbox-claimed">✅ 수령 완료</span>';
          claimBtn.closest('.nav-inbox-item-new')?.classList.remove('nav-inbox-item-new');
          // 뱃지 감소
          const badge = document.getElementById('nav-inbox-badge');
          if (badge) {
            const cur = Math.max(0, parseInt(badge.textContent) - 1);
            badge.textContent = cur;
            badge.style.display = cur > 0 ? '' : 'none';
          }
          // 네비 크레딧 업데이트
          const navCredits = document.getElementById('nav-credits');
          if (navCredits && data.newFreePoints !== undefined) {
            // freePoints는 nav에 표시 안하지만, credits 표시라도 업데이트
          }
          // mypage stat 업데이트
          const fpEl = document.getElementById('stat-free-points');
          if (fpEl && data.newFreePoints !== undefined) fpEl.textContent = data.newFreePoints;
        } catch (err) {
          claimBtn.disabled = false;
          claimBtn.textContent = `🎁 +${claimBtn.dataset.amount}P 받기`;
          alert(err.message || '처리 실패');
        }
      });
    });
  } catch (_) {
    wrap.innerHTML = '<div class="nav-inbox-empty">불러오기 실패</div>';
  }
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── 게임 대기 중 크로스페이지 알림 배지 ───
(function initGameBadge() {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === '/game.html') return;

  function checkAndShow() {
    if (document.getElementById('game-active-badge')) return;
    const stored = localStorage.getItem('gwatop_active_game');
    if (!stored) return;
    try {
      const d = JSON.parse(stored);
      if (!d?.gameId) return;
    } catch { return; }

    const badge = document.createElement('a');
    badge.id = 'game-active-badge';
    badge.href = '/game.html';
    badge.innerHTML = '✊ <span>게임 대기 중 · 탭하여 이동</span> <span style="margin-left:2px;opacity:0.7">→</span>';
    document.body.appendChild(badge);
  }

  function checkAndHide() {
    const stored = localStorage.getItem('gwatop_active_game');
    if (!stored) document.getElementById('game-active-badge')?.remove();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAndShow);
  } else {
    checkAndShow();
  }
  window.addEventListener('storage', () => { checkAndHide(); checkAndShow(); });
})();
