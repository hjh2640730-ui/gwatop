// ============================================================
// GWATOP - Social Auth (Kakao / Naver) → Firebase Custom Token
// ENV: FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
// ============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: '요청 파싱 실패' }, 400); }

  const { provider, code, redirectUri } = body;

  const clientEmail = env.FIREBASE_CLIENT_EMAIL;
  const privateKey = env.FIREBASE_PRIVATE_KEY;
  if (!clientEmail || !privateKey) {
    return json({ error: 'Firebase 서비스 계정 환경 변수가 없습니다.' }, 500);
  }

  let uid, displayName = '', email = '', photoURL = '', phone = '';

  if (provider === 'kakao') {
    if (!code) return json({ error: 'code가 필요합니다.' }, 400);

    const kakaoKey = env.KAKAO_REST_API_KEY;
    if (!kakaoKey) return json({ error: '카카오 환경 변수가 없습니다.' }, 500);

    const kakaoSecret = env.KAKAO_CLIENT_SECRET || '';
    const tokenBody = `grant_type=authorization_code&client_id=${kakaoKey}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}${kakaoSecret ? `&client_secret=${kakaoSecret}` : ''}`;
    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return json({ error: `카카오 토큰 발급 실패: ${tokenData.error_description || ''}` }, 401);
    }

    const kakaoRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    if (!kakaoRes.ok) return json({ error: '카카오 인증 실패' }, 401);
    const kakaoUser = await kakaoRes.json();

    uid = `kakao:${kakaoUser.id}`;
    email = kakaoUser.kakao_account?.email || '';
    displayName = kakaoUser.kakao_account?.profile?.nickname || '';
    photoURL = kakaoUser.kakao_account?.profile?.profile_image_url || '';
    // 전화번호: 카카오는 사업자 인증 후 동의항목 추가 시 제공 (+82 10-xxxx-xxxx 형식)
    const kakaoPhone = kakaoUser.kakao_account?.phone_number || '';
    phone = normalizePhone(kakaoPhone);

  } else if (provider === 'naver') {
    if (!code) return json({ error: 'code가 필요합니다.' }, 400);

    const clientId = env.NAVER_CLIENT_ID;
    const clientSecret = env.NAVER_CLIENT_SECRET;
    if (!clientId || !clientSecret) return json({ error: '네이버 환경 변수가 없습니다.' }, 500);

    const tokenUrl = `https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id=${clientId}&client_secret=${clientSecret}&code=${encodeURIComponent(code)}&state=gwatop`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return json({ error: `네이버 토큰 발급 실패: ${tokenData.error_description || ''}` }, 401);
    }

    const naverRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const naverData = await naverRes.json();
    if (naverData.resultcode !== '00') return json({ error: '네이버 사용자 정보 조회 실패' }, 401);

    const naverUser = naverData.response;
    uid = `naver:${naverUser.id}`;
    email = naverUser.email || '';
    displayName = naverUser.name || naverUser.nickname || '';
    photoURL = naverUser.profile_image || '';
    // 전화번호: 네이버 동의항목에서 휴대전화 추가 시 제공 (010-xxxx-xxxx 형식)
    phone = normalizePhone(naverUser.mobile || '');

  } else {
    return json({ error: '지원하지 않는 소셜 로그인입니다.' }, 400);
  }

  try {
    const customToken = await createFirebaseCustomToken(uid, clientEmail, privateKey);
    return json({ customToken, displayName, email, photoURL, phone });
  } catch (e) {
    return json({ error: `커스텀 토큰 생성 실패: ${e.message}` }, 500);
  }
}

// 전화번호 정규화: 숫자만 추출, 국제번호(+82) → 0으로 변환
function normalizePhone(raw) {
  if (!raw) return '';
  // +82 10-xxxx-xxxx → 01012345678
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('82') && digits.length >= 11) digits = '0' + digits.slice(2);
  return digits;
}

async function createFirebaseCustomToken(uid, clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now,
    exp: now + 3600,
    uid,
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
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sigEncoded = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  return `${signingInput}.${sigEncoded}`;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
