// ============================================================
// GWATOP - Admin API v2.0.0
// 유저 목록 조회, 크레딧/닉네임 수정, 유저 삭제
// 게시글 목록 조회, 게시글 삭제
// ENV: FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
// ============================================================

const ADMIN_EMAIL = 'hjh2640730@gmail.com';
const PROJECT_ID = 'gwatop-8edaf';
const FIREBASE_WEB_API_KEY = 'AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

// Firebase REST API로 토큰 실제 검증 (서명까지 확인)
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

// ─── GET: 유저 목록 또는 게시글 목록 조회 ───
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const type = url.searchParams.get('type');

  if (!token) return json({ error: '인증 토큰이 없습니다.' }, 401);
  const user = await verifyFirebaseToken(token);
  if (!user || user.email !== ADMIN_EMAIL) {
    return json({ error: '관리자 권한이 없습니다.' }, 403);
  }

  try {
    const accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);

    if (type === 'posts') {
      const posts = await getPosts(accessToken);
      return json({ posts });
    }

    // 기본: 유저 목록 + 통계
    const users = await getUsers(accessToken);
    const stats = {
      totalUsers: users.length,
      totalQuizzes: users.reduce((s, u) => s + u.totalQuizzes, 0),
      totalCredits: users.reduce((s, u) => s + u.credits, 0),
    };
    return json({ users, stats });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ─── POST: 크레딧/닉네임 수정, 유저/게시글 삭제 ───
export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return json({ error: '파싱 실패' }, 400); }

  const { token, action } = body;
  if (!token) return json({ error: '인증 토큰이 없습니다.' }, 401);
  const user = await verifyFirebaseToken(token);
  if (!user || user.email !== ADMIN_EMAIL) {
    return json({ error: '관리자 권한이 없습니다.' }, 403);
  }

  // 기존 updateCredits 호환 유지
  if (action === 'updateCredits') {
    const { uid, credits } = body;
    if (!uid || credits === undefined) return json({ error: '파라미터 누락' }, 400);
    try {
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
      await updateUserFields(uid, { credits: parseInt(credits) }, accessToken);
      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  if (action === 'updateUser') {
    const { uid, credits, freePoints, referralCredits, nickname, university } = body;
    if (!uid) return json({ error: 'uid 누락' }, 400);
    const fields = {};
    if (credits !== undefined) fields.credits = parseInt(credits);
    if (freePoints !== undefined) fields.freePoints = parseInt(freePoints);
    if (referralCredits !== undefined) fields.referralCredits = parseInt(referralCredits);
    if (nickname !== undefined) fields.nickname = nickname;
    if (university !== undefined) fields.university = university;
    try {
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
      await updateUserFields(uid, fields, accessToken);
      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  if (action === 'deleteUser') {
    const { uid } = body;
    if (!uid) return json({ error: 'uid 누락' }, 400);
    try {
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
      await deleteUserDoc(uid, accessToken);
      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  if (action === 'deletePost') {
    const { postId } = body;
    if (!postId) return json({ error: 'postId 누락' }, 400);
    try {
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
      // 게시글 조회 → 좋아요 수만큼 작성자 크레딧 회수 후 삭제
      await deletePostAndRevokeCredits(postId, accessToken);
      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  return json({ error: '알 수 없는 액션' }, 400);
}

// ─── Firestore: 유저 목록 ───
async function getUsers(accessToken) {
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users?pageSize=300`;
  const res = await fetch(baseUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error('유저 목록 조회 실패');
  const data = await res.json();
  if (!data.documents) return [];

  return data.documents.map(doc => {
    const f = doc.fields || {};
    return {
      uid: f.uid?.stringValue || doc.name.split('/').pop(),
      email: f.email?.stringValue || '',
      phone: f.phone?.stringValue || '',
      displayName: f.displayName?.stringValue || '',
      nickname: f.nickname?.stringValue || '',
      university: f.university?.stringValue || '',
      credits: parseInt(f.credits?.integerValue || 0),
      totalQuizzes: parseInt(f.totalQuizzes?.integerValue || 0),
      referralCredits: parseInt(f.referralCredits?.integerValue || 0),
      provider: f.provider?.stringValue || '',
      createdAt: f.createdAt?.timestampValue || null,
    };
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// ─── Firestore: 게시글 목록 (최신순 100개) ───
async function getPosts(accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'community_posts' }],
      orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
      limit: 100
    }
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('게시글 목록 조회 실패');
  const data = await res.json();
  return data
    .filter(r => r.document)
    .map(r => {
      const f = r.document.fields || {};
      const docId = r.document.name.split('/').pop();
      return {
        id: docId,
        title: f.title?.stringValue || '',
        content: f.content?.stringValue || '',
        uid: f.uid?.stringValue || '',
        nickname: f.nickname?.stringValue || '',
        isAnonymous: f.isAnonymous?.booleanValue || false,
        university: f.university?.stringValue || '',
        likes: parseInt(f.likes?.integerValue || 0),
        commentCount: parseInt(f.commentCount?.integerValue || 0),
        createdAt: f.createdAt?.timestampValue || null,
      };
    });
}

// ─── Firestore: 유저 삭제 ───
async function deleteUserDoc(uid, accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) throw new Error('유저 삭제 실패');
}

// ─── Firestore: 게시글 삭제 + 크레딧 회수 ───
async function deletePostAndRevokeCredits(postId, accessToken) {
  const getUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/community_posts/${postId}`;
  const getRes = await fetch(getUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });

  if (getRes.ok) {
    const postDoc = await getRes.json();
    const f = postDoc.fields || {};
    const authorUid = f.uid?.stringValue;
    const likes = Math.min(parseInt(f.likes?.integerValue || 0), 5); // 최대 5 크레딧만 지급됐으므로

    // 작성자가 있고 좋아요가 1개 이상이면 크레딧 회수
    if (authorUid && likes > 0) {
      try {
        // 현재 크레딧 조회
        const userUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${authorUid}`;
        const userRes = await fetch(userUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
        if (userRes.ok) {
          const userDoc = await userRes.json();
          const currentCredits = parseInt(userDoc.fields?.credits?.integerValue || 0);
          const currentReferral = parseInt(userDoc.fields?.referralCredits?.integerValue || 0);
          const newCredits = Math.max(0, currentCredits - likes);
          const newReferral = Math.max(0, currentReferral - likes);
          await fetch(`${userUrl}?updateMask.fieldPaths=credits&updateMask.fieldPaths=referralCredits`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { credits: { integerValue: String(newCredits) }, referralCredits: { integerValue: String(newReferral) } } })
          });
        }
      } catch (_) { /* 크레딧 회수 실패해도 게시글 삭제는 진행 */ }
    }
  }

  const delRes = await fetch(getUrl, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!delRes.ok && delRes.status !== 404) throw new Error('게시글 삭제 실패');
}

// ─── Firestore: 유저 필드 업데이트 (credits + nickname + university) ───
async function updateUserFields(uid, fields, accessToken) {
  const firestoreFields = {};
  const updateMasks = [];
  if (fields.credits !== undefined) {
    firestoreFields.credits = { integerValue: String(fields.credits) };
    updateMasks.push('credits');
  }
  if (fields.nickname !== undefined) {
    firestoreFields.nickname = { stringValue: fields.nickname };
    updateMasks.push('nickname');
  }
  if (fields.university !== undefined) {
    firestoreFields.university = { stringValue: fields.university };
    updateMasks.push('university');
  }
  if (fields.freePoints !== undefined) {
    firestoreFields.freePoints = { integerValue: String(fields.freePoints) };
    updateMasks.push('freePoints');
  }
  if (fields.referralCredits !== undefined) {
    firestoreFields.referralCredits = { integerValue: String(fields.referralCredits) };
    updateMasks.push('referralCredits');
  }
  if (updateMasks.length === 0) return;
  const maskQuery = updateMasks.map(f => `updateMask.fieldPaths=${f}`).join('&');
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}?${maskQuery}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: firestoreFields })
  });
  if (!res.ok) throw new Error('유저 정보 업데이트 실패');
}

// ─── Firebase JWT ───
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
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
