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

    if (type === 'comments') {
      const comments = await getComments(accessToken);
      return json({ comments });
    }

    if (type === 'shared_quizzes') {
      const quizzes = await getSharedQuizzes(accessToken);
      return json({ quizzes });
    }

    if (type === 'games') {
      const games = await getGames(accessToken);
      return json({ games });
    }

    if (type === 'user_quizzes') {
      const uid = url.searchParams.get('uid');
      if (!uid) return json({ error: 'uid 필요' }, 400);
      const quizzes = await getUserQuizHistory(uid, accessToken);
      return json({ quizzes });
    }

    if (type === 'global_messages') {
      const messages = await getGlobalMessages(accessToken);
      return json({ messages });
    }

    if (type === 'user_payments') {
      const uid = url.searchParams.get('uid');
      if (!uid) return json({ error: 'uid 필요' }, 400);
      const payments = await getPaymentsByUid(uid, accessToken);
      return json({ payments });
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

  if (action === 'deleteSharedQuiz') {
    const { quizId } = body;
    if (!quizId) return json({ error: 'quizId 누락' }, 400);
    try {
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
      await deleteFirestoreDoc(`shared_quizzes/${quizId}`, accessToken);
      return json({ success: true });
    } catch (e) { return json({ error: e.message }, 500); }
  }

  if (action === 'deleteComment') {
    const { postId, commentId } = body;
    if (!postId || !commentId) return json({ error: 'postId, commentId 누락' }, 400);
    try {
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
      await deleteFirestoreDoc(`community_posts/${postId}/comments/${commentId}`, accessToken);
      return json({ success: true });
    } catch (e) { return json({ error: e.message }, 500); }
  }

  if (action === 'cancelGame') {
    const { gameId } = body;
    if (!gameId) return json({ error: 'gameId 누락' }, 400);
    try {
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
      await patchFirestoreDoc(`games/${gameId}`, { status: { stringValue: 'cancelled' } }, ['status'], accessToken);
      return json({ success: true });
    } catch (e) { return json({ error: e.message }, 500); }
  }

  if (action === 'grantFreePoints') {
    const amount = parseInt(body.amount);
    if (!amount || amount < 1 || amount > 10000) return json({ error: 'amount는 1~10000 사이' }, 400);
    try {
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
      const count = await grantFreePointsToAll(amount, accessToken);
      return json({ success: true, count });
    } catch (e) { return json({ error: e.message }, 500); }
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
      freePoints: parseInt(f.freePoints?.integerValue || 0),
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

// ─── Firestore: 유저 삭제 + Firebase Auth 계정 삭제 ───
async function deleteUserDoc(uid, accessToken) {
  // 1) Firestore 문서 삭제
  const fsUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`;
  const fsRes = await fetch(fsUrl, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!fsRes.ok && fsRes.status !== 404) throw new Error('유저 Firestore 삭제 실패');

  // 2) Firebase Auth 계정 삭제 (Identity Toolkit Admin API)
  const authUrl = `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts/${uid}:delete`;
  const authRes = await fetch(authUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  // 404 = 이미 없는 계정, 무시
  if (!authRes.ok && authRes.status !== 404) {
    console.error('Auth 계정 삭제 실패:', authRes.status, await authRes.text().catch(() => ''));
    // Auth 삭제 실패는 경고만 (Firestore 삭제는 완료됐으므로)
  }
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
    scope: 'https://www.googleapis.com/auth/cloud-platform',
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

// ─── Firestore: 댓글 목록 (collectionGroup) ───
async function getComments(accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'comments', allDescendants: true }],
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
        limit: 500,
      },
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.filter(r => r.document).map(r => {
    const f = r.document.fields || {};
    const parts = r.document.name.split('/');
    const commentId = parts.pop();
    parts.pop(); // 'comments'
    const postId = parts.pop();
    return {
      commentId, postId,
      uid: f.uid?.stringValue || '',
      nickname: f.nickname?.stringValue || '',
      content: f.content?.stringValue || '',
      deleted: f.deleted?.booleanValue || false,
      isAnonymous: f.isAnonymous?.booleanValue || false,
      likes: parseInt(f.likes?.integerValue || 0),
      createdAt: f.createdAt?.timestampValue || null,
    };
  });
}

// ─── Firestore: 공유퀴즈 목록 ───
async function getSharedQuizzes(accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'shared_quizzes' }],
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
        limit: 300,
      },
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.filter(r => r.document).map(r => {
    const f = r.document.fields || {};
    return {
      id: r.document.name.split('/').pop(),
      title: f.title?.stringValue || '',
      subject: f.subject?.stringValue || '',
      uid: f.uid?.stringValue || '',
      nickname: f.nickname?.stringValue || '',
      questionCount: parseInt(f.questionCount?.integerValue || 0),
      viewCount: parseInt(f.viewCount?.integerValue || 0),
      createdAt: f.createdAt?.timestampValue || null,
    };
  });
}

// ─── Firestore: 게임 목록 ───
async function getGames(accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'games' }],
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
        limit: 200,
      },
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.filter(r => r.document).map(r => {
    const f = r.document.fields || {};
    const p1f = f.player1?.mapValue?.fields;
    const p2f = f.player2?.mapValue?.fields;
    return {
      id: r.document.name.split('/').pop(),
      status: f.status?.stringValue || '',
      wager: parseInt(f.wager?.integerValue || 0),
      title: f.title?.stringValue || '',
      hasPassword: f.hasPassword?.booleanValue || false,
      player1: p1f ? { uid: p1f.uid?.stringValue || '', name: p1f.name?.stringValue || '' } : null,
      player2: p2f ? { uid: p2f.uid?.stringValue || '', name: p2f.name?.stringValue || '' } : null,
      winner: f.winner?.stringValue || null,
      p1Choice: f.p1Choice?.stringValue || null,
      p2Choice: f.p2Choice?.stringValue || null,
      createdAt: f.createdAt?.timestampValue || null,
    };
  });
}

// ─── Firestore: 유저 퀴즈 히스토리 ───
async function getUserQuizHistory(uid, accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/quiz_history?pageSize=20`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.documents) return [];
  return data.documents.map(doc => {
    const f = doc.fields || {};
    return {
      id: doc.name.split('/').pop(),
      subject: f.subject?.stringValue || '',
      questionCount: parseInt(f.questionCount?.integerValue || 0),
      type: f.type?.stringValue || '',
      createdAt: f.createdAt?.timestampValue || null,
    };
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// ─── Firestore: uid로 결제 내역 조회 ───
async function getPaymentsByUid(uid, accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'payments' }],
        where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } } },
        orderBy: [{ field: { fieldPath: 'processedAt' }, direction: 'DESCENDING' }],
        limit: 50,
      },
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.filter(r => r.document).map(r => {
    const f = r.document.fields || {};
    return {
      orderId: f.orderId?.stringValue || r.document.name.split('/').pop(),
      credits: parseInt(f.credits?.integerValue || 0),
      amount: parseInt(f.amount?.integerValue || 0),
      processedAt: parseInt(f.processedAt?.integerValue || 0),
    };
  });
}

// ─── Firestore: 전체 공지 메시지 목록 ───
async function getGlobalMessages(accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'global_messages' }],
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
        limit: 50,
      },
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.filter(r => r.document).map(r => {
    const f = r.document.fields || {};
    return {
      id: r.document.name.split('/').pop(),
      title: f.title?.stringValue || '',
      body: f.body?.stringValue || '',
      rewardType: f.rewardType?.stringValue || 'none',
      rewardAmount: parseInt(f.rewardAmount?.integerValue || 0),
      createdAt: f.createdAt?.timestampValue || null,
    };
  });
}

// ─── Firestore: 무료 포인트 일괄 지급 ───
async function grantFreePointsToAll(amount, accessToken) {
  const users = await getUsers(accessToken);
  const DOC_BASE = `projects/${PROJECT_ID}/databases/(default)/documents`;
  const batchUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:batchWrite`;

  const chunks = [];
  for (let i = 0; i < users.length; i += 400) chunks.push(users.slice(i, i + 400));

  let total = 0;
  for (const chunk of chunks) {
    const writes = chunk.map(u => ({
      update: {
        name: `${DOC_BASE}/users/${u.uid}`,
        fields: { freePoints: { integerValue: String((u.freePoints || 0) + amount) } },
      },
      updateMask: { fieldPaths: ['freePoints'] },
    }));
    const res = await fetch(batchUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes }),
    });
    if (res.ok) total += chunk.length;
  }
  return total;
}

// ─── Firestore: 문서 삭제 (범용) ───
async function deleteFirestoreDoc(path, accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
  const res = await fetch(url, { method: 'DELETE', headers: { 'Authorization': `Bearer ${accessToken}` } });
  if (!res.ok && res.status !== 404) throw new Error('삭제 실패');
}

// ─── Firestore: 필드 업데이트 (범용) ───
async function patchFirestoreDoc(path, fields, fieldPaths, accessToken) {
  const maskQuery = fieldPaths.map(f => `updateMask.fieldPaths=${f}`).join('&');
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}?${maskQuery}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error('업데이트 실패');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
