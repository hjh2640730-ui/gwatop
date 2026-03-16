// ============================================================
// GWATOP - Firebase Auth Module v1.0.0
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
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

// ─── Google Sign-In ───
export async function signInWithGoogle() {
  if (!isConfigured) {
    showFirebaseWarning();
    return;
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithRedirect(auth, provider);
}

// ─── Sign Out ───
export async function logOut() {
  if (!isConfigured) return;
  await signOut(auth);
  window.location.reload();
}

// ─── Handle Redirect Result ───
export async function handleRedirectResult() {
  if (!isConfigured) return null;
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      await ensureUserDoc(result.user);
      return result.user;
    }
    return null;
  } catch (e) {
    console.error('Redirect result error:', e);
    return null;
  }
}

// ─── Ensure User Document in Firestore ───
export async function ensureUserDoc(user) {
  if (!isConfigured || !db) return;
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
}

// ─── Get User Data ───
export async function getUserData(uid) {
  if (!isConfigured || !db) return null;
  try {
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.error('Get user data error:', e);
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

    // Reset count if new day
    let count = lastDate === today ? (data.quizGeneratedToday || 0) : 0;

    if (data.plan === 'premium') {
      // Premium: unlimited
      await updateDoc(ref, {
        quizGeneratedToday: count + 1,
        lastQuizDate: serverTimestamp(),
        totalQuizzes: increment(1)
      });
      return { allowed: true, plan: 'premium' };
    }

    // Free: 1 per day
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
    console.error('Check quiz count error:', e);
    return { allowed: true };
  }
}

// ─── Upgrade to Premium (placeholder) ───
export async function upgradeToPremium(uid) {
  if (!isConfigured || !db) return;
  const ref = doc(db, 'users', uid);
  await updateDoc(ref, { plan: 'premium' });
}

// ─── Auth State Observer ───
export function onUserChange(callback) {
  if (!isConfigured) {
    callback(null, null);
    return () => {};
  }
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (user) {
      await ensureUserDoc(user);
      const userData = await getUserData(user.uid);
      callback(user, userData);
    } else {
      callback(null, null);
    }
  });
  return unsubscribe;
}

// ─── Firebase Warning ───
function showFirebaseWarning() {
  alert('Firebase가 설정되지 않았습니다.\nfirebase-config.js 파일에 Firebase 프로젝트 정보를 입력해주세요.');
}

export { isConfigured, auth, db };
