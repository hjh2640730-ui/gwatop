// ============================================================
// GWATOP - Firebase Auth Module v1.3.0
// 크레딧 기반 과금 + 추천인 시스템
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import firebaseConfig from './firebase-config.js';

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
}

export async function handleRedirectResult() { return null; }

// ─── Ensure User Document (신규 가입 시 2 크레딧 무료 지급) ───
export async function ensureUserDoc(user) {
  if (!isConfigured || !db) return;
  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        credits: 2,           // 신규 가입 무료 크레딧
        referralCredits: 0,   // 추천으로 얻은 크레딧 합계
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
      // 기존 유저 credits 필드 마이그레이션
      const data = snap.data();
      const updates = {};
      if (data.credits === undefined) updates.credits = 2;
      if (data.referralCredits === undefined) updates.referralCredits = 0;
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
      credits: increment(1),
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

// ─── Get Credits ───
export async function getCredits(uid) {
  const data = await getUserData(uid);
  return data?.credits ?? 0;
}

// ─── Deduct 1 Credit (퀴즈 생성 시 차감) ───
export async function deductCredit(uid) {
  if (!isConfigured || !db) return true;
  try {
    const ref = doc(db, 'users', uid);
    await updateDoc(ref, {
      credits: increment(-1),
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

export { isConfigured, auth, db };
