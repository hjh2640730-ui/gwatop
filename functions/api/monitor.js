// ============================================================
// GWATOP - Monitor API v1.0.0
// 실시간 시스템 현황 조회 (관리자 전용)
// GET /api/monitor?token=idToken
// ============================================================

const PROJECT_ID = 'gwatop-8edaf';
const FIREBASE_WEB_API_KEY = 'AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const ADMIN_EMAIL = 'hjh2640730@gmail.com';

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
    return { localId: payload.sub, email: payload.email };
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
  if (kv) await kv.put('firebase_admin_token', JSON.stringify({ token: tokenData.access_token, expiry: now + 3600 }), { expirationTtl: 3500 });
  return _cachedToken;
}

async function queryCount(accessToken, filters) {
  const query = { from: [{ collectionId: filters.collection }], limit: filters.limit || 500 };
  if (filters.where) query.where = filters.where;
  const res = await fetch(`${FIRESTORE_BASE}:runQuery`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: query }),
  });
  if (!res.ok) return 0;
  const docs = await res.json();
  return docs.filter(d => d.document).length;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const idToken = url.searchParams.get('token') || (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!idToken) return json({ error: '인증 필요' }, 401);

  const user = await verifyFirebaseToken(idToken);
  if (!user || user.email !== ADMIN_EMAIL) return json({ error: '권한 없음' }, 403);

  let accessToken;
  try {
    accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY, env.GWATOP_CACHE);
  } catch { return json({ error: '서버 인증 실패' }, 500); }

  const todayKST = new Intl.DateTimeFormat('sv', { timeZone: 'Asia/Seoul' }).format(new Date());
  const todayStart = `${todayKST}T00:00:00+09:00`;

  const todayStartISO = new Date(todayStart).toISOString();

  // 병렬로 모든 통계 조회
  const [activeGames, waitingRooms, todayGames, todayUsers, totalPosts, todayQuizzes] = await Promise.all([
    // 진행 중 게임
    queryCount(accessToken, {
      collection: 'games',
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            { fieldFilter: { field: { fieldPath: 'status' }, op: 'NOT_EQUAL', value: { stringValue: 'waiting' } } },
            { fieldFilter: { field: { fieldPath: 'status' }, op: 'NOT_EQUAL', value: { stringValue: 'finished' } } },
            { fieldFilter: { field: { fieldPath: 'status' }, op: 'NOT_EQUAL', value: { stringValue: 'cancelled' } } },
          ],
        },
      },
      limit: 500,
    }),
    // 대기 중 방
    queryCount(accessToken, {
      collection: 'games',
      where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'waiting' } } },
      limit: 200,
    }),
    // 오늘 생성된 게임
    queryCount(accessToken, {
      collection: 'games',
      where: { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: todayStart } } },
      limit: 500,
    }),
    // 오늘 가입 유저
    queryCount(accessToken, {
      collection: 'users',
      where: { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: todayStartISO } } },
      limit: 500,
    }),
    // 전체 게시글 수 (Algolia 레코드 한도)
    queryCount(accessToken, { collection: 'community_posts', where: null, limit: 500 }),
    // 오늘 퀴즈 생성 수 (Gemini 사용량 지표)
    queryCount(accessToken, {
      collection: 'quizzes',
      where: { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: todayStartISO } } },
      limit: 500,
    }),
  ]);

  // 예상치 계산
  const estimatedLobbyUsers = Math.max(waitingRooms * 2, activeGames);
  const estimatedDailyReads = estimatedLobbyUsers * 144;           // 폴링 기반 읽기
  const estimatedDailyWrites = todayGames * 8;                     // 게임당 평균 8회 쓰기
  const estimatedDailyKvReads = estimatedLobbyUsers * 144;         // API 요청당 KV 1회 읽기

  const warnings = [];

  if (activeGames > 300) {
    warnings.push({ level: 'critical', message: `동시 게임 ${activeGames}판`, action: 'Firestore 구조 재설계 필요. 개발자에게 문의하세요.' });
  } else if (activeGames > 100) {
    warnings.push({ level: 'warning', message: `동시 게임 ${activeGames}판`, action: '모니터링을 유지하세요. 300판 초과 시 재설계가 필요합니다.' });
  }

  if (waitingRooms > 30) {
    warnings.push({ level: 'warning', message: `대기방 ${waitingRooms}개 누적`, action: 'cron-job.org에서 cleanup 실행 주기를 5분으로 단축하세요.' });
  }

  if (estimatedDailyReads > 40000) {
    warnings.push({ level: 'critical', message: `Firestore 읽기 ~${estimatedDailyReads.toLocaleString()}회 (한도 80% 초과)`, action: 'Firebase 콘솔에서 Blaze 플랜 확인. 또는 폴링 간격을 30초로 늘리세요.' });
  } else if (estimatedDailyReads > 30000) {
    warnings.push({ level: 'warning', message: `Firestore 읽기 ~${estimatedDailyReads.toLocaleString()}회 (한도 60% 초과)`, action: 'Firebase 콘솔 → 사용량 탭에서 실제 읽기 수를 확인하세요.' });
  }

  if (estimatedDailyWrites > 16000) {
    warnings.push({ level: 'critical', message: `Firestore 쓰기 ~${estimatedDailyWrites.toLocaleString()}회 (한도 80% 초과)`, action: 'Firebase 콘솔에서 Blaze 플랜 확인. 초과분은 자동 과금됩니다.' });
  } else if (estimatedDailyWrites > 12000) {
    warnings.push({ level: 'warning', message: `Firestore 쓰기 ~${estimatedDailyWrites.toLocaleString()}회 (한도 60% 초과)`, action: 'Firebase 콘솔 → 사용량 탭에서 실제 쓰기 수를 확인하세요.' });
  }

  if (totalPosts > 9000) {
    warnings.push({ level: 'critical', message: `게시글 ${totalPosts}개 (Algolia 한도 90% 초과)`, action: '즉시 Algolia → Firestore 검색으로 교체가 필요합니다. 개발자에게 문의하세요.' });
  } else if (totalPosts > 7000) {
    warnings.push({ level: 'warning', message: `게시글 ${totalPosts}개 (Algolia 한도 70% 초과)`, action: 'Algolia 대시보드에서 레코드 수를 확인하고 교체 시점을 준비하세요.' });
  }

  if (todayQuizzes > 300) {
    warnings.push({ level: 'warning', message: `오늘 퀴즈 생성 ${todayQuizzes}개 (Gemini 사용량 높음)`, action: 'Google AI Studio에서 할당량 현황을 확인하세요.' });
  }

  if (estimatedDailyKvReads > 80000) {
    warnings.push({ level: 'critical', message: `KV 읽기 ~${estimatedDailyKvReads.toLocaleString()}회 (한도 80% 초과)`, action: 'Cloudflare 대시보드에서 Workers Paid 플랜($5/월)으로 업그레이드하세요.' });
  } else if (estimatedDailyKvReads > 60000) {
    warnings.push({ level: 'warning', message: `KV 읽기 ~${estimatedDailyKvReads.toLocaleString()}회 (한도 60% 초과)`, action: 'Cloudflare 대시보드에서 Workers Paid 플랜 업그레이드를 준비하세요.' });
  }

  return json({
    timestamp: new Date().toISOString(),
    activeGames,
    waitingRooms,
    todayGames,
    todayUsers,
    totalPosts,
    todayQuizzes,
    estimatedDailyReads,
    estimatedDailyWrites,
    estimatedDailyKvReads,
    warnings,
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
