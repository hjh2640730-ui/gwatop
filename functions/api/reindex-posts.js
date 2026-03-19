// ============================================================
// GWATOP - Algolia 전체 재인덱싱 v1.0.0
// 기존 게시글을 Algolia에 일괄 등록 (관리자 1회 실행)
// POST { token: "admin_id_token" }
// ENV: FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY
// ============================================================

const PROJECT_ID = 'gwatop-8edaf';
const ADMIN_EMAIL = 'hjh2640730@gmail.com';
const FIREBASE_WEB_API_KEY = 'AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const ALGOLIA_INDEX = 'posts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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

// Firestore 문서를 Algolia 레코드로 변환
function toAlgoliaRecord(docName, fields) {
  const postId = docName.split('/').pop();
  return {
    objectID: postId,
    title: fields.title?.stringValue || '',
    content: fields.content?.stringValue || '',
    nickname: fields.isAnonymous?.booleanValue ? '' : (fields.nickname?.stringValue || ''),
    university: fields.university?.stringValue || '',
    uid: fields.uid?.stringValue || '',
    isAnonymous: fields.isAnonymous?.booleanValue || false,
    createdAt: fields.createdAt?.timestampValue
      ? new Date(fields.createdAt.timestampValue).getTime()
      : Date.now(),
    likes: parseInt(fields.likes?.integerValue || '0'),
    commentCount: parseInt(fields.commentCount?.integerValue || '0'),
    imageUrl: fields.imageUrl?.stringValue || '',
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: '요청 파싱 실패' }, 400); }

  // 관리자 검증
  const user = await verifyFirebaseToken(body.token || '');
  if (!user || user.email !== ADMIN_EMAIL) {
    return json({ error: '관리자 권한 없음' }, 403);
  }

  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return json({ error: 'Firebase 서비스 계정 환경 변수 없음' }, 500);
  }
  if (!env.ALGOLIA_APP_ID || !env.ALGOLIA_ADMIN_KEY) {
    return json({ error: 'Algolia 환경 변수 없음' }, 500);
  }

  const accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
  const algoliaBase = `https://${env.ALGOLIA_APP_ID}.algolia.net/1/indexes/${ALGOLIA_INDEX}`;
  const algoliaHeaders = {
    'X-Algolia-Application-Id': env.ALGOLIA_APP_ID,
    'X-Algolia-API-Key': env.ALGOLIA_ADMIN_KEY,
    'Content-Type': 'application/json',
  };

  let pageToken = null;
  let totalIndexed = 0;

  // Firestore 전체 게시글 순회 (pageSize 100씩)
  do {
    const url = `${FIRESTORE_BASE}/community_posts?pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    if (!res.ok) return json({ error: `Firestore 읽기 실패: ${res.status}` }, 500);

    const data = await res.json();
    pageToken = data.nextPageToken || null;

    const docs = data.documents || [];
    if (docs.length === 0) break;

    // Algolia 배치 인덱싱 (최대 1000건)
    const requests = docs.map(d => ({
      action: 'addObject',
      body: toAlgoliaRecord(d.name, d.fields || {}),
    }));

    const batchRes = await fetch(`${algoliaBase}/batch`, {
      method: 'POST',
      headers: algoliaHeaders,
      body: JSON.stringify({ requests }),
    });
    if (!batchRes.ok) {
      return json({ error: `Algolia 배치 실패: ${batchRes.status}` }, 500);
    }

    totalIndexed += docs.length;
  } while (pageToken);

  return json({ success: true, totalIndexed });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
