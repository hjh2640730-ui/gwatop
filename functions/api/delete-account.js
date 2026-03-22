// ============================================================
// GWATOP - Delete Account API v1.0.0
// 회원 탈퇴: 유저 데이터 + 게시글 + 댓글 전체 삭제
// ENV: FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
// ============================================================

const PROJECT_ID = 'gwatop-8edaf';
const FIREBASE_WEB_API_KEY = 'AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const DOC_BASE = `projects/${PROJECT_ID}/databases/(default)/documents`;

let _cachedToken = null;
let _tokenExpiry = 0;

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
    const data = await res.json();
    return data.users?.[0] || null;
  } catch { return null; }
}

async function getFirebaseAccessToken(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  if (_cachedToken && _tokenExpiry - now > 300) return _cachedToken;

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail, sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase',
  };
  const encode = (obj) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const pem = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '')
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
  _cachedToken = tokenData.access_token;
  _tokenExpiry = now + 3600;
  return _cachedToken;
}

// Firestore 컬렉션 쿼리 (uid 필터)
async function queryDocs(collectionPath, uid, accessToken, { allDescendants = false } = {}) {
  const url = `${FIRESTORE_BASE}:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: collectionPath, allDescendants }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'uid' },
          op: 'EQUAL',
          value: { stringValue: uid },
        },
      },
      limit: 100,
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`쿼리 실패 (${res.status})`);
  const data = await res.json();
  return data.filter(r => r.document).map(r => r.document);
}

// 서브컬렉션(comments) 조회
async function getSubDocs(parentPath, subCollection, accessToken) {
  const url = `${FIRESTORE_BASE}/${parentPath}/${subCollection}?pageSize=300`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
  if (!res.ok) return [];
  const data = await res.json();
  return data.documents || [];
}

// 문서 삭제
async function deleteDocument(name, accessToken) {
  await fetch(`https://firestore.googleapis.com/v1/${name}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
}

// Firebase Storage 파일 삭제
const STORAGE_BUCKET = 'gwatop-8edaf.firebasestorage.app';
async function deleteStorageFile(imageUrl, accessToken) {
  try {
    const match = imageUrl.match(/\/o\/([^?]+)/);
    if (!match) return;
    const encodedPath = match[1]; // already URL-encoded
    await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodedPath}`,
      { method: 'DELETE', headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
  } catch { /* 이미 없으면 무시 */ }
}

// Firebase Auth 유저 삭제 (Admin)
async function deleteAuthUser(uid, accessToken) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts/${uid}`,
    { method: 'DELETE', headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  return res.ok;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const authHeader = request.headers.get('Authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken) return json({ error: '인증 필요' }, 401);

  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return json({ error: 'Firebase 서비스 계정 환경 변수 없음' }, 500);
  }

  let user, accessToken;
  try {
    [user, accessToken] = await Promise.all([
      verifyFirebaseToken(idToken),
      getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY),
    ]);
  } catch {
    return json({ error: '서버 인증 실패' }, 500);
  }
  if (!user) return json({ error: '유효하지 않은 토큰' }, 401);

  const uid = user.localId;

  try {
    // 1. 내 게시글 조회
    const myPosts = await queryDocs('community_posts', uid, accessToken);

    // 2. 각 게시글의 댓글 + 이미지 삭제 + 게시글 삭제
    for (const post of myPosts) {
      const postPath = post.name.split('/documents/')[1];
      const comments = await getSubDocs(postPath, 'comments', accessToken);
      for (const comment of comments) {
        await deleteDocument(comment.name, accessToken);
      }
      // 첨부 이미지 삭제
      const imageUrl = post.fields?.imageUrl?.stringValue;
      if (imageUrl) await deleteStorageFile(imageUrl, accessToken);
      await deleteDocument(post.name, accessToken);
    }

    // 3. 다른 게시글에 내가 쓴 댓글 삭제 (uid 기준 collectionGroup 쿼리)
    const myComments = await queryDocs('comments', uid, accessToken, { allDescendants: true });
    for (const comment of myComments) {
      await deleteDocument(comment.name, accessToken);
    }

    // 4. post_likes 삭제 (postId_uid 형식이라 직접 쿼리)
    const myLikes = await queryDocs('post_likes', uid, accessToken);
    for (const like of myLikes) {
      await deleteDocument(like.name, accessToken);
    }

    // 5. users 문서 삭제
    await deleteDocument(
      `projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`,
      accessToken
    );

    // 6. Firebase Auth 계정 삭제
    await deleteAuthUser(uid, accessToken);

    return json({ success: true });
  } catch (e) {
    console.error('delete-account error:', e);
    return json({ error: e.message || '탈퇴 처리 실패' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
