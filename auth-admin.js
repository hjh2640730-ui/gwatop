// ============================================================
// GWATOP - Admin Auth Module (별도 세션)
// 메인 사이트와 독립된 Firebase 앱 인스턴스 사용
// ============================================================

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import firebaseConfig from './firebase-config.js';

// 'gwatop-admin' 이름의 별도 앱 인스턴스 → 메인 세션과 독립된 localStorage 키 사용
const ADMIN_APP_NAME = 'gwatop-admin';
let adminApp, adminAuth;

try {
  const existing = getApps().find(a => a.name === ADMIN_APP_NAME);
  adminApp = existing || initializeApp(firebaseConfig, ADMIN_APP_NAME);
  adminAuth = getAuth(adminApp);
} catch (e) {
  console.warn('Admin Firebase init failed:', e);
}

export async function signInWithGoogleAdmin() {
  if (!adminAuth) return;
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(adminAuth, provider);
  } catch (e) {
    if (e.code === 'auth/popup-closed-by-user') return;
    console.error('Admin sign in error:', e);
    alert('로그인 오류: ' + e.message);
  }
}

export async function logOutAdmin() {
  if (!adminAuth) return;
  try { await signOut(adminAuth); } catch (e) { console.error(e); }
  window.location.reload();
}

export function onAdminUserChange(callback) {
  if (!adminAuth) { callback(null); return () => {}; }
  return onAuthStateChanged(adminAuth, callback);
}

export function getAdminAuth() { return adminAuth; }
