// ============================================================
// GWATOP - IndexedDB Module v2.0.0
// 브라우저 로컬 저장 + Firestore 메타데이터 백업
// ============================================================

import { db as firestoreDb } from './auth.js';
import {
  collection, doc, setDoc, getDocs, deleteDoc, updateDoc, query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const DB_NAME = 'gwatop_db';
const DB_VERSION = 2;
const STORE_DOCS = 'documents';
const STORE_QUIZZES = 'quizzes';

let _db = null;

// ─── Open DB ───
function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const tx = e.target.transaction;
      const oldVersion = e.oldVersion;

      if (oldVersion < 1) {
        const docs = db.createObjectStore(STORE_DOCS, { keyPath: 'id', autoIncrement: true });
        docs.createIndex('createdAt', 'createdAt', { unique: false });
        const quizzes = db.createObjectStore(STORE_QUIZZES, { keyPath: 'id', autoIncrement: true });
        quizzes.createIndex('docId', 'docId', { unique: false });
        quizzes.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (oldVersion < 2) {
        // uid 인덱스 추가 (유저별 데이터 분리)
        const docs = tx.objectStore(STORE_DOCS);
        if (!docs.indexNames.contains('uid')) docs.createIndex('uid', 'uid', { unique: false });
        const quizzes = tx.objectStore(STORE_QUIZZES);
        if (!quizzes.indexNames.contains('uid')) quizzes.createIndex('uid', 'uid', { unique: false });
      }
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

// ─── Generic Helpers ───
async function txGet(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function txGetAll(store, indexName, query) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const s = tx.objectStore(store);
    const req = indexName ? s.index(indexName).getAll(query) : s.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function txPut(store, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(data);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function txAdd(store, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).add(data);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function txDelete(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ─── Documents ───
export async function saveDocument(uid, name, text, fileSize) {
  return txAdd(STORE_DOCS, {
    uid,
    name,
    text,
    fileSize,
    createdAt: Date.now()
  });
}

export async function getDocument(id) {
  return txGet(STORE_DOCS, id);
}

export async function getAllDocuments(uid) {
  if (!uid) return [];
  const docs = await txGetAll(STORE_DOCS, 'uid', uid);
  return docs.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteDocument(id) {
  // Also delete all quizzes for this document
  const quizzes = await getQuizzesForDoc(id);
  for (const q of quizzes) {
    await txDelete(STORE_QUIZZES, q.id);
  }
  return txDelete(STORE_DOCS, id);
}

// ─── Quizzes ───
export async function saveQuiz(uid, docId, docName, questions, type, score) {
  const localId = await txAdd(STORE_QUIZZES, {
    uid, docId, docName, questions, type, score,
    totalQuestions: questions.length, createdAt: Date.now()
  });
  // Firestore 백업: 메타데이터 + 문제 데이터 별도 저장
  if (firestoreDb && uid) {
    try {
      await setDoc(doc(firestoreDb, 'users', uid, 'quiz_history', String(localId)), {
        docName, type, score: score ?? null,
        totalQuestions: questions.length, createdAt: Date.now(), localId
      });
      // 문제 데이터 저장 (다른 기기에서 다시 풀기 지원)
      await setDoc(doc(firestoreDb, 'users', uid, 'quiz_questions', String(localId)), {
        questions, docName, type, createdAt: Date.now()
      });
    } catch { /* 백업 실패 시 무시 - IndexedDB가 primary */ }
  }
  return localId;
}

export async function getQuiz(id) {
  return txGet(STORE_QUIZZES, id);
}

// Firestore에서 문제 데이터 조회 (_firestoreOnly 퀴즈 다시 풀기용)
export async function getQuizQuestionsFromFirestore(uid, localId) {
  if (!firestoreDb || !uid || !localId) return null;
  try {
    const { getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const snap = await getDoc(doc(firestoreDb, 'users', uid, 'quiz_questions', String(localId)));
    if (!snap.exists()) return null;
    return snap.data();
  } catch { return null; }
}

export async function getAllQuizzes(uid) {
  if (!uid) return [];
  const quizzes = await txGetAll(STORE_QUIZZES, 'uid', uid);
  if (quizzes.length > 0) return quizzes.sort((a, b) => b.createdAt - a.createdAt);

  // IndexedDB 비어있으면 Firestore 백업에서 복원 (메타데이터만)
  if (firestoreDb) {
    try {
      const q = query(collection(firestoreDb, 'users', uid, 'quiz_history'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map(d => ({ ...d.data(), id: d.data().localId, _firestoreOnly: true }));
      }
    } catch { /* 무시 */ }
  }
  return [];
}

export async function getQuizzesForDoc(docId) {
  const quizzes = await txGetAll(STORE_QUIZZES, 'docId', docId);
  return quizzes.sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateQuizScore(id, score, wrongAnswers) {
  const quiz = await txGet(STORE_QUIZZES, id);
  if (!quiz) return;
  quiz.score = score;
  quiz.wrongAnswers = wrongAnswers;
  quiz.completedAt = Date.now();
  await txPut(STORE_QUIZZES, quiz);
  // Firestore 동기화
  if (firestoreDb && quiz.uid) {
    try {
      await updateDoc(doc(firestoreDb, 'users', quiz.uid, 'quiz_history', String(id)), {
        score, completedAt: Date.now()
      });
    } catch { /* 무시 */ }
  }
}

export async function deleteQuiz(id) {
  const quiz = await txGet(STORE_QUIZZES, id);
  await txDelete(STORE_QUIZZES, id);
  // Firestore 동기화
  if (firestoreDb && quiz?.uid) {
    try {
      await deleteDoc(doc(firestoreDb, 'users', quiz.uid, 'quiz_history', String(id)));
      await deleteDoc(doc(firestoreDb, 'users', quiz.uid, 'quiz_questions', String(id)));
    } catch { /* 무시 */ }
  }
}

// ─── Pending Quiz (sessionStorage bridge) ───
export function savePendingQuiz(data) {
  sessionStorage.setItem('gwatop_pending_quiz', JSON.stringify(data));
}

export function loadPendingQuiz() {
  const raw = sessionStorage.getItem('gwatop_pending_quiz');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function clearPendingQuiz() {
  sessionStorage.removeItem('gwatop_pending_quiz');
}

// ─── Guest Quota (localStorage) ───
export function getGuestQuizCount() {
  const today = new Date().toDateString();
  const stored = JSON.parse(localStorage.getItem('gwatop_guest') || '{}');
  if (stored.date !== today) return 0;
  return stored.count || 0;
}

export function incrementGuestQuizCount() {
  const today = new Date().toDateString();
  const stored = JSON.parse(localStorage.getItem('gwatop_guest') || '{}');
  const count = stored.date === today ? (stored.count || 0) + 1 : 1;
  localStorage.setItem('gwatop_guest', JSON.stringify({ date: today, count }));
}
