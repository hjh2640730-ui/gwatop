// ============================================================
// GWATOP - Like Post API v1.1.0
// 좋아요/크레딧 처리를 서버 사이드로 처리
// - DOM 조작을 통한 beforeCount 우회 방지
// - 자기 글 좋아요 서버에서 이중 검증
// - credits 직접 조작 방지 (서비스 계정만 수정)
// - post_likes 중복 방지 (currentDocument precondition)
// ENV: FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
// ============================================================

const PROJECT_ID = 'gwatop-8edaf';
const FIREBASE_WEB_API_KEY = 'AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
// commit writes의 document name은 URL 아닌 리소스 경로
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

// ─── Firebase ID Token 검증 ───
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

// ─── Service Account → Access Token ───
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
  return tokenData.access_token;
}

// ─── 문서 단건 읽기 ───
async function getDocument(path, accessToken) {
  const res = await fetch(`${FIRESTORE_BASE}/${path}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`문서 읽기 실패 (${res.status}): ${err}`);
  }
  return res.json();
}

// ─── Firestore 커밋 ───
async function commitWrites(writes, accessToken) {
  const res = await fetch(`${FIRESTORE_BASE}:commit`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`커밋 실패 (${res.status}): ${err}`);
  }
  return res.json();
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // ─── 1. 인증 ───
  const authHeader = request.headers.get('Authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken) return json({ error: '인증 토큰 없음' }, 401);

  const user = await verifyFirebaseToken(idToken);
  if (!user) return json({ error: '유효하지 않은 토큰' }, 401);
  const uid = user.localId;

  // ─── 2. 요청 파싱 ───
  let body;
  try { body = await request.json(); }
  catch { return json({ error: '요청 파싱 실패' }, 400); }

  const { postId } = body;
  if (!postId || typeof postId !== 'string' || postId.length > 100) {
    return json({ error: 'postId 형식 오류' }, 400);
  }

  // ─── 3. 서비스 계정 ───
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return json({ error: 'Firebase 서비스 계정 환경 변수가 없습니다.' }, 500);
  }

  let accessToken;
  try {
    accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
  } catch (e) {
    return json({ error: '서버 인증 실패' }, 500);
  }

  try {
    // ─── 4. 문서 읽기 (병렬) ───
    const [postDoc, likeDoc] = await Promise.all([
      getDocument(`community_posts/${postId}`, accessToken),
      getDocument(`post_likes/${postId}_${uid}`, accessToken),
    ]);

    if (!postDoc) return json({ error: '게시물을 찾을 수 없습니다.' }, 404);

    const authorUid = postDoc.fields?.uid?.stringValue;
    if (!authorUid) return json({ error: '게시물 데이터 오류' }, 500);

    // ─── 5. 자기 글 검증 ───
    if (authorUid === uid) return json({ error: '자기 글에는 좋아요를 누를 수 없습니다.' }, 400);

    const currentLikes = parseInt(postDoc.fields?.likes?.integerValue || '0');
    const wasLiked = likeDoc !== null;
    const newLikes = wasLiked ? Math.max(0, currentLikes - 1) : currentLikes + 1;

    // ─── 6. 쓰기 작업 구성 ───
    const writes = [];

    if (wasLiked) {
      // 좋아요 취소
      writes.push({
        delete: `${DOC_BASE}/post_likes/${postId}_${uid}`,
        currentDocument: { exists: true },
      });
      writes.push({
        transform: {
          document: `${DOC_BASE}/community_posts/${postId}`,
          fieldTransforms: [{ fieldPath: 'likes', increment: { integerValue: '-1' } }],
        },
      });
      if (currentLikes <= 5) {
        writes.push({
          transform: {
            document: `${DOC_BASE}/users/${authorUid}`,
            fieldTransforms: [
              { fieldPath: 'credits', increment: { integerValue: '-1' } },
              { fieldPath: 'referralCredits', increment: { integerValue: '-1' } },
            ],
          },
        });
      }
    } else {
      // 좋아요 추가 (이미 존재하면 커밋 실패 → 중복 방지)
      writes.push({
        update: {
          name: `${DOC_BASE}/post_likes/${postId}_${uid}`,
          fields: {
            postId: { stringValue: postId },
            uid: { stringValue: uid },
            createdAt: { timestampValue: new Date().toISOString() },
          },
        },
        currentDocument: { exists: false },
      });
      writes.push({
        transform: {
          document: `${DOC_BASE}/community_posts/${postId}`,
          fieldTransforms: [{ fieldPath: 'likes', increment: { integerValue: '1' } }],
        },
      });
      if (currentLikes < 5) {
        writes.push({
          transform: {
            document: `${DOC_BASE}/users/${authorUid}`,
            fieldTransforms: [
              { fieldPath: 'credits', increment: { integerValue: '1' } },
              { fieldPath: 'referralCredits', increment: { integerValue: '1' } },
            ],
          },
        });
      }
    }

    // ─── 7. 커밋 ───
    await commitWrites(writes, accessToken);

    return json({ liked: !wasLiked, likes: newLikes });

  } catch (e) {
    console.error('like-post error:', e);
    return json({ error: e.message || '처리 중 오류가 발생했습니다.' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
