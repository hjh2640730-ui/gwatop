// ============================================================
// GWATOP - 관리자 메시지 발송 API
// POST { token, target: 'all' | uid, title, body, rewardType, rewardAmount }
// ============================================================

const ADMIN_EMAIL = 'hjh2640730@gmail.com';
const FIREBASE_WEB_API_KEY = 'AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ';
const PROJECT_ID = 'gwatop-8edaf';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'parse error' }, 400); }

  const { token, target, title, body: msgBody, rewardType, rewardAmount } = body;
  if (!token) return json({ error: '인증 필요' }, 401);

  const user = await verifyFirebaseToken(token);
  if (!user || user.email !== ADMIN_EMAIL) return json({ error: '관리자 권한 필요' }, 403);

  if (!title?.trim() || !msgBody?.trim()) return json({ error: '제목과 내용 필요' }, 400);
  if (!target) return json({ error: 'target 필요' }, 400);

  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return json({ error: '서버 환경 변수 없음' }, 500);
  const accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);

  const reward = rewardType === 'freePoints' ? Math.max(0, parseInt(rewardAmount) || 0) : 0;

  const fields = {
    title: { stringValue: title.trim().slice(0, 100) },
    body: { stringValue: msgBody.trim().slice(0, 2000) },
    rewardType: { stringValue: reward > 0 ? 'freePoints' : 'none' },
    rewardAmount: { integerValue: String(reward) },
    createdAt: { timestampValue: new Date().toISOString() },
  };

  if (target === 'all') {
    // 전체 발송: global_messages 컬렉션에 저장
    const res = await fetch(`${BASE}/global_messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) return json({ error: '전송 실패' }, 500);
    return json({ success: true, type: 'global' });
  } else {
    // 개인 발송: users/{uid}/inbox 서브컬렉션에 저장
    const inboxFields = { ...fields, claimed: { booleanValue: false }, read: { booleanValue: false } };
    const res = await fetch(`${BASE}/users/${target}/inbox`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: inboxFields }),
    });
    if (!res.ok) return json({ error: '전송 실패' }, 500);
    return json({ success: true, type: 'inbox' });
  }
}

async function verifyFirebaseToken(idToken) {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) }
    );
    if (!res.ok) return null;
    return (await res.json()).users?.[0] || null;
  } catch { return null; }
}

async function getFirebaseAccessToken(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = { iss: clientEmail, sub: clientEmail, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600, scope: 'https://www.googleapis.com/auth/datastore' };
  const encode = obj => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const pem = privateKey.replace(/-----BEGIN PRIVATE KEY-----/g,'').replace(/-----END PRIVATE KEY-----/g,'').replace(/\\n/g,'').replace(/\n/g,'').replace(/\r/g,'').replace(/\s/g,'');
  const keyData = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('pkcs8', keyData.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
  const sigEncoded = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const jwt = `${signingInput}.${sigEncoded}`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('토큰 발급 실패');
  return tokenData.access_token;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
