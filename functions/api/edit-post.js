// ============================================================
// GWATOP - Edit Post API v1.0.0
// 게시글 수정 (제목, 내용, 카테고리)
// POST { postId, title, content, category } Authorization: Bearer idToken
// ENV: FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY
// ============================================================

const PROJECT_ID = 'gwatop-8edaf';
const FIREBASE_WEB_API_KEY = 'AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const DOC_BASE = `projects/${PROJECT_ID}/databases/(default)/documents`;
const ALGOLIA_INDEX = 'posts';
const VALID_CATEGORIES = ['자유', '질문', '정보', '유머', '거래'];

let _cachedToken = null, _tokenExpiry = 0;

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
  if (_cachedToken && _tokenExpiry - now > 300) return _cachedToken;
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = { iss: clientEmail, sub: clientEmail, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600, scope: 'https://www.googleapis.com/auth/datastore' };
  const encode = obj => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const pem = privateKey.replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\\n/g, '').replace(/\r/g, '').replace(/\s/g, '');
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

export async function onRequestPost(context) {
  const { request, env } = context;
  const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!idToken) return json({ error: '인증 필요' }, 401);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: '요청 파싱 실패' }, 400); }

  const { postId, title, content, category } = body;
  if (!postId || !content?.trim()) return json({ error: '필수 파라미터 누락' }, 400);
  if (content.length > 1000) return json({ error: '본문은 1000자 이하로 작성해주세요.' }, 400);
  if (category && !VALID_CATEGORIES.includes(category)) return json({ error: '유효하지 않은 카테고리' }, 400);
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return json({ error: '서버 환경 변수 없음' }, 500);

  let user, accessToken;
  try {
    [user, accessToken] = await Promise.all([
      verifyFirebaseToken(idToken),
      getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY),
    ]);
  } catch { return json({ error: '서버 인증 실패' }, 500); }
  if (!user) return json({ error: '유효하지 않은 토큰' }, 401);

  // 소유자 확인
  const postRes = await fetch(`${FIRESTORE_BASE}/community_posts/${postId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!postRes.ok) return json({ error: '게시글 없음' }, 404);
  const postDoc = await postRes.json();
  if (postDoc.fields?.uid?.stringValue !== user.localId) return json({ error: '수정 권한 없음' }, 403);

  const fields = {
    title: { stringValue: title?.trim() || '' },
    titleLower: { stringValue: (title?.trim() || '').toLowerCase() },
    content: { stringValue: content.trim() },
    editedAt: { timestampValue: new Date().toISOString() },
  };
  if (category) fields.category = { stringValue: category };
  const fieldPaths = ['title', 'titleLower', 'content', 'editedAt', ...(category ? ['category'] : [])];

  const commitRes = await fetch(`${FIRESTORE_BASE}:commit`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      writes: [{
        update: { name: `${DOC_BASE}/community_posts/${postId}`, fields },
        updateMask: { fieldPaths },
      }],
    }),
  });
  if (!commitRes.ok) return json({ error: '수정 실패' }, 500);

  // Algolia 부분 업데이트 (백그라운드)
  if (env.ALGOLIA_APP_ID && env.ALGOLIA_ADMIN_KEY) {
    fetch(`https://${env.ALGOLIA_APP_ID}.algolia.net/1/indexes/${ALGOLIA_INDEX}/${postId}/partial`, {
      method: 'POST',
      headers: {
        'X-Algolia-Application-Id': env.ALGOLIA_APP_ID,
        'X-Algolia-API-Key': env.ALGOLIA_ADMIN_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: title?.trim() || '',
        content: content.trim(),
        ...(category ? { category } : {}),
      }),
    }).catch(() => {});
  }

  return json({ success: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
