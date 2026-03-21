// ============================================================
// GWATOP - 결제 내역 조회 API
// GET ?token=...  → 본인 결제 내역
// GET ?token=...&uid=...  → 관리자: 특정 유저 결제 내역
// GET ?token=...&all=1    → 관리자: 전체 결제 내역
// ENV: FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
// ============================================================

const ADMIN_EMAIL = 'hjh2640730@gmail.com';
const FIREBASE_WEB_API_KEY = 'AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ';
const PROJECT_ID = 'gwatop-8edaf';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const queryUid = url.searchParams.get('uid');
  const all = url.searchParams.get('all') === '1';

  if (!token) return json({ error: '인증 필요' }, 401);

  const [user, accessToken] = await Promise.all([
    verifyFirebaseToken(token),
    getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY),
  ]).catch(() => [null, null]);

  if (!user) return json({ error: '유효하지 않은 토큰' }, 401);

  const isAdmin = user.email === ADMIN_EMAIL;

  // 관리자 전용 요청
  if ((queryUid || all) && !isAdmin) {
    return json({ error: '관리자 권한 필요' }, 403);
  }

  const targetUid = isAdmin && queryUid ? queryUid : (all && isAdmin ? null : user.localId);

  const payments = await getPayments(targetUid, accessToken);
  return json({ payments });
}

async function getPayments(uid, accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;

  const structuredQuery = {
    from: [{ collectionId: 'payments' }],
    orderBy: [{ field: { fieldPath: 'processedAt' }, direction: 'DESCENDING' }],
    limit: 100,
  };

  if (uid) {
    structuredQuery.where = {
      fieldFilter: {
        field: { fieldPath: 'uid' },
        op: 'EQUAL',
        value: { stringValue: uid },
      },
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
  });

  if (!res.ok) return [];
  const data = await res.json();

  return data
    .filter(r => r.document)
    .map(r => {
      const f = r.document.fields || {};
      return {
        orderId: f.orderId?.stringValue || r.document.name.split('/').pop(),
        uid: f.uid?.stringValue || '',
        credits: parseInt(f.credits?.integerValue || 0),
        amount: parseInt(f.amount?.integerValue || 0),
        processedAt: parseInt(f.processedAt?.integerValue || 0),
      };
    });
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
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
  const sigEncoded = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
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
