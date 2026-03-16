// ============================================================
// GWATOP - Cloudflare Pages Function v1.0.2
// 복수 문제 유형 지원 + API 키 처리 개선
// ============================================================

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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

  const { text, types, type, count } = body;

  // 단일 type 또는 복수 types 모두 지원
  const selectedTypes = types || (type ? [type] : ['mcq']);
  const validTypes = selectedTypes.filter(t => ['mcq', 'short', 'ox'].includes(t));
  if (validTypes.length === 0) return json({ error: '유효하지 않은 문제 유형입니다.' }, 400);

  if (!text) return json({ error: 'text 파라미터가 필요합니다.' }, 400);
  if (!count || count < 1 || count > 50) return json({ error: '문제 개수는 1~50 사이여야 합니다.' }, 400);

  const truncatedText = text.slice(0, 55000);
  const prompt = buildPrompt(truncatedText, validTypes, Math.min(parseInt(count), 50));

  try {
    const geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.8,
          topP: 0.95,
          maxOutputTokens: 8192,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', geminiRes.status, errText);
      if (geminiRes.status === 429) {
        return json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요. (1~2분 대기)' }, 429);
      }
      return json({ error: `Gemini API 오류 (${geminiRes.status}): ${errText.slice(0, 300)}` }, 502);
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
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        try { quiz = JSON.parse(match[0]); }
        catch { return json({ error: `JSON 파싱 실패. 원문: ${rawText.slice(0, 500)}` }, 502); }
      } else {
        return json({ error: `JSON 없음. 원문: ${rawText.slice(0, 500)}` }, 502);
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

// ─── Build Prompt (복수 타입 지원) ───
function buildPrompt(text, types, count) {
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

  return `당신은 대학교 시험을 전문으로 출제하는 교수입니다.
아래 텍스트를 바탕으로 대학생 수준의 시험 문제 총 ${count}개를 생성해주세요.

[학습 자료]
${text}

[생성할 문제]
${totalDesc}

[각 유형별 형식]
${typeInstructions}

[작성 규칙]
1. 반드시 한국어로 작성하세요.
2. 교재의 핵심 개념과 중요 원리를 다루는 문제를 만드세요.
3. 문제는 서로 중복되지 않아야 합니다.
4. explanation은 왜 정답인지 명확히 설명해야 합니다.
5. 반드시 아래 JSON 형식으로만 응답하세요. 추가 텍스트 없이 순수 JSON만 반환하세요.

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
