// ============================================================
// GWATOP - Attendance API v1.0.0
// 매일 출석 체크, +1 크레딧 지급
// POST {} Authorization: Bearer idToken
// ENV: FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
// ============================================================

const PROJECT_ID = 'gwatop-8edaf';
const FIREBASE_WEB_API_KEY = 'AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const DOC_BASE = `projects/${PROJECT_ID}/databases/(default)/documents`;

let _cachedToken = null, _tokenExpiry = 0;
let _publicKeys = null, _publicKeysExpiry = 0;

async function getFirebasePublicKeys() {
  const now = Date.now();
  if (_publicKeys && _publicKeysExpiry > now) return _publicKeys;
  const res = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  if (!res.ok) throw new Error('공개키 조회 실패');
  const data = await res.json();
  const maxAgeMatch = (res.headers.get('Cache-Control') || '').match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1]) * 1000 : 3600000;
  _publicKeys = data.keys;
  _publicKeysExpiry = now + Math.min(maxAge, 3600000);
  return _publicKeys;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

async function verifyFirebaseToken(idToken) {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const decode = b64 => JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
    ));
    const header = decode(parts[0]);
    const payload = decode(parts[1]);
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;
    if (payload.aud !== PROJECT_ID) return null;
    if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID}`) return null;
    if (!payload.sub) return null;
    const keys = await getFirebasePublicKeys();
    const jwk = keys.find(k => k.kid === header.kid);
    if (!jwk) return null;
    const cryptoKey = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const sig = Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, sig, new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!valid) return null;
    return { localId: payload.sub, email: payload.email, displayName: payload.name };
  } catch { return null; }
}

async function getFirebaseAccessToken(clientEmail, privateKey, kv) {
  const now = Math.floor(Date.now() / 1000);
  if (kv) {
    const cached = await kv.get('firebase_admin_token', 'json');
    if (cached && cached.expiry - now > 300) return cached.token;
  } else if (_cachedToken && _tokenExpiry - now > 300) return _cachedToken;
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = { iss: clientEmail, sub: clientEmail, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600, scope: 'https://www.googleapis.com/auth/datastore' };
  const encode = obj => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const pem = privateKey.replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\\n/g, '').replace(/\n/g, '').replace(/\r/g, '').replace(/\s/g, '');
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
  _cachedToken = tokenData.access_token;
  _tokenExpiry = now + 3600;
  if (kv) {
    await kv.put('firebase_admin_token', JSON.stringify({ token: tokenData.access_token, expiry: now + 3600 }), { expirationTtl: 3500 });
  }
  return _cachedToken;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!idToken) return json({ error: '인증 필요' }, 401);
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return json({ error: '서버 환경 변수 없음' }, 500);

  let user, accessToken;
  try {
    [user, accessToken] = await Promise.all([
      verifyFirebaseToken(idToken),
      getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY, env.GWATOP_CACHE),
    ]);
  } catch { return json({ error: '서버 인증 실패' }, 500); }
  if (!user) return json({ error: '유효하지 않은 토큰' }, 401);

  const uid = user.localId;
  const today = new Intl.DateTimeFormat('sv', { timeZone: 'Asia/Seoul' }).format(new Date()); // KST YYYY-MM-DD

  const userRes = await fetch(`${FIRESTORE_BASE}/users/${uid}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!userRes.ok) return json({ error: '유저 정보 없음' }, 404);
  const userDoc = await userRes.json();

  if (userDoc.fields?.lastAttendance?.stringValue === today) {
    return json({ alreadyChecked: true });
  }

  // precondition: updateTime이 읽은 시점과 동일해야만 쓰기 허용
  // 동시에 두 요청이 오면 하나만 성공하고 나머지는 FAILED_PRECONDITION
  const updateTime = userDoc.updateTime;
  const commitRes = await fetch(`${FIRESTORE_BASE}:commit`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      writes: [
        {
          update: {
            name: `${DOC_BASE}/users/${uid}`,
            fields: { lastAttendance: { stringValue: today } },
          },
          updateMask: { fieldPaths: ['lastAttendance'] },
          currentDocument: { updateTime },
        },
        {
          transform: {
            document: `${DOC_BASE}/users/${uid}`,
            fieldTransforms: [{ fieldPath: 'freePoints', increment: { integerValue: '3' } }],
          },
        },
      ],
    }),
  });

  if (!commitRes.ok) {
    const err = await commitRes.json();
    if (err.error?.status === 'FAILED_PRECONDITION') {
      // 동시 요청 중 다른 쪽이 먼저 처리됨 — 재확인
      const recheck = await fetch(`${FIRESTORE_BASE}/users/${uid}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      const recheckDoc = await recheck.json();
      if (recheckDoc.fields?.lastAttendance?.stringValue === today) return json({ alreadyChecked: true });
    }
    return json({ error: '출석 처리 실패' }, 500);
  }
  return json({ success: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
