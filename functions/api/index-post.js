// ============================================================
// GWATOP - Algolia Post Indexer v1.0.0
// 게시글 생성/삭제 시 Algolia 인덱스 동기화
// ENV: ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY
// ============================================================

const FIREBASE_WEB_API_KEY = 'AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ';
const ALGOLIA_INDEX = 'posts';

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
    const res = await fetch(`${algoliaBase}/${postId}`, { method: 'DELETE', headers });
    if (!res.ok && res.status !== 404) {
      return json({ error: `Algolia 삭제 실패: ${res.status}` }, 500);
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
