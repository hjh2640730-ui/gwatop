// ============================================================
// GWATOP - Automated Alert API
// 매일 임계값 확인 후 이메일 알림 발송
// GET /api/alert?secret=ALERT_SECRET
// 환경변수: RESEND_API_KEY, ALERT_SECRET
// cron-job.org에서 매일 오전 9시 KST 호출
// ============================================================

const PROJECT_ID = 'gwatop-8edaf';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const ADMIN_EMAIL = 'hjh2640730@gmail.com';
const ALERT_COOLDOWN_MS = 20 * 60 * 60 * 1000; // 20시간 (하루 1회 방지)
const KV_LAST_ALERT_KEY = 'alert_last_sent';

let _cachedToken = null, _tokenExpiry = 0;

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

async function queryCount(accessToken, filters) {
  const query = { from: [{ collectionId: filters.collection }], limit: filters.limit || 500 };
  if (filters.where) query.where = filters.where;
  const res = await fetch(`${FIRESTORE_BASE}:runQuery`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: query }),
  });
  if (!res.ok) return 0;
  const docs = await res.json();
  return docs.filter(d => d.document).length;
}

function calcFirebaseMonthlyKRW(dailyReads, dailyWrites) {
  const monthlyReads = dailyReads * 30;
  const monthlyWrites = dailyWrites * 30;
  const readsCost = Math.max(0, monthlyReads - 1500000) / 100000 * 90;
  const writesCost = Math.max(0, monthlyWrites - 600000) / 100000 * 270;
  return Math.round(readsCost + writesCost);
}

function getRoadmapStage(data) {
  const { estimatedDailyReads, totalPosts, firebaseMonthlyKRW } = data;
  const readRatio = estimatedDailyReads / 50000;
  if (firebaseMonthlyKRW > 150000) return 3;
  if (firebaseMonthlyKRW > 100000 || readRatio > 0.8) return 2;
  if (readRatio > 0.6 || totalPosts > 7000) return 1;
  return 0;
}

function buildEmailHtml(alerts, data, stage) {
  const stageNames = ['초기 단계', '성장 주의', '유료 전환 필요', '서버 이전 필요'];
  const stageColors = ['#22c55e', '#f59e0b', '#ef4444', '#7c3aed'];
  const stageName = stageNames[stage];
  const stageColor = stageColors[stage];

  const todayKST = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(new Date());

  const criticals = alerts.filter(a => a.level === 'critical');
  const warnings = alerts.filter(a => a.level === 'warning');

  const alertRows = alerts.map(a => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">
        <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;background:${a.level === 'critical' ? '#fee2e2' : '#fef3c7'};color:${a.level === 'critical' ? '#dc2626' : '#d97706'};">
          ${a.level === 'critical' ? '위험' : '주의'}
        </span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#374151;">${a.message}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#6b7280;">${a.action}</td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:640px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 8px rgba(0,0,0,0.08);">

    <!-- 헤더 -->
    <div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:28px 32px;">
      <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px;">GWATOP 서비스 알림</div>
      <div style="font-size:13px;color:#94a3b8;margin-top:6px;">${todayKST} 기준</div>
    </div>

    <!-- 로드맵 단계 -->
    <div style="padding:20px 32px;border-bottom:1px solid #f0f0f0;background:#fafafa;">
      <div style="font-size:13px;color:#6b7280;margin-bottom:4px;">현재 서비스 단계</div>
      <div style="display:inline-block;padding:6px 16px;border-radius:20px;background:${stageColor};color:#fff;font-size:14px;font-weight:600;">
        ${stage}단계 · ${stageName}
      </div>
    </div>

    <!-- 지표 요약 -->
    <div style="padding:20px 32px;border-bottom:1px solid #f0f0f0;">
      <div style="font-size:14px;font-weight:600;color:#374151;margin-bottom:12px;">오늘 지표</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        <div style="background:#f8fafc;border-radius:8px;padding:12px 16px;">
          <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">예상 일일 읽기</div>
          <div style="font-size:16px;font-weight:700;color:#1e293b;">${data.estimatedDailyReads.toLocaleString()}</div>
        </div>
        <div style="background:#f8fafc;border-radius:8px;padding:12px 16px;">
          <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">게시글 수</div>
          <div style="font-size:16px;font-weight:700;color:#1e293b;">${data.totalPosts.toLocaleString()}</div>
        </div>
        <div style="background:#f8fafc;border-radius:8px;padding:12px 16px;">
          <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">예상 월 비용</div>
          <div style="font-size:16px;font-weight:700;color:#1e293b;">₩${data.firebaseMonthlyKRW.toLocaleString()}</div>
        </div>
      </div>
    </div>

    <!-- 알림 목록 -->
    ${alerts.length > 0 ? `
    <div style="padding:20px 32px;border-bottom:1px solid #f0f0f0;">
      <div style="font-size:14px;font-weight:600;color:#374151;margin-bottom:12px;">
        알림 ${criticals.length > 0 ? `<span style="color:#dc2626;">위험 ${criticals.length}건</span>` : ''}
        ${warnings.length > 0 ? `<span style="color:#d97706;"> 주의 ${warnings.length}건</span>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:500;width:60px;">수준</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:500;">내용</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:500;">조치</th>
          </tr>
        </thead>
        <tbody>${alertRows}</tbody>
      </table>
    </div>
    ` : `
    <div style="padding:24px 32px;border-bottom:1px solid #f0f0f0;text-align:center;">
      <div style="font-size:32px;margin-bottom:8px;">✅</div>
      <div style="font-size:15px;color:#374151;font-weight:500;">모든 지표가 정상입니다</div>
      <div style="font-size:13px;color:#9ca3af;margin-top:4px;">임계값을 초과한 항목이 없습니다.</div>
    </div>
    `}

    <!-- 관리자 페이지 링크 -->
    <div style="padding:20px 32px;">
      <a href="https://gwatop.pages.dev/admin.html" style="display:inline-block;padding:10px 20px;background:#1e293b;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:500;">
        관리자 페이지에서 자세히 보기 →
      </a>
    </div>

    <!-- 푸터 -->
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #f0f0f0;">
      <div style="font-size:12px;color:#9ca3af;">
        이 메일은 cron-job.org를 통해 매일 자동 발송됩니다. · GWATOP 서비스 모니터링
      </div>
    </div>

  </div>
</body>
</html>
  `.trim();
}

async function sendEmail(resendApiKey, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'GWATOP 알림 <onboarding@resend.dev>',
      to: [ADMIN_EMAIL],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend 발송 실패: ${err}`);
  }
  return await res.json();
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');

  if (!env.ALERT_SECRET || secret !== env.ALERT_SECRET) {
    return json({ error: '인증 실패' }, 401);
  }

  // 쿨다운 체크 (20시간 이내 재발송 방지)
  const kv = env.GWATOP_CACHE;
  if (kv) {
    const lastSent = await kv.get(KV_LAST_ALERT_KEY, 'json');
    if (lastSent && Date.now() - lastSent.ts < ALERT_COOLDOWN_MS) {
      return json({ skipped: true, reason: '쿨다운 중', nextAt: new Date(lastSent.ts + ALERT_COOLDOWN_MS).toISOString() });
    }
  }

  // Firebase 토큰
  let accessToken;
  try {
    accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
  } catch (e) {
    return json({ error: `Firebase 인증 실패: ${e.message}` }, 500);
  }

  // 오늘 날짜 (KST)
  const todayKST = new Intl.DateTimeFormat('sv', { timeZone: 'Asia/Seoul' }).format(new Date());
  const todayStartISO = new Date(`${todayKST}T00:00:00+09:00`).toISOString();

  // 지표 수집
  const [activeGames, waitingRooms, todayGames, totalPosts, todayQuizzes] = await Promise.all([
    queryCount(accessToken, {
      collection: 'games',
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            { fieldFilter: { field: { fieldPath: 'status' }, op: 'NOT_EQUAL', value: { stringValue: 'waiting' } } },
            { fieldFilter: { field: { fieldPath: 'status' }, op: 'NOT_EQUAL', value: { stringValue: 'finished' } } },
            { fieldFilter: { field: { fieldPath: 'status' }, op: 'NOT_EQUAL', value: { stringValue: 'cancelled' } } },
          ],
        },
      },
      limit: 500,
    }),
    queryCount(accessToken, {
      collection: 'games',
      where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'waiting' } } },
      limit: 200,
    }),
    queryCount(accessToken, {
      collection: 'games',
      where: { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: todayStartISO } } },
      limit: 500,
    }),
    queryCount(accessToken, { collection: 'community_posts', where: null, limit: 500 }),
    queryCount(accessToken, {
      collection: 'quizzes',
      where: { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: todayStartISO } } },
      limit: 500,
    }),
  ]);

  const estimatedDailyReads = Math.max(waitingRooms * 2, activeGames) * 144;
  const estimatedDailyWrites = todayGames * 8;
  const estimatedDailyKvReads = Math.max(waitingRooms * 2, activeGames) * 144;
  const firebaseMonthlyKRW = calcFirebaseMonthlyKRW(estimatedDailyReads, estimatedDailyWrites);

  const data = { activeGames, waitingRooms, todayGames, totalPosts, todayQuizzes, estimatedDailyReads, estimatedDailyWrites, estimatedDailyKvReads, firebaseMonthlyKRW };

  // 경고 수집
  const alerts = [];

  if (activeGames > 300) {
    alerts.push({ level: 'critical', message: `동시 게임 ${activeGames}판`, action: 'Firestore 구조 재설계 필요. 개발자에게 문의하세요.' });
  } else if (activeGames > 100) {
    alerts.push({ level: 'warning', message: `동시 게임 ${activeGames}판`, action: '300판 초과 시 재설계가 필요합니다.' });
  }

  if (waitingRooms > 30) {
    alerts.push({ level: 'warning', message: `대기방 ${waitingRooms}개 누적`, action: 'cron-job.org cleanup 주기를 5분으로 단축하세요.' });
  }

  if (estimatedDailyReads > 40000) {
    alerts.push({ level: 'critical', message: `Firestore 읽기 ~${estimatedDailyReads.toLocaleString()}회 (한도 80% 초과)`, action: 'Firebase Blaze 플랜 확인 또는 폴링 간격 조정 필요.' });
  } else if (estimatedDailyReads > 30000) {
    alerts.push({ level: 'warning', message: `Firestore 읽기 ~${estimatedDailyReads.toLocaleString()}회 (한도 60% 초과)`, action: 'Firebase 콘솔 → 사용량 탭에서 실제 읽기 수 확인.' });
  }

  if (estimatedDailyWrites > 16000) {
    alerts.push({ level: 'critical', message: `Firestore 쓰기 ~${estimatedDailyWrites.toLocaleString()}회 (한도 80% 초과)`, action: 'Firebase Blaze 플랜 확인. 초과분은 자동 과금됩니다.' });
  } else if (estimatedDailyWrites > 12000) {
    alerts.push({ level: 'warning', message: `Firestore 쓰기 ~${estimatedDailyWrites.toLocaleString()}회 (한도 60% 초과)`, action: 'Firebase 콘솔 → 사용량 탭에서 실제 쓰기 수 확인.' });
  }

  if (totalPosts > 9000) {
    alerts.push({ level: 'critical', message: `게시글 ${totalPosts}개 (Algolia 한도 90% 초과)`, action: 'Algolia → Firestore 검색 교체 즉시 필요. 개발자에게 문의하세요.' });
  } else if (totalPosts > 7000) {
    alerts.push({ level: 'warning', message: `게시글 ${totalPosts}개 (Algolia 한도 70% 초과)`, action: 'Algolia 대시보드 확인 및 교체 시점 준비.' });
  }

  if (todayQuizzes > 300) {
    alerts.push({ level: 'warning', message: `오늘 퀴즈 ${todayQuizzes}개 (Gemini 사용량 높음)`, action: 'Google AI Studio에서 할당량 현황 확인.' });
  }

  if (estimatedDailyKvReads > 80000) {
    alerts.push({ level: 'critical', message: `KV 읽기 ~${estimatedDailyKvReads.toLocaleString()}회 (한도 80% 초과)`, action: 'Cloudflare Workers Paid 플랜($5/월)으로 업그레이드 필요.' });
  } else if (estimatedDailyKvReads > 60000) {
    alerts.push({ level: 'warning', message: `KV 읽기 ~${estimatedDailyKvReads.toLocaleString()}회 (한도 60% 초과)`, action: 'Cloudflare Workers Paid 플랜 업그레이드 준비.' });
  }

  // 로드맵 단계
  if (firebaseMonthlyKRW > 150000) {
    alerts.push({ level: 'critical', message: `Firebase 월 비용 ₩${firebaseMonthlyKRW.toLocaleString()} (3단계 초과)`, action: '자체 서버 이전을 지금 바로 시작해야 합니다. 개발자에게 문의하세요.' });
  } else if (firebaseMonthlyKRW > 100000) {
    alerts.push({ level: 'warning', message: `Firebase 월 비용 ₩${firebaseMonthlyKRW.toLocaleString()} (2단계 진입)`, action: '자체 서버 이전 계획을 세우세요. 이전에 2-3개월이 소요됩니다.' });
  }

  const stage = getRoadmapStage(data);
  const hasCritical = alerts.some(a => a.level === 'critical');
  const hasWarning = alerts.some(a => a.level === 'warning');

  // 경고 없으면 이메일 발송 안 함 (정상 시 매일 보내지 않음)
  if (!hasCritical && !hasWarning) {
    return json({ sent: false, reason: '정상 범위 — 이메일 발송 없음', data });
  }

  // 이메일 발송
  if (!env.RESEND_API_KEY) {
    return json({ error: 'RESEND_API_KEY 환경변수 없음', alerts }, 500);
  }

  const subjectEmoji = hasCritical ? '🚨' : '⚠️';
  const subjectLevel = hasCritical ? '위험' : '주의';
  const subject = `${subjectEmoji} GWATOP 서비스 ${subjectLevel} — ${alerts.length}개 항목 확인 필요`;
  const html = buildEmailHtml(alerts, data, stage);

  try {
    const result = await sendEmail(env.RESEND_API_KEY, subject, html);
    // 쿨다운 기록
    if (kv) await kv.put(KV_LAST_ALERT_KEY, JSON.stringify({ ts: Date.now(), alertCount: alerts.length }), { expirationTtl: 86400 });
    return json({ sent: true, emailId: result.id, alertCount: alerts.length, stage, data });
  } catch (e) {
    return json({ error: e.message, alerts }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
