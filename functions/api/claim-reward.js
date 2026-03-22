// ============================================================
// GWATOP - 보상 수령 API
// POST { messageId, messageType: 'inbox' | 'global' }
// Auth: Bearer idToken
// ============================================================

const FIREBASE_WEB_API_KEY = 'AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ';
const PROJECT_ID = 'gwatop-8edaf';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const DOC_BASE = `projects/${PROJECT_ID}/databases/(default)/documents`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!idToken) return json({ error: '인증 필요' }, 401);
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return json({ error: '서버 환경 변수 없음' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'parse error' }, 400); }

  const { messageId, messageType } = body;
  if (!messageId || !messageType) return json({ error: '파라미터 누락' }, 400);
  if (!['inbox', 'global'].includes(messageType)) return json({ error: '잘못된 messageType' }, 400);

  const [user, accessToken] = await Promise.all([
    verifyFirebaseToken(idToken),
    getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY),
  ]).catch(() => [null, null]);

  if (!user) return json({ error: '유효하지 않은 토큰' }, 401);
  const uid = user.localId;

  // 1. 메시지 조회
  const msgPath = messageType === 'global'
    ? `${BASE}/global_messages/${messageId}`
    : `${BASE}/users/${uid}/inbox/${messageId}`;

  const msgRes = await fetch(msgPath, { headers: { 'Authorization': `Bearer ${accessToken}` } });
  if (!msgRes.ok) return json({ error: '메시지를 찾을 수 없습니다' }, 404);
  const msgDoc = await msgRes.json();
  const f = msgDoc.fields || {};

  if (f.rewardType?.stringValue !== 'freePoints') return json({ error: '보상이 없는 메시지입니다' }, 400);
  const rewardAmount = parseInt(f.rewardAmount?.integerValue || 0);
  if (!rewardAmount) return json({ error: '보상 금액이 없습니다' }, 400);
  const msgUpdateTime = msgDoc.updateTime; // for precondition on inbox messages

  // 2. 중복 수령 확인
  if (messageType === 'global') {
    const claimedRes = await fetch(`${BASE}/users/${uid}/claimed/${messageId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (claimedRes.ok) return json({ error: '이미 수령한 보상입니다' }, 409);
  } else {
    if (f.claimed?.booleanValue) return json({ error: '이미 수령한 보상입니다' }, 409);
  }

  // 3. 현재 freePoints 조회
  const userRes = await fetch(`${BASE}/users/${uid}`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
  if (!userRes.ok) return json({ error: '유저 정보 없음' }, 404);
  const userDoc = await userRes.json();
  const currentFP = parseInt(userDoc.fields?.freePoints?.integerValue || 0);
  const newFP = currentFP + rewardAmount;

  // 4. batchWrite: freePoints 증가 + claimed 기록
  const writes = [
    {
      update: { name: `${DOC_BASE}/users/${uid}`, fields: { freePoints: { integerValue: String(newFP) } } },
      updateMask: { fieldPaths: ['freePoints'] },
    },
  ];

  if (messageType === 'global') {
    writes.push({
      update: {
        name: `${DOC_BASE}/users/${uid}/claimed/${messageId}`,
        fields: { claimedAt: { timestampValue: new Date().toISOString() } },
      },
      currentDocument: { exists: false }, // precondition: reject if already claimed
    });
  } else {
    writes.push({
      update: { name: `${DOC_BASE}/users/${uid}/inbox/${messageId}`, fields: { claimed: { booleanValue: true } } },
      updateMask: { fieldPaths: ['claimed'] },
      currentDocument: { updateTime: msgUpdateTime }, // precondition: reject if doc changed since read
    });
  }

  const batchRes = await fetch(`${BASE}:batchWrite`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes }),
  });
  if (!batchRes.ok) {
    const status = batchRes.status;
    if (status === 400 || status === 409) return json({ error: '이미 수령한 보상입니다' }, 409);
    return json({ error: '처리 실패' }, 500);
  }

  return json({ success: true, rewardAmount, newFreePoints: newFP });
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
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('토큰 발급 실패');
  return tokenData.access_token;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
