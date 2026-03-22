// ============================================================
// GWATOP - Cleanup Games API
// 15분 이상 지난 waiting 상태 게임을 cancelled로 변경
// GET /api/cleanup-games?secret=CLEANUP_SECRET
// ENV: FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, CLEANUP_SECRET
// ============================================================

const PROJECT_ID = 'gwatop-8edaf';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const DOC_BASE = `projects/${PROJECT_ID}/databases/(default)/documents`;

let _cachedToken = null, _tokenExpiry = 0;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

async function getFirebaseAccessToken(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  if (_cachedToken && _tokenExpiry - now > 300) return _cachedToken;
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
  return _cachedToken;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // secret 또는 공개 호출 허용 (KV 기반 5분 rate limit)
  const secret = url.searchParams.get('secret');
  const isAdmin = env.CLEANUP_SECRET && secret === env.CLEANUP_SECRET;
  if (!isAdmin) {
    const RATE_KEY = 'cleanup_last_run';
    const RATE_LIMIT = 5 * 60 * 1000;
    try {
      const last = await env.GWATOP_CACHE?.get(RATE_KEY);
      if (last && Date.now() - parseInt(last) < RATE_LIMIT) {
        return new Response(JSON.stringify({ skipped: true }), { status: 200, headers: CORS });
      }
      await env.GWATOP_CACHE?.put(RATE_KEY, String(Date.now()), { expirationTtl: 300 });
    } catch { /* KV 미설정 시 무시 */ }
  }

  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return new Response(JSON.stringify({ error: '서버 환경 변수 없음' }), { status: 500, headers: CORS });
  }

  let accessToken;
  try {
    accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
  } catch {
    return new Response(JSON.stringify({ error: '서버 인증 실패' }), { status: 500, headers: CORS });
  }

  // 15분 전 timestamp (ISO 8601)
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  // waiting / ready / hands_shown 상태 게임 중 createdAt이 cutoff 이전인 것 조회
  const staleStatuses = ['waiting', 'ready', 'hands_shown'];
  let allExpired = [];

  for (const status of staleStatuses) {
    const queryRes = await fetch(`${FIRESTORE_BASE}:runQuery`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'games' }],
          where: {
            compositeFilter: {
              op: 'AND',
              filters: [
                { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: status } } },
                { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'LESS_THAN', value: { stringValue: cutoff } } },
              ],
            },
          },
          limit: 100,
        },
      }),
    });
    if (queryRes.ok) {
      const docs = await queryRes.json();
      allExpired = allExpired.concat(docs.filter(d => d.document?.name));
    }
  }

  if (allExpired.length === 0) {
    return new Response(JSON.stringify({ cleaned: 0 }), { status: 200, headers: CORS });
  }

  // 각 게임을 cancelled로 업데이트하고 배팅액 환급
  let cleaned = 0;
  const refundWrites = [];

  for (const d of allExpired) {
    const doc = d.document;
    const docName = doc.name;
    const wager = parseInt(doc.fields?.wager?.integerValue || '0');
    const status = doc.fields?.status?.stringValue;
    const player1Uid = doc.fields?.player1?.mapValue?.fields?.uid?.stringValue;
    const player2Uid = doc.fields?.player2?.mapValue?.fields?.uid?.stringValue;

    refundWrites.push({
      update: {
        name: docName,
        fields: { status: { stringValue: 'cancelled' } },
      },
      updateMask: { fieldPaths: ['status'] },
    });

    // waiting: 방장만 환급 / ready·hands_shown: 양쪽 환급
    if (player1Uid && wager > 0) {
      refundWrites.push({
        transform: {
          document: `${DOC_BASE}/users/${player1Uid}`,
          fieldTransforms: [{ fieldPath: 'freePoints', increment: { integerValue: String(wager) } }],
        },
      });
    }
    if ((status === 'ready' || status === 'hands_shown') && player2Uid && wager > 0) {
      refundWrites.push({
        transform: {
          document: `${DOC_BASE}/users/${player2Uid}`,
          fieldTransforms: [{ fieldPath: 'freePoints', increment: { integerValue: String(wager) } }],
        },
      });
    }

    cleaned++;
  }

  // 최대 20개씩 배치 커밋 (Firestore 제한)
  const BATCH = 20;
  for (let i = 0; i < refundWrites.length; i += BATCH) {
    const batch = refundWrites.slice(i, i + BATCH);
    await fetch(`${FIRESTORE_BASE}:commit`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes: batch }),
    });
  }

  return new Response(JSON.stringify({ cleaned }), { status: 200, headers: CORS });
}
