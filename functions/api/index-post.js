// ============================================================
// GWATOP - Algolia Post Indexer v1.0.0
// 게시글 생성/삭제 시 Algolia 인덱스 동기화
// ENV: ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY
// ============================================================

const PROJECT_ID = 'gwatop-8edaf';
const FIREBASE_WEB_API_KEY = 'AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const ALGOLIA_INDEX = 'posts';

let _cachedToken = null;
let _tokenExpiry = 0;
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

async function getServiceAccountToken(clientEmail, privateKey, kv) {
  const now = Math.floor(Date.now() / 1000);
  if (kv) {
    const cached = await kv.get('firebase_admin_token', 'json');
    if (cached && cached.expiry - now > 300) return cached.token;
  } else if (_cachedToken && _tokenExpiry - now > 300) return _cachedToken;
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = { iss: clientEmail, sub: clientEmail, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600, scope: 'https://www.googleapis.com/auth/datastore' };
  const encode = (obj) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const pem = privateKey.replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\\n/g, '').replace(/\n/g, '').replace(/\r/g, '').replace(/\s/g, '');
  const keyData = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('pkcs8', keyData.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
  const sigEncoded = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const jwt = `${signingInput}.${sigEncoded}`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}` });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('토큰 발급 실패');
  _cachedToken = tokenData.access_token;
  _tokenExpiry = now + 3600;
  if (kv) {
    await kv.put('firebase_admin_token', JSON.stringify({ token: tokenData.access_token, expiry: now + 3600 }), { expirationTtl: 3500 });
  }
  return _cachedToken;
}

async function deletePostLikes(postId, accessToken) {
  try {
    const res = await fetch(`${FIRESTORE_BASE}:runQuery`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'post_likes' }], where: { fieldFilter: { field: { fieldPath: 'postId' }, op: 'EQUAL', value: { stringValue: postId } } } } }),
    });
    if (!res.ok) return;
    const docs = (await res.json()).filter(r => r.document);
    await Promise.all(docs.map(r => fetch(`https://firestore.googleapis.com/v1/${r.document.name}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${accessToken}` } })));
  } catch { /* 실패해도 무시 */ }
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

export async function onRequestPost(context) {
  const { request, env } = context;

  const authHeader = request.headers.get('Authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken) return json({ error: '인증 필요' }, 401);

  const user = await verifyFirebaseToken(idToken);
  if (!user) return json({ error: '유효하지 않은 토큰' }, 401);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: '요청 파싱 실패' }, 400); }

  const { action, postId, post } = body;
  if (!action || !postId) return json({ error: '필수 파라미터 누락' }, 400);

  const appId = env.ALGOLIA_APP_ID;
  const adminKey = env.ALGOLIA_ADMIN_KEY;
  if (!appId || !adminKey) return json({ error: 'Algolia 환경 변수 없음' }, 500);

  const algoliaBase = `https://${appId}.algolia.net/1/indexes/${ALGOLIA_INDEX}`;
  const headers = {
    'X-Algolia-Application-Id': appId,
    'X-Algolia-API-Key': adminKey,
    'Content-Type': 'application/json',
  };

  if (action === 'remove') {
    if (post?.uid && post.uid !== user.localId) return json({ error: '권한 없음' }, 403);
    // Algolia 삭제 + post_likes 정리 (병렬)
    const algoliaDelete = fetch(`${algoliaBase}/${postId}`, { method: 'DELETE', headers });
    const postLikesCleanup = (env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY)
      ? getServiceAccountToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY, env.GWATOP_CACHE)
          .then(token => deletePostLikes(postId, token))
          .catch(() => {})
      : Promise.resolve();
    const [algoliaRes] = await Promise.all([algoliaDelete, postLikesCleanup]);
    if (!algoliaRes.ok && algoliaRes.status !== 404) {
      return json({ error: `Algolia 삭제 실패: ${algoliaRes.status}` }, 500);
    }
    return json({ success: true });
  }

  if (action === 'add') {
    if (!post) return json({ error: 'post 데이터 필요' }, 400);
    if (post.uid !== user.localId) return json({ error: '권한 없음' }, 403);

    const record = {
      objectID: postId,
      title: post.title || '',
      content: post.content || '',
      nickname: post.isAnonymous ? '' : (post.nickname || ''),
      university: post.university || '',
      uid: post.uid,
      isAnonymous: post.isAnonymous || false,
      createdAt: typeof post.createdAt === 'number' ? post.createdAt : Date.now(),
      likes: post.likes || 0,
      commentCount: post.commentCount || 0,
      imageUrl: post.imageUrl || '',
      imageUrls: Array.isArray(post.imageUrls) ? post.imageUrls : [],
      category: post.category || '',
    };

    const res = await fetch(`${algoliaBase}/${postId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(record),
    });
    if (!res.ok) {
      return json({ error: `Algolia 인덱싱 실패: ${res.status}` }, 500);
    }
    return json({ success: true });
  }

  return json({ error: '알 수 없는 action' }, 400);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
