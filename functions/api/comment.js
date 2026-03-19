// ============================================================
// GWATOP - Comment API v1.0.0
// 댓글 작성/삭제 서버 사이드 처리
// - commentCount 클라이언트 직접 조작 방지
// - anonymousMap/anonymousCounter 서버에서만 수정
// ENV: FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
// ============================================================

const PROJECT_ID = 'gwatop-8edaf';
const FIREBASE_WEB_API_KEY = 'AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const DOC_BASE = `projects/${PROJECT_ID}/databases/(default)/documents`;
const MAX_COMMENTS = 300;

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
  if (!tokenData.access_token) throw new Error('Access token 발급 실패');
  _cachedToken = tokenData.access_token;
  _tokenExpiry = now + 3600;
  return _cachedToken;
}

async function getDocument(path, accessToken) {
  const res = await fetch(`${FIRESTORE_BASE}/${path}`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`문서 읽기 실패 (${res.status})`);
  return res.json();
}

async function commitWrites(writes, accessToken) {
  const res = await fetch(`${FIRESTORE_BASE}:commit`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes }),
  });
  if (!res.ok) throw new Error(`커밋 실패 (${res.status}): ${await res.text()}`);
  return res.json();
}

// ─── 댓글 작성 ───
async function addComment({ postId, uid, content, isAnonymous, parentId, nickname, university, accessToken }) {
  const postDoc = await getDocument(`community_posts/${postId}`, accessToken);
  if (!postDoc) throw new Error('게시글을 찾을 수 없습니다.');

  const commentCount = parseInt(postDoc.fields?.commentCount?.integerValue || '0');
  if (commentCount >= MAX_COMMENTS) throw new Error(`댓글은 최대 ${MAX_COMMENTS}개까지 작성 가능합니다.`);

  const postAuthorUid = postDoc.fields?.uid?.stringValue;
  const effectiveAnonymous = (uid === postAuthorUid) ? false : isAnonymous;

  // 익명 번호 계산
  let anonNumber = null;
  const writes = [];

  if (effectiveAnonymous) {
    const anonMap = {};
    const existingMap = postDoc.fields?.anonymousMap?.mapValue?.fields || {};
    for (const [k, v] of Object.entries(existingMap)) anonMap[k] = parseInt(v.integerValue || v.stringValue || 0);

    if (anonMap[uid] !== undefined) {
      anonNumber = anonMap[uid];
    } else {
      const counter = parseInt(postDoc.fields?.anonymousCounter?.integerValue || '0');
      anonNumber = counter + 1;
      anonMap[uid] = anonNumber;
      // anonymousMap + anonymousCounter 업데이트
      writes.push({
        update: {
          name: `${DOC_BASE}/community_posts/${postId}`,
          fields: {
            anonymousMap: { mapValue: { fields: Object.fromEntries(Object.entries(anonMap).map(([k, v]) => [k, { integerValue: String(v) }])) } },
            anonymousCounter: { integerValue: String(anonNumber) },
          },
        },
        updateMask: { fieldPaths: ['anonymousMap', 'anonymousCounter'] },
      });
    }
  }

  // 댓글 문서 생성 + commentCount 증가
  const commentId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  writes.push({
    update: {
      name: `${DOC_BASE}/community_posts/${postId}/comments/${commentId}`,
      fields: {
        uid: { stringValue: uid },
        isAnonymous: { booleanValue: effectiveAnonymous },
        anonNumber: anonNumber !== null ? { integerValue: String(anonNumber) } : { nullValue: null },
        nickname: { stringValue: nickname },
        university: { stringValue: university },
        content: { stringValue: content },
        parentId: parentId ? { stringValue: parentId } : { nullValue: null },
        deleted: { booleanValue: false },
        likes: { integerValue: '0' },
        likedBy: { arrayValue: { values: [] } },
        createdAt: { timestampValue: new Date().toISOString() },
      },
    },
    currentDocument: { exists: false },
  });
  writes.push({
    transform: {
      document: `${DOC_BASE}/community_posts/${postId}`,
      fieldTransforms: [{ fieldPath: 'commentCount', increment: { integerValue: '1' } }],
    },
  });

  await commitWrites(writes, accessToken);
  return { commentId, anonNumber };
}

// ─── 댓글 삭제 (soft) ───
async function deleteComment({ postId, commentId, uid, accessToken }) {
  const commentDoc = await getDocument(`community_posts/${postId}/comments/${commentId}`, accessToken);
  if (!commentDoc) throw new Error('댓글을 찾을 수 없습니다.');

  const commentUid = commentDoc.fields?.uid?.stringValue;
  if (commentUid !== uid) throw new Error('권한 없음');

  if (commentDoc.fields?.deleted?.booleanValue) throw new Error('이미 삭제된 댓글입니다.');

  await commitWrites([
    {
      update: {
        name: `${DOC_BASE}/community_posts/${postId}/comments/${commentId}`,
        fields: {
          deleted: { booleanValue: true },
          content: { stringValue: '' },
          likes: { integerValue: '0' },
          likedBy: { arrayValue: { values: [] } },
        },
      },
      updateMask: { fieldPaths: ['deleted', 'content', 'likes', 'likedBy'] },
    },
    {
      transform: {
        document: `${DOC_BASE}/community_posts/${postId}`,
        fieldTransforms: [{ fieldPath: 'commentCount', increment: { integerValue: '-1' } }],
      },
    },
  ], accessToken);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const authHeader = request.headers.get('Authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken) return json({ error: '인증 필요' }, 401);

  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return json({ error: 'Firebase 서비스 계정 환경 변수 없음' }, 500);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ error: '요청 파싱 실패' }, 400); }

  const { action, postId } = body;
  if (!action || !postId) return json({ error: '필수 파라미터 누락' }, 400);

  let user, accessToken;
  try {
    [user, accessToken] = await Promise.all([
      verifyFirebaseToken(idToken),
      getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY),
    ]);
  } catch { return json({ error: '서버 인증 실패' }, 500); }
  if (!user) return json({ error: '유효하지 않은 토큰' }, 401);

  const uid = user.localId;

  try {
    if (action === 'add') {
      const { content, isAnonymous, parentId, nickname, university } = body;
      if (!content?.trim()) return json({ error: '내용을 입력해주세요.' }, 400);
      if (content.length > 500) return json({ error: '댓글은 500자 이하로 작성해주세요.' }, 400);
      const result = await addComment({ postId, uid, content: content.trim(), isAnonymous: !!isAnonymous, parentId: parentId || null, nickname: nickname || '', university: university || '', accessToken });
      return json({ success: true, ...result });
    }

    if (action === 'delete') {
      const { commentId } = body;
      if (!commentId) return json({ error: 'commentId 누락' }, 400);
      await deleteComment({ postId, commentId, uid, accessToken });
      return json({ success: true });
    }

    return json({ error: '알 수 없는 action' }, 400);
  } catch (e) {
    const status = e.message?.includes('권한') ? 403 : e.message?.includes('찾을 수 없') ? 404 : 400;
    return json({ error: e.message || '처리 중 오류 발생' }, status);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
