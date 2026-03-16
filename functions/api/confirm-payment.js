// ============================================================
// GWATOP - Toss 결제 확인 + Firestore 크레딧 추가 v1.2.0
// ENV: TOSS_SECRET_KEY, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
// ============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const PROJECT_ID = 'gwatop-8edaf';

// 결제 금액 → 크레딧 변환 (서버에서 결정 = 클라이언트 조작 불가)
function creditsFromAmount(amount) {
  if (amount === 500)  return 10;   // 스타터
  if (amount === 1000) return 30;   // 스탠다드
  if (amount === 2500) return 100;  // 프리미엄
  return 0;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: '요청 파싱 실패' }, 400); }

  const { paymentKey, orderId, amount, uid } = body;
  if (!paymentKey || !orderId || !amount || !uid) {
    return json({ error: '필수 파라미터 누락' }, 400);
  }

  const tossSecret = env.TOSS_SECRET_KEY;
  if (!tossSecret) return json({ error: 'TOSS_SECRET_KEY 환경 변수가 없습니다.' }, 500);

  // ─── 1. Toss 결제 확인 ───
  const tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(tossSecret + ':')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });

  if (!tossRes.ok) {
    const err = await tossRes.json().catch(() => ({}));
    return json({ error: `결제 확인 실패: ${err.message || tossRes.status}` }, 400);
  }

  const tossData = await tossRes.json();
  if (tossData.status !== 'DONE') {
    return json({ error: `결제 상태 오류: ${tossData.status}` }, 400);
  }

  // ─── 2. 크레딧 계산 (서버에서 amount 기준으로 결정) ───
  const credits = creditsFromAmount(amount);
  if (credits === 0) {
    return json({ error: '유효하지 않은 결제 금액입니다.' }, 400);
  }

  // ─── 3. Firestore 크레딧 추가 ───
  try {
    const clientEmail = env.FIREBASE_CLIENT_EMAIL;
    const privateKey = env.FIREBASE_PRIVATE_KEY;

    if (!clientEmail || !privateKey) {
      return json({ error: 'Firebase 서비스 계정 환경 변수가 없습니다.' }, 500);
    }

    const accessToken = await getFirebaseAccessToken(clientEmail, privateKey);
    await addCreditsToFirestore(uid, credits, accessToken);

  } catch (e) {
    console.error('Firestore update error:', e);
    return json({ error: `크레딧 추가 실패: ${e.message}` }, 500);
  }

  return json({ success: true, credits, orderId });
}

// ─── Firebase Service Account → Access Token ───
async function getFirebaseAccessToken(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore',
  };

  const encode = (obj) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const signingInput = `${encode(header)}.${encode(payload)}`;

  // PEM → CryptoKey (Cloudflare env에서 \n이 literal로 저장될 수 있음)
  const pem = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\n/g, '')
    .replace(/\r/g, '')
    .replace(/\s/g, '');
  const keyData = Uint8Array.from(atob(pem), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyData.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sigEncoded = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const jwt = `${signingInput}.${sigEncoded}`;

  // JWT → Access Token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error('Access token 발급 실패: ' + JSON.stringify(tokenData));
  }
  return tokenData.access_token;
}

// ─── Firestore REST API: 크레딧 증가 ───
async function addCreditsToFirestore(uid, credits, accessToken) {
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`;

  // 현재 크레딧 조회
  const getRes = await fetch(baseUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  let currentCredits = 0;
  if (getRes.ok) {
    const doc = await getRes.json();
    currentCredits = parseInt(doc.fields?.credits?.integerValue || 0);
  }

  // 크레딧 업데이트
  const patchRes = await fetch(`${baseUrl}?updateMask.fieldPaths=credits`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        credits: { integerValue: String(currentCredits + credits) }
      }
    }),
  });

  if (!patchRes.ok) {
    const err = await patchRes.text();
    throw new Error(`Firestore 업데이트 실패: ${err}`);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
