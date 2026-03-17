// ============================================================
// GWATOP - Admin API v1.0.0
// 유저 목록 조회 및 크레딧 수동 조정
// ENV: FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
// ============================================================

const ADMIN_EMAIL = 'hjh2640730@gmail.com';
const PROJECT_ID = 'gwatop-8edaf';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

// JWT payload 디코드 (서명 검증 없음 - 관리자 이메일 확인용)
function decodeJWT(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch { return null; }
}

// ─── GET: 유저 목록 조회 ───
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) return json({ error: '인증 토큰이 없습니다.' }, 401);
  const payload = decodeJWT(token);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return json({ error: '관리자 권한이 없습니다.' }, 403);
  }

  try {
    const accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
    const users = await getUsers(accessToken);
    const stats = {
      totalUsers: users.length,
      totalQuizzes: users.reduce((s, u) => s + u.totalQuizzes, 0),
      totalCredits: users.reduce((s, u) => s + u.credits, 0),
    };
    return json({ users, stats });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ─── POST: 크레딧 수정 ───
export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return json({ error: '파싱 실패' }, 400); }

  const { token, action, uid, credits } = body;
  if (!token) return json({ error: '인증 토큰이 없습니다.' }, 401);
  const payload = decodeJWT(token);
  if (!payload || payload.email !== ADMIN_EMAIL) {
    return json({ error: '관리자 권한이 없습니다.' }, 403);
  }

  if (action === 'updateCredits') {
    if (!uid || credits === undefined) return json({ error: '파라미터 누락' }, 400);
    try {
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
      await updateUserCredits(uid, parseInt(credits), accessToken);
      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  if (action === 'deleteUser') {
    if (!uid) return json({ error: 'uid 누락' }, 400);
    try {
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
      await deleteUserDoc(uid, accessToken);
      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  return json({ error: '알 수 없는 액션' }, 400);
}

// ─── Firestore: 유저 목록 ───
async function getUsers(accessToken) {
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users?pageSize=300`;
  const res = await fetch(baseUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error('유저 목록 조회 실패');
  const data = await res.json();
  if (!data.documents) return [];

  return data.documents.map(doc => {
    const f = doc.fields || {};
    return {
      uid: f.uid?.stringValue || doc.name.split('/').pop(),
      email: f.email?.stringValue || '',
      displayName: f.displayName?.stringValue || '',
      credits: parseInt(f.credits?.integerValue || 0),
      totalQuizzes: parseInt(f.totalQuizzes?.integerValue || 0),
      referralCredits: parseInt(f.referralCredits?.integerValue || 0),
      createdAt: f.createdAt?.timestampValue || null,
    };
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// ─── Firestore: 유저 삭제 ───
async function deleteUserDoc(uid, accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) throw new Error('유저 삭제 실패');
}

// ─── Firestore: 크레딧 업데이트 ───
async function updateUserCredits(uid, credits, accessToken) {
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}?updateMask.fieldPaths=credits`;
  const res = await fetch(baseUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: { credits: { integerValue: String(credits) } }
    }),
  });
  if (!res.ok) throw new Error('크레딧 업데이트 실패');
}

// ─── Firebase JWT ───
async function getFirebaseAccessToken(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail, sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore',
  };
  const encode = (obj) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const signingInput = `${encode(header)}.${encode(payload)}`;

  const pem = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\\n/g, '').replace(/\n/g, '').replace(/\r/g, '').replace(/\s/g, '');
  const keyData = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyData.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput)
  );
  const sigEncoded = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const jwt = `${signingInput}.${sigEncoded}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('Access token 발급 실패');
  return tokenData.access_token;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
