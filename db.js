// ============================================================
// GWATOP - IndexedDB Module v1.0.0
// 문서와 퀴즈 데이터를 브라우저에 로컬 저장
// ============================================================

const DB_NAME = 'gwatop_db';
const DB_VERSION = 1;
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
      if (!db.objectStoreNames.contains(STORE_DOCS)) {
        const docs = db.createObjectStore(STORE_DOCS, { keyPath: 'id', autoIncrement: true });
        docs.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_QUIZZES)) {
        const quizzes = db.createObjectStore(STORE_QUIZZES, { keyPath: 'id', autoIncrement: true });
        quizzes.createIndex('docId', 'docId', { unique: false });
        quizzes.createIndex('createdAt', 'createdAt', { unique: false });
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
export async function saveDocument(name, text, fileSize) {
  return txAdd(STORE_DOCS, {
    name,
    text,
    fileSize,
    createdAt: Date.now()
  });
}

export async function getDocument(id) {
  return txGet(STORE_DOCS, id);
}

export async function getAllDocuments() {
  const docs = await txGetAll(STORE_DOCS);
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
export async function saveQuiz(docId, docName, questions, type, score) {
  return txAdd(STORE_QUIZZES, {
    docId,
    docName,
    questions,
    type,
    score,
    totalQuestions: questions.length,
    createdAt: Date.now()
  });
}

export async function getQuiz(id) {
  return txGet(STORE_QUIZZES, id);
}

export async function getAllQuizzes() {
  const quizzes = await txGetAll(STORE_QUIZZES);
  return quizzes.sort((a, b) => b.createdAt - a.createdAt);
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
  return txPut(STORE_QUIZZES, quiz);
}

export async function deleteQuiz(id) {
  return txDelete(STORE_QUIZZES, id);
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
