// ============================================================
// GWATOP - 하나빼기 Betting Game
// POST { action, gameId?, wager?, leftHand?, rightHand?, finalHand? }
// Actions: create, join, submit_hands, submit_final, rematch_request, rematch_accept, rematch_decline, cancel
// Uses freePoints (not paid credits)
// ============================================================

const PROJECT_ID = 'gwatop-8edaf';
const FIREBASE_WEB_API_KEY = 'AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const DOC_BASE = `projects/${PROJECT_ID}/databases/(default)/documents`;
const RTDB_BASE = `https://${PROJECT_ID}-default-rtdb.asia-southeast1.firebasedatabase.app`;

let _cachedToken = null, _tokenExpiry = 0;
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

async function getFirebaseAccessToken(clientEmail, privateKey, kv) {
  const now = Math.floor(Date.now() / 1000);
  if (kv) {
    const cached = await kv.get('firebase_admin_token_v3', 'json');
    if (cached && cached.expiry - now > 300) return cached.token;
  } else if (_cachedToken && _tokenExpiry - now > 300) return _cachedToken;
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = { iss: clientEmail, sub: clientEmail, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600, scope: 'https://www.googleapis.com/auth/cloud-platform' };
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
  if (kv) {
    await kv.put('firebase_admin_token_v3', JSON.stringify({ token: tokenData.access_token, expiry: now + 3600 }), { expirationTtl: 3500 });
  }
  return _cachedToken;
}

async function fsGet(path, accessToken) {
  const res = await fetch(`${FIRESTORE_BASE}/${path}`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
  if (!res.ok) {
    if (res.status !== 404) {
      const errText = await res.text().catch(() => '');
      console.error(`fsGet ${path} failed: ${res.status}`, errText);
    }
    return null;
  }
  return res.json();
}

async function fsPatch(path, fields, accessToken) {
  const res = await fetch(`${FIRESTORE_BASE}/${path}?updateMask.fieldPaths=${Object.keys(fields).join('&updateMask.fieldPaths=')}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return res.ok;
}

async function fsBeginTransaction(accessToken) {
  const res = await fetch(`${FIRESTORE_BASE}:beginTransaction`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ options: { readWrite: {} } }),
  });
  if (!res.ok) throw new Error('트랜잭션 시작 실패');
  return (await res.json()).transaction;
}

async function fsGetTx(path, accessToken, txId) {
  const res = await fetch(`${FIRESTORE_BASE}/${path}?transaction=${encodeURIComponent(txId)}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

async function fsCommitTx(writes, accessToken, txId) {
  const res = await fetch(`${FIRESTORE_BASE}:commit`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: txId, writes }),
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

// ─── Realtime Database 헬퍼 ───
async function rtdbSet(gameId, data, accessToken) {
  try {
    const res = await fetch(`${RTDB_BASE}/game_realtime/${gameId}.json?access_token=${accessToken}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) console.error(`rtdbSet ${gameId} failed: ${res.status}`, await res.text().catch(() => ''));
  } catch (e) { console.error(`rtdbSet ${gameId} exception:`, e?.message || e); }
}

async function rtdbPatch(gameId, data, accessToken) {
  try {
    const res = await fetch(`${RTDB_BASE}/game_realtime/${gameId}.json?access_token=${accessToken}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) console.error(`rtdbPatch ${gameId} failed: ${res.status}`, await res.text().catch(() => ''));
  } catch (e) { console.error(`rtdbPatch ${gameId} exception:`, e?.message || e); }
}

async function rtdbDelete(gameId, accessToken) {
  try {
    await fetch(`${RTDB_BASE}/game_realtime/${gameId}.json?access_token=${accessToken}`, {
      method: 'DELETE',
    });
  } catch (_) {}
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

// 유저 문서가 없으면 기본값으로 자동 생성 (삭제된 계정 재가입 복구용)
async function getOrCreateUserDoc(uid, user, accessToken) {
  const existing = await fsGet(`users/${uid}`, accessToken);
  if (existing) return existing;

  const DOC_NAME = `projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`;
  const fields = {
    uid: { stringValue: uid },
    email: { stringValue: user.email || '' },
    displayName: { stringValue: user.displayName || '' },
    photoURL: { stringValue: user.photoUrl || '' },
    phone: { stringValue: '' },
    credits: { integerValue: '30' },
    freePoints: { integerValue: '0' },
    referralCredits: { integerValue: '0' },
    totalQuizzes: { integerValue: '0' },
    createdAt: { timestampValue: new Date().toISOString() },
  };
  const commitRes = await fetch(`${FIRESTORE_BASE}:commit`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes: [{ update: { name: DOC_NAME, fields } }] }),
  });
  if (!commitRes.ok) {
    console.error('getOrCreateUserDoc commit failed:', commitRes.status, await commitRes.text().catch(() => ''));
    return null;
  }
  return fsGet(`users/${uid}`, accessToken);
}

async function hashPassword(pwd) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('gwatop:' + pwd));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function determineWinner(c1, c2) {
  if (c1 === c2) return 'draw';
  if ((c1 === '가위' && c2 === '보') || (c1 === '바위' && c2 === '가위') || (c1 === '보' && c2 === '바위')) return 'p1';
  return 'p2';
}

function newGameFields(wager, player1, player2) {
  return {
    wager: v(wager),
    title: v(''),
    hasPassword: v(false),
    passwordHash: v(''),
    player1: v(player1),
    player2: v(player2),
    p1LeftHand: v(null),
    p1RightHand: v(null),
    p2LeftHand: v(null),
    p2RightHand: v(null),
    p1HandsSubmitted: v(false),
    p2HandsSubmitted: v(false),
    p1FinalHand: v(null),
    p2FinalHand: v(null),
    p1FinalSubmitted: v(false),
    p2FinalSubmitted: v(false),
    winner: v(null),
    result: v(null),
    rematchRequest: v(null),
    createdAt: { timestampValue: new Date().toISOString() },
  };
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
      getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY, env.GWATOP_CACHE),
    ]);
  } catch { return json({ error: '서버 인증 실패' }, 500); }
  if (!user) return json({ error: '유효하지 않은 토큰' }, 401);

  const { action, gameId, wager, leftHand, rightHand, finalHand, title, password } = body;
  const uid = user.localId;
  const VALID_HANDS = ['가위', '바위', '보'];

  // ─── CREATE ───
  if (action === 'create') {
    const w = parseInt(wager);
    if (!w || w < 1 || w > 10) return json({ error: '배팅은 1~10 포인트' }, 400);
    const roomTitle = (title || '').trim().slice(0, 20);
    const roomPw = (password || '').trim().slice(0, 20);
    const passwordHash = roomPw ? await hashPassword(roomPw) : '';

    const userDoc = await getOrCreateUserDoc(uid, user, accessToken);
    if (!userDoc) return json({ error: '계정 정보를 초기화할 수 없습니다. 잠시 후 다시 시도해주세요.' }, 500);
    const userData = fromFs(userDoc.fields);
    if ((userData.freePoints || 0) < w) return json({ error: '무료 포인트가 부족합니다' }, 400);

    const fields = newGameFields(w, { uid, name: userData.nickname || user.displayName || '익명', photo: user.photoUrl || '' }, null);
    fields.status = v('waiting');
    fields.title = v(roomTitle);
    fields.hasPassword = v(!!roomPw);
    fields.passwordHash = v(passwordHash);

    const newId = await fsCreate('games', fields, accessToken);
    if (!newId) return json({ error: '게임 생성 실패' }, 500);
    // RTDB에 초기 노드 생성 (방장도 onValue/채팅 사용 가능하도록)
    await rtdbSet(newId, {
      status: 'waiting',
      wager: w,
      title: roomTitle,
      hasPassword: !!roomPw,
      createdAt: Date.now(),
      player1: { uid, name: userData.nickname || user.displayName || '익명', photo: user.photoUrl || '' },
      player2: null,
      p1HandsSubmitted: false,
      p2HandsSubmitted: false,
    }, accessToken);
    return json({ gameId: newId });
  }

  // ─── JOIN ───
  if (action === 'join') {
    if (!gameId) return json({ error: 'gameId 필요' }, 400);
    const userDoc = await getOrCreateUserDoc(uid, user, accessToken);
    if (!userDoc) return json({ error: '계정 정보를 초기화할 수 없습니다. 잠시 후 다시 시도해주세요.' }, 500);
    const userData = fromFs(userDoc.fields);

    // 비밀번호 사전 검증 (트랜잭션 밖에서 해시 계산)
    const inputHash = password ? await hashPassword((password || '').trim().slice(0, 20)) : '';

    for (let attempt = 0; attempt < 3; attempt++) {
      let txId;
      try { txId = await fsBeginTransaction(accessToken); } catch { return json({ error: '서버 오류' }, 500); }

      const gameDoc = await fsGetTx(`games/${gameId}`, accessToken, txId);
      if (!gameDoc) return json({ error: '게임방 없음' }, 404);
      const game = fromFs(gameDoc.fields);

      if (game.status !== 'waiting') return json({ error: '이미 시작된 게임' }, 400);
      if (game.player1?.uid === uid) return json({ error: '자신의 방에는 입장할 수 없습니다' }, 400);
      if ((userData.freePoints || 0) < game.wager) return json({ error: '무료 포인트가 부족합니다' }, 400);
      if (game.hasPassword) {
        if (!password) return json({ error: '비밀번호가 필요합니다' }, 403);
        if (inputHash !== game.passwordHash) return json({ error: '비밀번호가 틀렸습니다' }, 403);
      }

      const fields = {
        status: v('ready'),
        player2: v({ uid, name: userData.nickname || user.displayName || '익명', photo: user.photoUrl || '' }),
      };
      const { ok, data } = await fsCommitTx([{
        update: { name: `${DOC_BASE}/games/${gameId}`, fields },
        updateMask: { fieldPaths: Object.keys(fields) },
      }], accessToken, txId);

      if (ok) {
        // RTDB에 초기 게임 상태 기록 (클라이언트 onValue 수신용)
        await rtdbSet(gameId, {
          status: 'ready', wager: game.wager,
          player1: game.player1,
          player2: { uid, name: userData.nickname || user.displayName || '익명', photo: user.photoUrl || '' },
          p1HandsSubmitted: false, p2HandsSubmitted: false,
        }, accessToken);
        return json({ success: true, wager: game.wager });
      }
      if (data.error?.status === 'ABORTED') continue;
      return json({ error: '입장 실패' }, 500);
    }
    return json({ error: '이미 다른 플레이어가 입장했습니다' }, 409);
  }

  // ─── SUBMIT HANDS (Phase 1) ───
  if (action === 'submit_hands') {
    if (!gameId || !leftHand || !rightHand) return json({ error: 'gameId, leftHand, rightHand 필요' }, 400);
    if (!VALID_HANDS.includes(leftHand) || !VALID_HANDS.includes(rightHand)) return json({ error: '유효하지 않은 손 선택' }, 400);

    for (let attempt = 0; attempt < 3; attempt++) {
      let txId;
      try { txId = await fsBeginTransaction(accessToken); } catch { return json({ error: '서버 오류' }, 500); }

      const gameDoc = await fsGetTx(`games/${gameId}`, accessToken, txId);
      if (!gameDoc) return json({ error: '게임방 없음' }, 404);
      const game = fromFs(gameDoc.fields);

      if (game.status !== 'ready') return json({ error: '게임이 준비 상태가 아님' }, 400);
      const isP1 = game.player1?.uid === uid;
      const isP2 = game.player2?.uid === uid;
      if (!isP1 && !isP2) return json({ error: '게임 참가자가 아님' }, 403);
      if (isP1 && game.p1HandsSubmitted) return json({ error: '이미 제출했습니다' }, 400);
      if (isP2 && game.p2HandsSubmitted) return json({ error: '이미 제출했습니다' }, 400);

      const bothSubmitted = isP1 ? game.p2HandsSubmitted : game.p1HandsSubmitted;
      const fields = isP1
        ? { p1LeftHand: v(leftHand), p1RightHand: v(rightHand), p1HandsSubmitted: v(true) }
        : { p2LeftHand: v(leftHand), p2RightHand: v(rightHand), p2HandsSubmitted: v(true) };
      if (bothSubmitted) fields.status = v('hands_shown');

      const { ok, data } = await fsCommitTx([{
        update: { name: `${DOC_BASE}/games/${gameId}`, fields },
        updateMask: { fieldPaths: Object.keys(fields) },
      }], accessToken, txId);

      if (ok) {
        const rtdbUpdate = isP1
          ? { p1HandsSubmitted: true, p1LeftHand: leftHand, p1RightHand: rightHand }
          : { p2HandsSubmitted: true, p2LeftHand: leftHand, p2RightHand: rightHand };
        if (bothSubmitted) rtdbUpdate.status = 'hands_shown';
        await rtdbPatch(gameId, rtdbUpdate, accessToken);
        return json({ handsShown: !!bothSubmitted });
      }
      if (data.error?.status === 'ABORTED') continue;
      return json({ error: '제출 실패' }, 500);
    }
    return json({ error: '일시적 충돌, 잠시 후 다시 시도해주세요' }, 409);
  }

  // ─── SUBMIT FINAL (Phase 2) ───
  if (action === 'submit_final') {
    if (!gameId || !finalHand) return json({ error: 'gameId, finalHand 필요' }, 400);
    if (!VALID_HANDS.includes(finalHand)) return json({ error: '유효하지 않은 선택' }, 400);

    for (let attempt = 0; attempt < 3; attempt++) {
      let txId;
      try { txId = await fsBeginTransaction(accessToken); } catch { return json({ error: '서버 오류' }, 500); }

      const [gameDoc, finalsDoc] = await Promise.all([
        fsGetTx(`games/${gameId}`, accessToken, txId),
        fsGetTx(`game_finals/${gameId}`, accessToken, txId),
      ]);
      if (!gameDoc) return json({ error: '게임방 없음' }, 404);
      const game = fromFs(gameDoc.fields);
      const finals = fromFs(finalsDoc?.fields || {});

      if (game.status !== 'hands_shown') return json({ error: '손 공개 상태가 아님' }, 400);
      const isP1 = game.player1?.uid === uid;
      const isP2 = game.player2?.uid === uid;
      if (!isP1 && !isP2) return json({ error: '게임 참가자가 아님' }, 403);
      if (isP1 && game.p1FinalSubmitted) return json({ error: '이미 선택했습니다' }, 400);
      if (isP2 && game.p2FinalSubmitted) return json({ error: '이미 선택했습니다' }, 400);

      const myLeft  = isP1 ? game.p1LeftHand : game.p2LeftHand;
      const myRight = isP1 ? game.p1RightHand : game.p2RightHand;
      if (finalHand !== myLeft && finalHand !== myRight) return json({ error: '자신이 낸 손만 선택 가능' }, 400);

      const bothFinal = isP1 ? game.p2FinalSubmitted : game.p1FinalSubmitted;
      const myFinalKey  = isP1 ? 'p1FinalHand'      : 'p2FinalHand';
      const mySubKey    = isP1 ? 'p1FinalSubmitted'  : 'p2FinalSubmitted';

      if (!bothFinal) {
        // 상대방 아직 미제출 — 내 손만 기록
        const { ok, data } = await fsCommitTx([
          { update: { name: `${DOC_BASE}/game_finals/${gameId}`, fields: { [myFinalKey]: v(finalHand) } }, updateMask: { fieldPaths: [myFinalKey] } },
          { update: { name: `${DOC_BASE}/games/${gameId}`,       fields: { [mySubKey]: v(true) }         }, updateMask: { fieldPaths: [mySubKey] } },
        ], accessToken, txId);
        if (ok) {
          await rtdbPatch(gameId, { [mySubKey]: true }, accessToken);
          return json({ waiting: true });
        }
        if (data.error?.status === 'ABORTED') continue;
        return json({ error: '처리 실패' }, 500);
      }

      // 내가 마지막 — 게임 결과 확정
      const oppFinalHand = isP1 ? finals.p2FinalHand : finals.p1FinalHand;
      if (!oppFinalHand) return json({ error: '상대방 손 선택 데이터 없음' }, 500);
      const p1FinalHand = isP1 ? finalHand : oppFinalHand;
      const p2FinalHand = isP2 ? finalHand : oppFinalHand;
      const winnerSide  = determineWinner(p1FinalHand, p2FinalHand);

      // ─── DRAW ───
      if (winnerSide === 'draw') {
        const rematchId     = `${gameId}_r`;
        const rematchFields = { ...newGameFields(game.wager,
          { uid: game.player1.uid, name: game.player1.name, photo: game.player1.photo || '' },
          { uid: game.player2.uid, name: game.player2.name, photo: game.player2.photo || '' }
        ), status: v('ready') };

        const { ok, data } = await fsCommitTx([
          { update: { name: `${DOC_BASE}/game_finals/${gameId}`, fields: { [myFinalKey]: v(finalHand) }                                                                                                                         }, updateMask: { fieldPaths: [myFinalKey] } },
          { update: { name: `${DOC_BASE}/games/${rematchId}`,    fields: rematchFields                                                                                                                                         }, updateMask: { fieldPaths: Object.keys(rematchFields) } },
          { update: { name: `${DOC_BASE}/games/${gameId}`,       fields: { [mySubKey]: v(true), status: v('finished'), winner: v(null), result: v({ p1FinalHand, p2FinalHand }), drawRematchId: v(rematchId) } }, updateMask: { fieldPaths: [mySubKey, 'status', 'winner', 'result', 'drawRematchId'] } },
        ], accessToken, txId);
        if (ok) {
          await Promise.all([
            rtdbPatch(gameId, { [mySubKey]: true, status: 'finished', result: { p1FinalHand, p2FinalHand }, drawRematchId: rematchId }, accessToken),
            rtdbSet(rematchId, {
              status: 'ready', wager: game.wager,
              player1: game.player1, player2: game.player2,
              p1HandsSubmitted: false, p2HandsSubmitted: false,
            }, accessToken),
          ]);
          return json({ finished: true, draw: true, drawRematchId: rematchId });
        }
        if (data.error?.status === 'ABORTED') continue;
        return json({ error: '게임 처리 실패' }, 500);
      }

      // ─── WIN / LOSE ───
      const [p1Doc, p2Doc] = await Promise.all([
        fsGetTx(`users/${game.player1.uid}`, accessToken, txId),
        fsGetTx(`users/${game.player2.uid}`, accessToken, txId),
      ]);
      const p1FP = parseInt(fromFs(p1Doc?.fields)?.freePoints || 0);
      const p2FP = parseInt(fromFs(p2Doc?.fields)?.freePoints || 0);
      const winnerId = winnerSide === 'p1' ? game.player1.uid : game.player2.uid;
      let newP1FP = p1FP, newP2FP = p2FP;
      if (winnerSide === 'p1') { newP1FP = p1FP + game.wager; newP2FP = Math.max(0, p2FP - game.wager); }
      else                     { newP2FP = p2FP + game.wager; newP1FP = Math.max(0, p1FP - game.wager); }

      const { ok, data } = await fsCommitTx([
        { update: { name: `${DOC_BASE}/game_finals/${gameId}`,       fields: { [myFinalKey]: v(finalHand) }                                                                            }, updateMask: { fieldPaths: [myFinalKey] } },
        { update: { name: `${DOC_BASE}/games/${gameId}`,             fields: { [mySubKey]: v(true), status: v('finished'), winner: v(winnerId), result: v({ p1FinalHand, p2FinalHand }) } }, updateMask: { fieldPaths: [mySubKey, 'status', 'winner', 'result'] } },
        { update: { name: `${DOC_BASE}/users/${game.player1.uid}`,   fields: { freePoints: v(newP1FP) }                                                                               }, updateMask: { fieldPaths: ['freePoints'] } },
        { update: { name: `${DOC_BASE}/users/${game.player2.uid}`,   fields: { freePoints: v(newP2FP) }                                                                               }, updateMask: { fieldPaths: ['freePoints'] } },
      ], accessToken, txId);
      if (ok) {
        await rtdbPatch(gameId, { [mySubKey]: true, status: 'finished', winner: winnerId, result: { p1FinalHand, p2FinalHand } }, accessToken);
        return json({ finished: true, result: { p1FinalHand, p2FinalHand, winner: winnerId, winnerSide, wager: game.wager } });
      }
      if (data.error?.status === 'ABORTED') continue;
      return json({ error: '게임 처리 실패' }, 500);
    }
    return json({ error: '일시적 충돌, 잠시 후 다시 시도해주세요' }, 409);
  }

  // ─── REMATCH REQUEST ───
  if (action === 'rematch_request') {
    if (!gameId || !wager) return json({ error: 'gameId, wager 필요' }, 400);
    const w = parseInt(wager);
    if (!w || w < 1 || w > 10) return json({ error: '배팅은 1~10 포인트' }, 400);
    const [gameDoc, userDoc] = await Promise.all([
      fsGet(`games/${gameId}`, accessToken),
      fsGet(`users/${uid}`, accessToken),
    ]);
    if (!gameDoc) return json({ error: '게임방 없음' }, 404);
    if (!userDoc) return json({ error: '계정 정보를 찾을 수 없습니다. 다시 로그인해주세요.' }, 404);
    const game = fromFs(gameDoc.fields);
    if (game.status !== 'finished') return json({ error: '종료된 게임만 재대결 가능' }, 400);
    if (game.player1?.uid !== uid && game.player2?.uid !== uid) return json({ error: '게임 참가자 아님' }, 403);
    if (game.rematchRequest?.status === 'pending') return json({ error: '이미 재대결 신청 중' }, 400);
    const userData = fromFs(userDoc.fields);
    if ((userData.freePoints || 0) < w) return json({ error: '무료 포인트 부족' }, 400);
    await fsPatch(`games/${gameId}`, {
      rematchRequest: v({ fromUid: uid, fromName: userData.nickname || user.displayName || '익명', wager: w, status: 'pending' }),
    }, accessToken);
    await rtdbPatch(gameId, { rematchRequest: { fromUid: uid, fromName: userData.nickname || user.displayName || '익명', wager: w, status: 'pending' } }, accessToken);
    return json({ success: true });
  }

  // ─── REMATCH ACCEPT ───
  if (action === 'rematch_accept') {
    if (!gameId) return json({ error: 'gameId 필요' }, 400);
    const [gameDoc, userDoc] = await Promise.all([
      fsGet(`games/${gameId}`, accessToken),
      fsGet(`users/${uid}`, accessToken),
    ]);
    if (!gameDoc) return json({ error: '게임방 없음' }, 404);
    if (!userDoc) return json({ error: '계정 정보를 찾을 수 없습니다. 다시 로그인해주세요.' }, 404);
    const game = fromFs(gameDoc.fields);
    const rr = game.rematchRequest;
    if (!rr || rr.status !== 'pending') return json({ error: '유효한 재대결 신청 없음' }, 400);
    if (rr.fromUid === uid) return json({ error: '자신의 신청은 수락 불가' }, 403);
    const userData = fromFs(userDoc.fields);
    if ((userData.freePoints || 0) < rr.wager) return json({ error: '무료 포인트 부족' }, 400);
    const requesterDoc = await fsGet(`users/${rr.fromUid}`, accessToken);
    if (!requesterDoc) return json({ error: '신청자 계정 정보를 찾을 수 없습니다.' }, 404);
    const requesterData = fromFs(requesterDoc.fields);
    if ((requesterData.freePoints || 0) < rr.wager) return json({ error: '신청자 포인트 부족' }, 400);

    const fields = newGameFields(rr.wager,
      { uid: game.player1.uid, name: game.player1.name, photo: game.player1.photo || '' },
      { uid: game.player2.uid, name: game.player2.name, photo: game.player2.photo || '' }
    );
    fields.status = v('ready');

    const newId = await fsCreate('games', fields, accessToken);
    if (!newId) return json({ error: '재대결 게임 생성 실패' }, 500);

    await fsPatch(`games/${gameId}`, {
      rematchRequest: v({ fromUid: rr.fromUid, fromName: rr.fromName, wager: rr.wager, status: 'accepted', newGameId: newId }),
    }, accessToken);
    await Promise.all([
      rtdbPatch(gameId, { rematchRequest: { fromUid: rr.fromUid, fromName: rr.fromName, wager: rr.wager, status: 'accepted', newGameId: newId } }, accessToken),
      rtdbSet(newId, {
        status: 'ready', wager: rr.wager,
        player1: { uid: game.player1.uid, name: game.player1.name, photo: game.player1.photo || '' },
        player2: { uid: game.player2.uid, name: game.player2.name, photo: game.player2.photo || '' },
        p1HandsSubmitted: false, p2HandsSubmitted: false,
      }, accessToken),
    ]);

    const isP1ForAcceptor = game.player1?.uid === uid;
    return json({ success: true, newGameId: newId, isP1: isP1ForAcceptor });
  }

  // ─── REMATCH DECLINE / CANCEL ───
  if (action === 'rematch_decline') {
    if (!gameId) return json({ error: 'gameId 필요' }, 400);
    const gameDoc = await fsGet(`games/${gameId}`, accessToken);
    if (!gameDoc) return json({ error: '게임방 없음' }, 404);
    const game = fromFs(gameDoc.fields);
    if (game.player1?.uid !== uid && game.player2?.uid !== uid) return json({ error: '게임 참가자 아님' }, 403);
    const rr = game.rematchRequest;
    if (!rr || rr.status !== 'pending') return json({ error: '유효한 신청 없음' }, 400);
    const newRR = rr.fromUid === uid
      ? null
      : { fromUid: rr.fromUid, fromName: rr.fromName, wager: rr.wager, status: 'declined' };
    await fsPatch(`games/${gameId}`, { rematchRequest: v(newRR) }, accessToken);
    await rtdbPatch(gameId, { rematchRequest: newRR }, accessToken);
    return json({ success: true });
  }

  // ─── TIMEOUT (자동 패배) ───
  if (action === 'timeout') {
    if (!gameId) return json({ error: 'gameId 필요' }, 400);

    for (let attempt = 0; attempt < 3; attempt++) {
      let txId;
      try { txId = await fsBeginTransaction(accessToken); } catch { return json({ error: '서버 오류' }, 500); }

      const gameDoc = await fsGetTx(`games/${gameId}`, accessToken, txId);
      if (!gameDoc) return json({ error: '게임방 없음' }, 404);
      const game = fromFs(gameDoc.fields);

      if (game.status !== 'ready' && game.status !== 'hands_shown') return json({ error: '진행 중인 게임이 아님' }, 400);
      const isP1 = game.player1?.uid === uid;
      const isP2 = game.player2?.uid === uid;
      if (!isP1 && !isP2) return json({ error: '게임 참가자 아님' }, 403);

      // 이미 제출한 경우: 상대방이 미제출(접속 종료) → 내가 승리
      const callerAlreadySubmitted =
        (game.status === 'ready'       && isP1 && game.p1HandsSubmitted)  ||
        (game.status === 'ready'       && isP2 && game.p2HandsSubmitted)  ||
        (game.status === 'hands_shown' && isP1 && game.p1FinalSubmitted)  ||
        (game.status === 'hands_shown' && isP2 && game.p2FinalSubmitted);

      // callerAlreadySubmitted=true → 상대방 타임아웃, 내가 승리
      // callerAlreadySubmitted=false → 내가 타임아웃, 상대방 승리
      const winnerId   = callerAlreadySubmitted
        ? (isP1 ? game.player1.uid : game.player2.uid)
        : (isP1 ? game.player2.uid : game.player1.uid);
      const winnerSide = callerAlreadySubmitted
        ? (isP1 ? 'p1' : 'p2')
        : (isP1 ? 'p2' : 'p1');

      const [p1Doc, p2Doc] = await Promise.all([
        fsGetTx(`users/${game.player1.uid}`, accessToken, txId),
        fsGetTx(`users/${game.player2.uid}`, accessToken, txId),
      ]);
      const p1FP = parseInt(fromFs(p1Doc?.fields)?.freePoints || 0);
      const p2FP = parseInt(fromFs(p2Doc?.fields)?.freePoints || 0);
      let newP1FP = p1FP, newP2FP = p2FP;
      if (winnerSide === 'p1') { newP1FP = p1FP + game.wager; newP2FP = Math.max(0, p2FP - game.wager); }
      else                     { newP2FP = p2FP + game.wager; newP1FP = Math.max(0, p1FP - game.wager); }

      const { ok, data } = await fsCommitTx([
        { update: { name: `${DOC_BASE}/games/${gameId}`,           fields: { status: v('finished'), winner: v(winnerId), result: v({ timeout: true }) } }, updateMask: { fieldPaths: ['status', 'winner', 'result'] } },
        { update: { name: `${DOC_BASE}/users/${game.player1.uid}`, fields: { freePoints: v(newP1FP) } }, updateMask: { fieldPaths: ['freePoints'] } },
        { update: { name: `${DOC_BASE}/users/${game.player2.uid}`, fields: { freePoints: v(newP2FP) } }, updateMask: { fieldPaths: ['freePoints'] } },
      ], accessToken, txId);
      if (ok) {
        await rtdbPatch(gameId, { status: 'finished', winner: winnerId, result: { timeout: true } }, accessToken);
        return json({ finished: true, timeout: true });
      }
      if (data.error?.status === 'ABORTED') continue;
      return json({ error: '타임아웃 처리 실패' }, 500);
    }
    return json({ error: '일시적 충돌, 잠시 후 다시 시도해주세요' }, 409);
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
    await rtdbPatch(gameId, { status: 'cancelled' }, accessToken);
    return json({ success: true });
  }

  return json({ error: '알 수 없는 액션' }, 400);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
