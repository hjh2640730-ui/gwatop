// ============================================================
// GWATOP - Short Answer AI Grader
// 주관식 문장형 답안을 Gemini로 채점
// POST { userAnswer, correctAnswer }
// ============================================================

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

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
  const apiKey = env.GEMINI_API_KEY || env['GEMINI_API_KEY '] || '';
  if (!apiKey) return json({ correct: null }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'parse error' }, 400); }

  const { userAnswer, correctAnswer } = body;
  if (!userAnswer || !correctAnswer) return json({ error: 'missing params' }, 400);

  const prompt = `정답: "${correctAnswer}"
학생 답안: "${userAnswer}"

학생 답안이 정답과 같은 의미를 담고 있는지 판단하세요.
판단 기준:
- 핵심 개념/키워드가 모두 포함되어 있으면 정답입니다. 어순, 조사, 어미, 문장 구조가 달라도 됩니다.
  예: "온도 일정, 압력 일정" = "일정한 온도와 압력" = "T와 P가 일정"
  예: "속도가 빨라진다" = "속도 증가" = "빠르게 움직인다"
- 화학식/수식 표기 차이는 동일합니다: PO2=PO₂=P_O2, H2O=H₂O, T=온도, P=압력 등
- 정답에 있는 핵심 개념 중 하나라도 빠지거나 틀린 개념이 있으면 오답입니다.

JSON으로만 응답하세요: {"correct":true} 또는 {"correct":false}`;

  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0,
          maxOutputTokens: 20,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!res.ok) return json({ correct: null }, 502);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const result = JSON.parse(text);
    return json({ correct: !!result.correct });
  } catch {
    return json({ correct: null }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
