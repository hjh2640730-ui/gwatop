// ============================================================
// GWATOP - Cloudflare Pages Function v1.0.0
// Gemini 1.5 Flash를 통한 퀴즈 생성 API
// Environment Variable: GEMINI_API_KEY
// ============================================================

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// ─── OPTIONS (CORS Preflight) ───
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// ─── POST (Generate Quiz) ───
export async function onRequestPost(context) {
  const { request, env } = context;

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return json({ error: 'API 키가 설정되지 않았습니다. Cloudflare Pages 환경 변수를 확인해주세요.' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '요청 본문을 파싱할 수 없습니다.' }, 400);
  }

  const { text, type, count } = body;

  if (!text || !type || !count) {
    return json({ error: '필수 파라미터가 누락되었습니다 (text, type, count).' }, 400);
  }
  if (count < 1 || count > 50) {
    return json({ error: '문제 개수는 1~50 사이여야 합니다.' }, 400);
  }

  const truncatedText = text.slice(0, 55000);
  const prompt = buildPrompt(truncatedText, type, Math.min(parseInt(count), 50));

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
      console.error('Gemini API error:', errText);
      return json({ error: `Gemini API 오류: ${geminiRes.status}` }, 502);
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
      // Try to extract JSON from the text
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        try { quiz = JSON.parse(match[0]); } catch {
          return json({ error: '퀴즈 JSON 파싱 실패. 다시 시도해주세요.' }, 502);
        }
      } else {
        return json({ error: '유효한 퀴즈 데이터를 받지 못했습니다.' }, 502);
      }
    }

    if (!quiz.questions || !Array.isArray(quiz.questions)) {
      return json({ error: '퀴즈 형식이 올바르지 않습니다.' }, 502);
    }

    // Add IDs if missing
    quiz.questions = quiz.questions.map((q, i) => ({ id: i + 1, ...q }));

    return json(quiz, 200);

  } catch (err) {
    console.error('Unexpected error:', err);
    return json({ error: `서버 오류: ${err.message}` }, 500);
  }
}

// ─── Build Prompt ───
function buildPrompt(text, type, count) {
  const typeInstructions = {
    mcq: `객관식 (Multiple Choice) 문제만 생성하세요.
각 문제는 4개의 선택지를 가져야 합니다.
선택지는 반드시 ①, ②, ③, ④ 로 시작해야 합니다.
answer 필드에는 정답 선택지 기호(①, ②, ③, ④ 중 하나)만 입력합니다.
JSON 예시:
{
  "type": "mcq",
  "question": "다음 중 광합성에 필요하지 않은 것은?",
  "options": ["① 이산화탄소", "② 물", "③ 산소", "④ 빛에너지"],
  "answer": "③",
  "explanation": "광합성에는 이산화탄소, 물, 빛에너지가 필요하며 산소는 광합성의 부산물입니다."
}`,

    short: `주관식 (Short Answer) 문제만 생성하세요.
답은 핵심 키워드나 간결한 문장으로 구성해야 합니다.
options 필드는 생략합니다.
JSON 예시:
{
  "type": "short",
  "question": "세포의 에너지 화폐 역할을 하는 물질은 무엇인가?",
  "answer": "ATP (아데노신 삼인산)",
  "explanation": "ATP는 세포 내 에너지 저장 및 전달에 사용되는 주요 물질입니다."
}`,

    ox: `OX 퀴즈만 생성하세요.
각 문제는 참(O) 또는 거짓(X)으로 답할 수 있는 진술문이어야 합니다.
answer 필드에는 "O" 또는 "X"만 입력합니다.
options 필드는 생략합니다.
JSON 예시:
{
  "type": "ox",
  "question": "미토콘드리아는 세포의 핵 안에 존재한다.",
  "answer": "X",
  "explanation": "미토콘드리아는 세포질 내에 존재하며, 핵 안에 있지 않습니다."
}`
  };

  return `당신은 대학교 시험을 전문으로 출제하는 교수입니다.
아래 텍스트를 바탕으로 대학생 수준의 시험 문제 ${count}개를 생성해주세요.

[학습 자료]
${text}

[문제 유형 및 형식]
${typeInstructions[type] || typeInstructions.mcq}

[작성 규칙]
1. 반드시 한국어로 작성하세요.
2. 교재의 핵심 개념, 중요 사실, 원리를 다루는 문제를 만드세요.
3. 너무 쉽거나 너무 어렵지 않은 적절한 난이도를 유지하세요.
4. 문제는 서로 중복되지 않아야 합니다.
5. 설명(explanation)은 왜 정답인지 명확하게 설명해야 합니다.
6. 반드시 아래 JSON 형식으로만 응답하세요. 추가 텍스트 없이 순수 JSON만 반환하세요.

[응답 형식]
{
  "questions": [
    ${typeInstructions[type]?.includes('mcq') ? '{ "type": "mcq", "question": "...", "options": ["① ...", "② ...", "③ ...", "④ ..."], "answer": "①", "explanation": "..." }' : ''}
  ]
}

정확히 ${count}개의 문제를 생성하세요.`;
}

// ─── Helper ───
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}
