// ============================================================
// GWATOP - Cloudflare Pages Function v1.0.2
// 복수 문제 유형 지원 + API 키 처리 개선
// ============================================================

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const PROJECT_ID = 'gwatop-8edaf';
const RATE_LIMIT_SECONDS = 30;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// 디버그용 (사용 가능한 Gemini 모델 목록 확인)
export async function onRequestGet(context) {
  const { env } = context;
  const apiKey = env.GEMINI_API_KEY || env['GEMINI_API_KEY '] || '';
  if (!apiKey) return new Response(JSON.stringify({ error: 'no key' }), { status: 200, headers: CORS_HEADERS });
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const data = await res.json();
  const models = (data.models || []).map(m => m.name);
  return new Response(JSON.stringify({ models }), { status: 200, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // API 키 확인 (공백 포함 키 이름도 처리)
  const apiKey = env.GEMINI_API_KEY || env['GEMINI_API_KEY '] || env.gemini_api_key || '';
  if (!apiKey) {
    return json({
      error: 'GEMINI_API_KEY 환경 변수가 설정되지 않았습니다. Cloudflare Pages → 설정 → 환경 변수를 확인해주세요.'
    }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '요청 본문을 파싱할 수 없습니다.' }, 400);
  }

  // ─── Rate Limiting (idToken 기반, 유저당 30초 제한) ───
  const { idToken } = body;
  if (idToken && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    try {
      const tokenPayload = decodeJWT(idToken);
      const uid = tokenPayload?.user_id || tokenPayload?.sub;
      if (uid) {
        const rateLimitResult = await checkAndUpdateRateLimit(uid, env);
        if (!rateLimitResult.allowed) {
          return json({ error: `요청이 너무 빠릅니다. ${rateLimitResult.waitSeconds}초 후 다시 시도해주세요.` }, 429);
        }
      }
    } catch { /* rate limit 실패 시 통과 허용 */ }
  }

  const { text, images, types, type, count } = body;

  // 단일 type 또는 복수 types 모두 지원
  const selectedTypes = types || (type ? [type] : ['mcq']);
  const validTypes = selectedTypes.filter(t => ['mcq', 'short', 'ox'].includes(t));
  if (validTypes.length === 0) return json({ error: '유효하지 않은 문제 유형입니다.' }, 400);

  const hasText = text && text.length >= 50;
  const hasImages = Array.isArray(images) && images.length > 0;
  if (!hasText && !hasImages) return json({ error: 'text 또는 images 파라미터가 필요합니다.' }, 400);
  if (!count || count < 1 || count > 50) return json({ error: '문제 개수는 1~50 사이여야 합니다.' }, 400);

  // 이미지 수 제한 (보안 + 비용 제어)
  const safeImages = hasImages ? images.slice(0, 20) : [];
  const isVisionMode = safeImages.length > 0;

  const truncatedText = hasText ? text.slice(0, 55000) : '';
  const prompt = buildPrompt(truncatedText, validTypes, Math.min(parseInt(count), 50), isVisionMode);

  try {
    // Vision 모드: 이미지를 parts 앞에 삽입
    const parts = [];
    if (isVisionMode) {
      safeImages.forEach(img => {
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: img } });
      });
    }
    parts.push({ text: prompt });

    const geminiBody = JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.7,
        topP: 0.95,
        maxOutputTokens: 8192,
        // Vision 모드: 수식/도표 해석을 위해 약간의 thinking 허용
        thinkingConfig: { thinkingBudget: isVisionMode ? 1024 : 0 },
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    });

    // 최대 3회 시도 (429 시 지수 백오프: 4s → 8s)
    const delays = [4000, 8000];
    let geminiRes;
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: geminiBody,
      });
      if (geminiRes.status !== 429 || attempt === delays.length) break;
      await new Promise(r => setTimeout(r, delays[attempt]));
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', geminiRes.status, errText);
      if (geminiRes.status === 429) {
        return json({ error: '서버가 혼잡합니다. 1~2분 후 다시 시도해주세요.' }, 429);
      }
      console.error('Gemini API error detail:', geminiRes.status, errText.slice(0, 300));
      return json({ error: '퀴즈 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' }, 502);
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return json({ error: 'Gemini API로부터 응답을 받지 못했습니다.' }, 502);
    }

    let quiz;
    try {
      quiz = JSON.parse(rawText);
    } catch {
      // JSON 블록 추출 후 재시도
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          quiz = JSON.parse(match[0]);
        } catch {
          // 문자열 내 실제 줄바꿈을 \\n으로 치환 후 재시도
          try {
            const fixed = match[0].replace(/("(?:[^"\\]|\\.)*")/g, (m) =>
              m.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
            );
            quiz = JSON.parse(fixed);
          } catch {
            console.error('JSON 파싱 실패. 원문:', rawText.slice(0, 500));
            return json({ error: '퀴즈 데이터 형식 오류입니다. 다시 시도해주세요.' }, 502);
          }
        }
      } else {
        console.error('JSON 없음. 원문:', rawText.slice(0, 500));
        return json({ error: '퀴즈 생성 결과를 읽지 못했습니다. 다시 시도해주세요.' }, 502);
      }
    }

    if (!quiz.questions || !Array.isArray(quiz.questions)) {
      return json({ error: '퀴즈 형식이 올바르지 않습니다.' }, 502);
    }

    quiz.questions = quiz.questions.map((q, i) => ({ id: i + 1, ...q }));
    return json(quiz, 200);

  } catch (err) {
    console.error('Unexpected error:', err);
    return json({ error: `서버 오류: ${err.message}` }, 500);
  }
}

// ─── Rate Limit Helpers ───
function decodeJWT(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const parsed = JSON.parse(decoded);
    // 만료된 토큰 거부
    const now = Math.floor(Date.now() / 1000);
    if (parsed.exp && parsed.exp < now) return null;
    return parsed;
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
  if (!tokenData.access_token) throw new Error('Firebase 액세스 토큰 발급 실패');
  return tokenData.access_token;
}

async function checkAndUpdateRateLimit(uid, env) {
  const accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
  const docUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/quiz_rate_limits/${uid}`;
  const headers = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

  // 현재 rate limit 문서 조회
  const getRes = await fetch(docUrl, { headers });
  if (getRes.ok) {
    const data = await getRes.json();
    const lastSec = parseInt(data.fields?.lastRequestAt?.integerValue || 0);
    const nowSec = Math.floor(Date.now() / 1000);
    const elapsed = nowSec - lastSec;
    if (elapsed < RATE_LIMIT_SECONDS) {
      return { allowed: false, waitSeconds: RATE_LIMIT_SECONDS - elapsed };
    }
  }

  // 타임스탬프 업데이트
  const nowSec = Math.floor(Date.now() / 1000);
  await fetch(`${docUrl}?updateMask.fieldPaths=lastRequestAt`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: { lastRequestAt: { integerValue: String(nowSec) } } }),
  });
  return { allowed: true };
}

// ─── Build Prompt (복수 타입 지원, Vision 모드 포함) ───
function buildPrompt(text, types, count, isVisionMode = false) {
  // 각 타입별 문제 수 분배
  const distribution = distributeCount(count, types);

  const typeDescriptions = {
    mcq: (n) => `
객관식 ${n}개:
- 4개의 선택지 (①②③④ 형식)
- answer: "①" ~ "④" 중 하나
- 예: {"type":"mcq","question":"...","options":["① ...","② ...","③ ...","④ ..."],"answer":"②","explanation":"..."}`,

    short: (n) => `
주관식 ${n}개:
- 핵심 키워드 또는 간결한 문장으로 답
- options 필드 없음
- 예: {"type":"short","question":"...","answer":"...","explanation":"..."}`,

    ox: (n) => `
OX 퀴즈 ${n}개:
- 참/거짓 판별 진술문
- answer: "O" 또는 "X"
- options 필드 없음
- 예: {"type":"ox","question":"...","answer":"O","explanation":"..."}`
  };

  const typeInstructions = types.map(t => typeDescriptions[t](distribution[t])).join('\n');
  const totalDesc = types.map(t => `${typeLabels[t]} ${distribution[t]}개`).join(', ');

  const visionNote = isVisionMode
    ? `위에 첨부된 PDF 페이지 이미지들을 분석하여 수식, 도표, 그래프, 계산 과정을 포함한 문제를 출제하세요.${text ? '\n아래 추출된 텍스트도 함께 참고하세요.' : ''}\n`
    : '';

  const textSection = text
    ? `[학습 자료]\n${text}\n\n`
    : '';

  return `당신은 대학교 시험을 전문으로 출제하는 교수입니다.
${isVisionMode ? '첨부된 PDF 이미지와 텍스트 자료' : '아래 텍스트'}를 바탕으로 대학생 수준의 시험 문제 총 ${count}개를 생성해주세요.

${visionNote}${textSection}[생성할 문제]
${totalDesc}

[각 유형별 형식]
${typeInstructions}

[작성 규칙]
1. 반드시 한국어로 작성하세요.
2. 교재의 핵심 개념과 중요 원리를 다루는 문제를 만드세요.
3. 수식, 계산, 도표가 있다면 해당 내용을 문제에 반영하세요.
4. 문제는 서로 중복되지 않아야 합니다.
5. explanation은 왜 정답인지 명확히 설명해야 합니다.
6. 반드시 아래 JSON 형식으로만 응답하세요. 추가 텍스트 없이 순수 JSON만 반환하세요.
7. question 필드는 마크다운 형식으로 작성하세요:
   - 표 형태의 자료는 반드시 마크다운 표(| 헤더 | 헤더 | 형식)로 작성하세요.
   - 수식은 **굵게** 형식으로 강조하세요.
   - 자료, 조건 등 구분이 필요한 항목은 **[자료]** 처럼 굵게 표시하고 줄바꿈으로 구분하세요.
8. question 필드에 절대 포함하지 말아야 할 것:
   - 공식, 수식, 계산 방법, 풀이 과정 (예: E(r) = Σ..., σ(r) = ... 같은 수식)
     → 학생이 직접 알고 있어야 하는 내용이므로 절대 문제에 제시하지 마세요.
   - [계산 과정], [공식], [풀이] 등 원문에 있는 공식 섹션도 그대로 복사하지 마세요.
   - 선지 번호 (①②③④ 또는 A/B/C/D 등). 선지는 반드시 options 배열에만 넣으세요.
   ※ 단, 숫자 데이터가 담긴 표나 [자료] 섹션은 포함해도 됩니다.
9. JSON 형식 주의사항:
   - JSON 문자열 값 안의 줄바꿈은 반드시 \\n으로 표시하세요 (실제 줄바꿈 문자 사용 금지)
   - 쌍따옴표(")는 반드시 \\"로 이스케이프하세요.

[응답 형식]
{"questions": [ ...문제 배열... ]}

정확히 총 ${count}개의 문제를 생성하세요.`;
}

const typeLabels = { mcq: '객관식', short: '주관식', ox: 'OX 퀴즈' };

function distributeCount(total, types) {
  const result = {};
  const base = Math.floor(total / types.length);
  let remainder = total - base * types.length;
  types.forEach(t => {
    result[t] = base + (remainder-- > 0 ? 1 : 0);
  });
  return result;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}
