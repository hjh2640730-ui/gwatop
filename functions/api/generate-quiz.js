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

  const { text, images, types, type, count, lang } = body;
  const language = lang === 'en' ? 'en' : 'ko';

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
  const prompt = buildPrompt(truncatedText, validTypes, Math.min(parseInt(count), 50), isVisionMode, language);

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
      system_instruction: {
        parts: [{ text: '당신은 국가 수준의 시험을 10년 이상 출제해온 대학교수이자 교육평가 전문가입니다. 단순 암기 문제가 아닌, 학생의 진짜 이해도와 적용 능력을 정밀하게 측정하는 문제를 출제합니다. 출제한 모든 문제는 교육 전문가의 검토를 통과할 수 있는 수준이어야 합니다.' }]
      },
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.4,
        topP: 0.9,
        maxOutputTokens: 16384,
        thinkingConfig: { thinkingBudget: isVisionMode ? 14000 : 10000 },
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
function buildPrompt(text, types, count, isVisionMode = false, language = 'ko') {
  const distribution = distributeCount(count, types);

  const typeDescriptions = {
    mcq: (n) => `
▶ 객관식(mcq) ${n}개
형식: {"type":"mcq","question":"...","options":["① ...","② ...","③ ...","④ ..."],"answer":"②","explanation":"..."}
- 선지는 ①②③④ 형식, answer는 "①"~"④" 중 하나
- 오답 선지 필수 조건:
  · 각 오답은 학생들이 자주 범하는 구체적 오개념을 반영할 것
  · 정답과 미묘하게 다른 개념을 활용하여 단순히 '명백히 틀린' 선지를 만들지 말 것
  · "모두 맞다", "모두 틀리다", "해당 없음" 등의 선지 절대 금지
  · 선지 길이가 비슷해야 함 (정답만 유독 길거나 짧으면 안 됨)
  · 선지 순서: 수치면 오름차순, 개념이면 논리적 순서`,

    short: (n) => `
▶ 주관식(short) ${n}개
형식: {"type":"short","question":"...","answer":"...","explanation":"..."}
- answer는 핵심 개념어 또는 명확한 단문(정답이 하나로 수렴해야 함)
- 정답이 2가지 이상 가능한 문제 금지
- options 필드 없음`,

    ox: (n) => `
▶ OX퀴즈(ox) ${n}개
형식: {"type":"ox","question":"...","answer":"O","explanation":"..."}
- 참/거짓이 100% 명확한 진술문만 사용
- 부분적으로만 맞거나 모호한 진술 금지
- answer는 "O" 또는 "X"
- options 필드 없음`
  };

  const typeInstructions = types.map(t => typeDescriptions[t](distribution[t])).join('\n');
  const totalDesc = types.map(t => `${typeLabels[t]} ${distribution[t]}개`).join(', ');

  const visionNote = isVisionMode
    ? `첨부된 PDF 페이지 이미지들을 면밀히 분석하여 수식, 도표, 그래프, 계산 과정을 포함한 문제를 출제하세요.${text ? '\n추출된 텍스트도 함께 참고하세요.' : ''}
이미지를 직접 보고 풀어야 하는 문제에는 반드시 "imageIndex": N (0부터 시작하는 이미지 순서 번호)을 포함하세요.\n`
    : '';

  const textSection = text ? `━━━ 학습 자료 ━━━\n${text}\n━━━━━━━━━━━━━━━━\n\n` : '';
  const langRule = language === 'en'
    ? 'L1. ALL text (questions, options, answers, explanations) must be in English.'
    : 'L1. 모든 내용을 반드시 한국어로 작성하세요.';

  return `${isVisionMode ? '첨부된 PDF 이미지와 텍스트 자료' : '아래 학습 자료'}를 바탕으로 대학생 수준의 고품질 시험 문제 ${count}개를 생성하세요.

${visionNote}${textSection}━━━ 생성할 문제 구성 ━━━
${totalDesc} (총 ${count}개)

━━━ 유형별 형식 ━━━
${typeInstructions}

━━━ 문제 품질 기준 (반드시 준수) ━━━
${langRule}
L2. 【인지 수준 분배】전체 문제 중:
   - 단순 암기(정의·용어 재현): 최대 30%
   - 이해·적용(개념 설명, 다른 상황에 적용): 최소 40%
   - 분석·평가(원인 분석, 비교·판단, 계산 해석): 최소 30%
L3. 【내용 범위】학습 자료 전체를 고르게 다루세요. 한 주제에만 집중하지 마세요.
L4. 【문제 독립성】각 문제는 다른 문제를 풀지 않아도 독립적으로 풀 수 있어야 합니다.
L5. 【중복 금지】동일 개념을 묻는 문제를 반복 출제하지 마세요.
L6. 【question 작성 규칙】
   - 마크다운 형식: 표는 | col | col | 형식, 강조는 **굵게**
   - 수식·공식·풀이 과정을 문제 본문에 직접 넣지 말 것 (학생이 알고 있어야 하는 내용)
   - [자료], [조건], [보기] 같은 대괄호 레이블 사용 금지
   - 선지 번호(①②③④)를 question 안에 넣지 말 것 (options 배열에만)
   ※ 단, 숫자/수치 데이터가 담긴 표는 포함 가능
L7. 【explanation 작성 규칙】
   - 단순히 "정답은 ~이다" 반복 금지
   - 정답인 이유를 원리·메커니즘 중심으로 설명할 것
   - 객관식: 각 선지(①②③④)마다 맞고 틀린 이유를 반드시 \\n\\n으로 구분하여 개별 설명
     예: "① ~이므로 옳다.\\n\\n② ~이므로 틀리다. ~의 개념과 혼동하기 쉬운데...\\n\\n③ ..."
   - 관련 핵심 개념이나 원리를 해설에 포함하여 학습 가이드 역할을 하게 할 것${isVisionMode ? `
L8. 【이미지 참조】이미지를 보고 풀어야 하는 문제:
   - "imageIndex": N 필드 필수 (N은 0부터 시작)
   - question에 "위 그래프/표/그림을 참고하여..." 참조 문구 포함
   - 이미지 없이도 풀 수 있는 문제에는 imageIndex 넣지 말 것` : ''}

━━━ JSON 출력 형식 ━━━
- 순수 JSON만 반환 (```나 추가 텍스트 일절 금지)
- 문자열 내 줄바꿈: \\n 사용 (실제 개행 문자 금지)
- 쌍따옴표: \\" 로 이스케이프

{"questions": [ ...${count}개의 문제 객체... ]}

정확히 ${count}개를 생성하세요.`;
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
