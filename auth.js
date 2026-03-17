// ============================================================
// GWATOP - Firebase Auth Module v1.3.0
// 크레딧 기반 과금 + 추천인 시스템
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
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
  getDocs,
  limit
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import firebaseConfig from './firebase-config.js';

// ─── 소셜 로그인 공개 키 ───
const KAKAO_REST_API_KEY = '6750d096b2c523c0a557ee153c62ddbd';
const NAVER_CLIENT_ID = '7qK5JB94z8TvW5FFOnti';

// ─── Firebase Init ───
let app, auth, db;
let isConfigured = false;

try {
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== 'YOUR_API_KEY') {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
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
      let freeCredits = 10;
      try {
        if (phone) {
          const phoneQ = query(collection(db, 'users'), where('phone', '==', phone), limit(1));
          const phoneSnap = await getDocs(phoneQ);
          if (!phoneSnap.empty) freeCredits = 0;
        } else if (email) {
          const emailQ = query(collection(db, 'users'), where('email', '==', email), limit(1));
          const emailSnap = await getDocs(emailQ);
          if (!emailSnap.empty) freeCredits = 0;
        }
      } catch (_) {}

      await setDoc(ref, {
        uid: user.uid,
        email,
        displayName,
        photoURL,
        phone,
        credits: freeCredits,
        referralCredits: 0,
        totalQuizzes: 0,
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
      if (data.credits === undefined) updates.credits = 10;
      if (data.referralCredits === undefined) updates.referralCredits = 0;
      if (displayName && !data.displayName) updates.displayName = displayName;
      if (email && !data.email) updates.email = email;
      if (photoURL && !data.photoURL) updates.photoURL = photoURL;
      if (phone && !data.phone) updates.phone = phone;
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
  if (!isConfigured || !db) return true;
  try {
    const ref = doc(db, 'users', uid);
    await updateDoc(ref, {
      credits: increment(-amount),
      totalQuizzes: increment(1)
    });
    return true;
  } catch (e) {
    console.error('deductCredit error:', e);
    return false;
  }
}

// ─── Auth State Observer ───
export function onUserChange(callback) {
  if (!isConfigured) {
    callback(null, null);
    return () => {};
  }
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    try {
      if (user) {
        await ensureUserDoc(user);
        const userData = await getUserData(user.uid);
        callback(user, userData);
      } else {
        callback(null, null);
      }
    } catch (e) {
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
        photoURL: e.data.photoURL
      });
      await _forceSocialProfile(auth.currentUser.uid, e.data.email, e.data.phone, e.data.displayName, e.data.photoURL);
      _updateNavAvatar(e.data.photoURL, e.data.displayName);
    } catch (err) {
      console.error('Kakao sign-in error:', err);
      alert('카카오 로그인 처리 중 오류가 발생했습니다.');
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
        photoURL: e.data.photoURL
      });
      await _forceSocialProfile(auth.currentUser.uid, e.data.email, e.data.phone, e.data.displayName, e.data.photoURL);
      _updateNavAvatar(e.data.photoURL, e.data.displayName);
    } catch (err) {
      console.error('Naver sign-in error:', err);
      alert('네이버 로그인 처리 중 오류가 발생했습니다.');
    }
  };
  window.addEventListener('message', handleMessage);
}

// ─── 소셜 로그인 프로필 강제 저장 (레이스 컨디션 방지) ───
async function _forceSocialProfile(uid, email, phone, displayName, photoURL) {
  if (!db) return;
  try {
    const updates = {};
    if (email) updates.email = email;
    if (phone) updates.phone = phone;
    if (displayName) updates.displayName = displayName;
    if (photoURL) updates.photoURL = photoURL;
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

export { isConfigured, auth, db };
