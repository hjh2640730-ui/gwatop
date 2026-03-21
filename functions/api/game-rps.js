// ============================================================
// GWATOP - Rock Paper Scissors Betting Game
// POST { action, gameId?, wager?, choice? }
// Actions: create, join, submit, cancel
// Uses freePoints (not paid credits)
// ============================================================

const PROJECT_ID = 'gwatop-8edaf';
const FIREBASE_WEB_API_KEY = 'AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const DOC_BASE = `projects/${PROJECT_ID}/databases/(default)/documents`;

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
  return _cachedToken;
}

async function fsGet(path, accessToken) {
  const res = await fetch(`${FIRESTORE_BASE}/${path}`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  return res.json();
}

async function fsPatch(path, fields, accessToken) {
  const fieldPaths = Object.keys(fields).join(',');
  const res = await fetch(`${FIRESTORE_BASE}/${path}?updateMask.fieldPaths=${Object.keys(fields).join('&updateMask.fieldPaths=')}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return res.ok;
}

async function fsCreate(collection, fields, accessToken) {
  const res = await fetch(`${FIRESTORE_BASE}/${collection}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.name?.split('/').pop();
}

function v(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') return { integerValue: String(Math.round(val)) };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(val).map(([k, u]) => [k, v(u)])) } };
  return { stringValue: String(val) };
}

function fromFs(fields) {
  if (!fields) return {};
  const r = {};
  for (const [k, val] of Object.entries(fields)) {
    if ('stringValue' in val) r[k] = val.stringValue;
    else if ('integerValue' in val) r[k] = parseInt(val.integerValue);
    else if ('booleanValue' in val) r[k] = val.booleanValue;
    else if ('nullValue' in val) r[k] = null;
    else if ('doubleValue' in val) r[k] = val.doubleValue;
    else if ('timestampValue' in val) r[k] = val.timestampValue;
    else if ('mapValue' in val) r[k] = fromFs(val.mapValue?.fields);
  }
  return r;
}

function determineWinner(c1, c2) {
  if (c1 === c2) return 'draw';
  if ((c1 === '가위' && c2 === '보') || (c1 === '바위' && c2 === '가위') || (c1 === '보' && c2 === '바위')) return 'p1';
  return 'p2';
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const idToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!idToken) return json({ error: '인증 필요' }, 401);
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return json({ error: '서버 환경 변수 없음' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'parse error' }, 400); }

  let user, accessToken;
  try {
    [user, accessToken] = await Promise.all([
      verifyFirebaseToken(idToken),
      getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY),
    ]);
  } catch { return json({ error: '서버 인증 실패' }, 500); }
  if (!user) return json({ error: '유효하지 않은 토큰' }, 401);

  const { action, gameId, wager, choice } = body;
  const uid = user.localId;

  // ─── CREATE ───
  if (action === 'create') {
    const w = parseInt(wager);
    if (!w || w < 1 || w > 10) return json({ error: '배팅은 1~10 포인트' }, 400);

    const userDoc = await fsGet(`users/${uid}`, accessToken);
    if (!userDoc) return json({ error: '유저 정보 없음' }, 404);
    const userData = fromFs(userDoc.fields);
    if ((userData.freePoints || 0) < w) return json({ error: '무료 포인트가 부족합니다' }, 400);

    const newId = await fsCreate('games', {
      status: v('waiting'),
      wager: v(w),
      player1: v({ uid, name: user.displayName || '익명', photo: user.photoUrl || '' }),
      player2: v(null),
      p1Submitted: v(false),
      p2Submitted: v(false),
      p1Choice: v(null),
      p2Choice: v(null),
      winner: v(null),
      result: v(null),
      createdAt: { timestampValue: new Date().toISOString() },
    }, accessToken);
    if (!newId) return json({ error: '게임 생성 실패' }, 500);
    return json({ gameId: newId });
  }

  // ─── JOIN ───
  if (action === 'join') {
    if (!gameId) return json({ error: 'gameId 필요' }, 400);
    const [gameDoc, userDoc] = await Promise.all([
      fsGet(`games/${gameId}`, accessToken),
      fsGet(`users/${uid}`, accessToken),
    ]);
    if (!gameDoc) return json({ error: '게임방 없음' }, 404);
    if (!userDoc) return json({ error: '유저 정보 없음' }, 404);

    const game = fromFs(gameDoc.fields);
    const userData = fromFs(userDoc.fields);
    if (game.status !== 'waiting') return json({ error: '이미 시작된 게임' }, 400);
    if (game.player1?.uid === uid) return json({ error: '자신의 방에는 입장할 수 없습니다' }, 400);
    if ((userData.freePoints || 0) < game.wager) return json({ error: '무료 포인트가 부족합니다' }, 400);

    const ok = await fsPatch(`games/${gameId}`, {
      status: v('ready'),
      player2: v({ uid, name: user.displayName || '익명', photo: user.photoUrl || '' }),
    }, accessToken);
    if (!ok) return json({ error: '입장 실패' }, 500);
    return json({ success: true, wager: game.wager });
  }

  // ─── SUBMIT ───
  if (action === 'submit') {
    if (!gameId || !choice) return json({ error: 'gameId, choice 필요' }, 400);
    if (!['가위', '바위', '보'].includes(choice)) return json({ error: '유효하지 않은 선택' }, 400);

    const gameDoc = await fsGet(`games/${gameId}`, accessToken);
    if (!gameDoc) return json({ error: '게임방 없음' }, 404);
    const game = fromFs(gameDoc.fields);

    if (game.status !== 'ready') return json({ error: '게임이 준비 상태가 아님' }, 400);
    const isP1 = game.player1?.uid === uid;
    const isP2 = game.player2?.uid === uid;
    if (!isP1 && !isP2) return json({ error: '게임 참가자가 아님' }, 403);
    if (isP1 && game.p1Submitted) return json({ error: '이미 선택했습니다' }, 400);
    if (isP2 && game.p2Submitted) return json({ error: '이미 선택했습니다' }, 400);

    const p1Sub = isP1 ? true : game.p1Submitted;
    const p2Sub = isP2 ? true : game.p2Submitted;
    const p1Choice = isP1 ? choice : game.p1Choice;
    const p2Choice = isP2 ? choice : game.p2Choice;

    if (p1Sub && p2Sub) {
      // Both submitted — resolve game
      const winnerSide = determineWinner(p1Choice, p2Choice);
      const winnerId = winnerSide === 'draw' ? null
        : winnerSide === 'p1' ? game.player1.uid : game.player2.uid;

      const [p1Doc, p2Doc] = await Promise.all([
        fsGet(`users/${game.player1.uid}`, accessToken),
        fsGet(`users/${game.player2.uid}`, accessToken),
      ]);
      const p1FP = parseInt(fromFs(p1Doc?.fields)?.freePoints || 0);
      const p2FP = parseInt(fromFs(p2Doc?.fields)?.freePoints || 0);

      let newP1FP = p1FP, newP2FP = p2FP;
      if (winnerSide === 'p1') { newP1FP = p1FP + game.wager; newP2FP = Math.max(0, p2FP - game.wager); }
      else if (winnerSide === 'p2') { newP2FP = p2FP + game.wager; newP1FP = Math.max(0, p1FP - game.wager); }

      const batchRes = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:batchWrite`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          writes: [
            {
              update: {
                name: `${DOC_BASE}/games/${gameId}`,
                fields: {
                  ...(isP1 ? { p1Choice: v(choice), p1Submitted: v(true) } : { p2Choice: v(choice), p2Submitted: v(true) }),
                  status: v('finished'),
                  winner: v(winnerId),
                  result: v({ p1Choice, p2Choice }),
                },
              },
              updateMask: { fieldPaths: [isP1 ? 'p1Choice' : 'p2Choice', isP1 ? 'p1Submitted' : 'p2Submitted', 'status', 'winner', 'result'] },
            },
            {
              update: { name: `${DOC_BASE}/users/${game.player1.uid}`, fields: { freePoints: v(newP1FP) } },
              updateMask: { fieldPaths: ['freePoints'] },
            },
            {
              update: { name: `${DOC_BASE}/users/${game.player2.uid}`, fields: { freePoints: v(newP2FP) } },
              updateMask: { fieldPaths: ['freePoints'] },
            },
          ],
        }),
      });
      if (!batchRes.ok) return json({ error: '게임 처리 실패' }, 500);
      return json({ finished: true, result: { p1Choice, p2Choice, winner: winnerId, winnerSide, wager: game.wager } });
    } else {
      // One player submitted — store and wait
      await fsPatch(`games/${gameId}`,
        isP1 ? { p1Choice: v(choice), p1Submitted: v(true) } : { p2Choice: v(choice), p2Submitted: v(true) },
        accessToken
      );
      return json({ waiting: true });
    }
  }

  // ─── CANCEL ───
  if (action === 'cancel') {
    if (!gameId) return json({ error: 'gameId 필요' }, 400);
    const gameDoc = await fsGet(`games/${gameId}`, accessToken);
    if (!gameDoc) return json({ error: '게임방 없음' }, 404);
    const game = fromFs(gameDoc.fields);
    if (game.player1?.uid !== uid) return json({ error: '방장만 취소 가능' }, 403);
    if (game.status !== 'waiting') return json({ error: '이미 시작된 게임은 취소 불가' }, 400);
    await fsPatch(`games/${gameId}`, { status: v('cancelled') }, accessToken);
    return json({ success: true });
  }

  return json({ error: '알 수 없는 액션' }, 400);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
