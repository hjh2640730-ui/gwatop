// ============================================================
// GWATOP - Firebase Auth Module v1.0.2
// Popup 방식으로 변경 (redirect 방식 호환성 문제 해결)
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

// ─── Google Sign-In (Popup 방식) ───
export async function signInWithGoogle() {
  if (!isConfigured) {
    alert('Firebase가 설정되지 않았습니다.\nfirebase-config.js 파일을 확인해주세요.');
    return;
  }
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    if (result.user) {
      await ensureUserDoc(result.user);
    }
  } catch (e) {
    if (e.code === 'auth/popup-closed-by-user') return; // 사용자가 닫은 경우 무시
    console.error('Sign in error:', e);
    alert('로그인 중 오류가 발생했습니다: ' + e.message);
  }
}

// ─── Sign Out ───
export async function logOut() {
  if (!isConfigured) return;
  try {
    await signOut(auth);
  } catch (e) {
    console.error('Sign out error:', e);
  }
}

// ─── Redirect Result (더 이상 사용 안 하지만 호환성 유지) ───
export async function handleRedirectResult() {
  return null;
}

// ─── Ensure User Document in Firestore ───
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
        plan: 'free',
        quizGeneratedToday: 0,
        lastQuizDate: null,
        totalQuizzes: 0,
        createdAt: serverTimestamp()
      });
    }
  } catch (e) {
    console.warn('ensureUserDoc error (non-critical):', e);
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

// ─── Check & Increment Quiz Count ───
export async function checkAndIncrementQuizCount(uid) {
  if (!isConfigured || !db) return { allowed: true };
  try {
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { allowed: true };

    const data = snap.data();
    const today = new Date().toDateString();
    const lastDate = data.lastQuizDate?.toDate?.()?.toDateString?.() || '';
    let count = lastDate === today ? (data.quizGeneratedToday || 0) : 0;

    if (data.plan === 'premium') {
      await updateDoc(ref, {
        quizGeneratedToday: count + 1,
        lastQuizDate: serverTimestamp(),
        totalQuizzes: increment(1)
      });
      return { allowed: true, plan: 'premium' };
    }

    if (count >= 1) {
      return { allowed: false, plan: 'free', reason: 'limit' };
    }

    await updateDoc(ref, {
      quizGeneratedToday: count + 1,
      lastQuizDate: serverTimestamp(),
      totalQuizzes: increment(1)
    });
    return { allowed: true, plan: 'free' };
  } catch (e) {
    console.warn('checkAndIncrementQuizCount error:', e);
    return { allowed: true };
  }
}

// ─── Upgrade to Premium ───
export async function upgradeToPremium(uid) {
  if (!isConfigured || !db) return;
  try {
    const ref = doc(db, 'users', uid);
    await updateDoc(ref, { plan: 'premium' });
  } catch (e) {
    console.error('upgradeToPremium error:', e);
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
      console.warn('onUserChange handler error:', e);
      callback(user || null, null);
    }
  });
  return unsubscribe;
}

export { isConfigured, auth, db };
