// ============================================================
// GWATOP - Quiz Page Logic v1.0.0
// 퀴즈 UI, 진행, 결과, 오답 노트
// ============================================================

import { onUserChange } from './auth.js';
import { loadPendingQuiz, clearPendingQuiz, saveQuiz, updateQuizScore, scrapQuestion, unscrapQuestion } from './db.js';
import { checkAndShowNicknameModal } from './nickname.js';
import { marked } from 'https://esm.sh/marked@11';

// ─── State ───
let questions = [];
let currentIdx = 0;
let correctCount = 0;
let wrongAnswers = [];
let currentAnswer = null;
let answered = false;
let quizMeta = null;
let savedQuizId = null;
let currentUser = null;
let scrappedMap = new Map(); // questionIdx → scrapId

// ─── Streaming State ───
let generatingMore = false;
let waitingForQuestions = false;
let pendingStreamingRemainder = null;

// ─── Per-question answered state ───
// idx → { isCorrect, userAnswer }
let answeredState = {};


// ─── DOM ───
const quizTopbar = document.getElementById('quiz-topbar');
const quizArea = document.getElementById('quiz-area');
const resultsArea = document.getElementById('results-area');
const noQuizArea = document.getElementById('no-quiz-area');
const progressFill = document.getElementById('progress-fill');
const quizCounter = document.getElementById('quiz-counter');
const quizCard = document.getElementById('quiz-card');
const typeBadge = document.getElementById('type-badge');
const questionText = document.getElementById('question-text');
const mcqOptions = document.getElementById('mcq-options');
const oxOptions = document.getElementById('ox-options');
const shortOptions = document.getElementById('short-options');
const shortInput = document.getElementById('short-input');
const submitBtn = document.getElementById('submit-btn');
const nextBtn = document.getElementById('next-btn');
const prevBtn = document.getElementById('prev-btn');
const correctAnswerBox = document.getElementById('correct-answer-box');
const explanationBox = document.getElementById('explanation-box');
const explanationText = document.getElementById('explanation-text');
const feedbackOverlay = document.getElementById('feedback-overlay');
const quitBtn = document.getElementById('quit-btn');
const quitModal = document.getElementById('quit-modal');

// ─── Init ───
async function init() {
  setupNav();

  const data = loadPendingQuiz();
  if (!data || !data.questions || data.questions.length === 0) {
    showArea('no-quiz');
    return;
  }

  quizMeta = data;
  questions = data.questions;

  // 나머지 배치 생성 예약 (auth 확인 후 시작)
  if (data.streamingRemainder?.count > 0) {
    pendingStreamingRemainder = data.streamingRemainder;
    generatingMore = true;
  }

  // Save quiz to IndexedDB early
  savedQuizId = await saveQuiz(data.uid || '', data.docId, data.docName, data.questions, data.type, 0);

  showArea('quiz');
  renderQuestion(0);
  setupControls();
}

// ─── Nav ───
function setupNav() {
  document.getElementById('nav-login-btn')?.addEventListener('click', () => {
    window.location.href = '/';
  });
  onUserChange((user, userData) => {
    currentUser = user;
    const lo = document.getElementById('nav-auth-logged-out');
    const li = document.getElementById('nav-auth-logged-in');
    if (user) {
      lo.style.display = 'none';
      li.style.display = 'flex';
      document.getElementById('nav-avatar').src = user.photoURL || '';
      document.getElementById('nav-username').textContent = userData?.nickname || user.displayName || user.email || '';
      checkAndShowNicknameModal(user, userData);

      // 백그라운드 나머지 문제 생성 시작
      if (pendingStreamingRemainder) {
        const r = pendingStreamingRemainder;
        pendingStreamingRemainder = null;
        fetchRemainingQuestions(user, r);
      }
    } else {
      lo.style.display = '';
      li.style.display = 'none';
    }
  });
}

// ─── Show/Hide Areas ───
function showArea(area) {
  quizTopbar.style.display = 'none';
  quizArea.style.display = 'none';
  resultsArea.style.display = 'none';
  noQuizArea.style.display = 'none';

  if (area === 'quiz') {
    quizTopbar.style.display = '';
    quizArea.style.display = '';
  } else if (area === 'results') {
    resultsArea.style.display = '';
  } else if (area === 'no-quiz') {
    noQuizArea.style.display = '';
  }
}

// ─── Render Question ───
function renderQuestion(idx) {
  const q = questions[idx];
  if (!q) return;

  // Progress
  const pct = Math.round((idx / questions.length) * 100);
  progressFill.style.width = `${pct}%`;
  const totalLabel = generatingMore ? `${questions.length}+` : questions.length;
  quizCounter.textContent = `${idx + 1} / ${totalLabel}`;
  const streamingBadge = document.getElementById('quiz-streaming-badge');
  if (streamingBadge) streamingBadge.style.display = generatingMore ? '' : 'none';

  // 이전 버튼: 이전에 답한 문제가 있으면 표시
  prevBtn.style.display = idx > 0 ? '' : 'none';

  // 이미 답한 문제면 복습 모드로 렌더
  const state = answeredState[idx];
  if (state) {
    renderReviewMode(idx, q, state);
    return;
  }

  answered = false;
  currentAnswer = null;

  // Reset UI
  submitBtn.style.display = '';
  nextBtn.style.display = 'none';
  submitBtn.disabled = true;
  correctAnswerBox.classList.remove('visible');
  explanationBox.classList.remove('visible');

  // Type badge
  const types = { mcq: '📝 객관식', short: '✏️ 주관식', ox: '⭕ OX 퀴즈' };
  typeBadge.textContent = types[q.type] || '📝 문제';

  // Question image (from PDF page)
  let questionImage = document.getElementById('question-image');
  if (q.imageData) {
    if (!questionImage) {
      questionImage = document.createElement('img');
      questionImage.id = 'question-image';
      questionImage.style.cssText = 'width:100%;max-width:600px;border-radius:8px;margin-bottom:12px;display:block';
      questionText.parentNode.insertBefore(questionImage, questionText);
    }
    questionImage.src = `data:image/jpeg;base64,${q.imageData}`;
    questionImage.style.display = 'block';
  } else if (questionImage) {
    questionImage.style.display = 'none';
  }

  // Question
  questionText.innerHTML = marked.parse(q.question);

  // Options
  mcqOptions.style.display = 'none';
  oxOptions.style.display = 'none';
  shortOptions.style.display = 'none';

  if (q.type === 'mcq') {
    renderMCQ(q);
  } else if (q.type === 'ox') {
    renderOX(q);
  } else if (q.type === 'short') {
    renderShort();
  }

  // Animate card
  quizCard.classList.remove('shake', 'correct-flash', 'card-enter');
  requestAnimationFrame(() => quizCard.classList.add('card-enter'));
}

// ─── Review Mode (이미 답한 문제 복습) ───
function renderReviewMode(idx, q, state) {
  answered = true;
  currentAnswer = state.userAnswer;

  submitBtn.style.display = 'none';
  nextBtn.style.display = '';
  nextBtn.textContent = idx < questions.length - 1 ? '다음 문제 →' : '결과 보기';

  correctAnswerBox.classList.remove('visible');
  explanationBox.classList.remove('visible');

  // Type badge
  const types = { mcq: '📝 객관식', short: '✏️ 주관식', ox: '⭕ OX 퀴즈' };
  typeBadge.textContent = types[q.type] || '📝 문제';

  // Image
  let questionImage = document.getElementById('question-image');
  if (q.imageData) {
    if (!questionImage) {
      questionImage = document.createElement('img');
      questionImage.id = 'question-image';
      questionImage.style.cssText = 'width:100%;max-width:600px;border-radius:8px;margin-bottom:12px;display:block';
      questionText.parentNode.insertBefore(questionImage, questionText);
    }
    questionImage.src = `data:image/jpeg;base64,${q.imageData}`;
    questionImage.style.display = 'block';
  } else if (questionImage) {
    questionImage.style.display = 'none';
  }

  questionText.innerHTML = marked.parse(q.question);

  mcqOptions.style.display = 'none';
  oxOptions.style.display = 'none';
  shortOptions.style.display = 'none';

  if (q.type === 'mcq') {
    renderMCQ(q);
    revealAnswer(q, state.isCorrect);
  } else if (q.type === 'ox') {
    renderOX(q);
    revealAnswer(q, state.isCorrect);
    document.getElementById('ox-o-btn').disabled = true;
    document.getElementById('ox-x-btn').disabled = true;
  } else if (q.type === 'short') {
    renderShort();
    shortInput.value = state.userAnswer;
    shortInput.disabled = true;
    if (!state.isCorrect) {
      correctAnswerBox.textContent = `✅ 정답: ${q.answer}`;
      correctAnswerBox.classList.add('visible');
    }
  }

  explanationText.innerHTML = formatExplanation(q.explanation || '해설이 제공되지 않았습니다.');
  explanationBox.classList.add('visible');

  const scrapBtn = document.getElementById('scrap-btn');
  if (scrapBtn) {
    scrapBtn.style.display = '';
    updateScrapBtn(idx);
  }

  quizCard.classList.remove('shake', 'correct-flash', 'card-enter');
  requestAnimationFrame(() => quizCard.classList.add('card-enter'));
}

// ─── MCQ ───
function renderMCQ(q) {
  mcqOptions.style.display = 'flex';
  mcqOptions.innerHTML = '';
  (q.options || []).forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option';
    const safeOpt = opt || '';
    const originalMarker = safeOpt.match(/^[①②③④⑤]/) ? safeOpt[0] : String.fromCharCode(9312 + i);
    const displayMarker = ['A', 'B', 'C', 'D', 'E'][i] || String(i + 1);
    const text = safeOpt.replace(/^[①②③④⑤]\s*/, '').trim();
    btn.innerHTML = `<span class="option-marker">${displayMarker}</span><span>${text}</span>`;
    btn.dataset.value = originalMarker;
    btn.addEventListener('click', () => {
      if (answered) return;
      mcqOptions.querySelectorAll('.quiz-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      currentAnswer = originalMarker;
      submitBtn.disabled = false;
    });
    mcqOptions.appendChild(btn);
  });
}

// ─── OX ───
function renderOX(q) {
  oxOptions.style.display = 'grid';
  const oBtn = document.getElementById('ox-o-btn');
  const xBtn = document.getElementById('ox-x-btn');
  [oBtn, xBtn].forEach(b => {
    b.className = 'ox-option';
    b.disabled = false;
  });

  oBtn.onclick = () => {
    if (answered) return;
    oBtn.classList.add('selected');
    xBtn.classList.remove('selected');
    currentAnswer = 'O';
    submitBtn.disabled = false;
  };
  xBtn.onclick = () => {
    if (answered) return;
    xBtn.classList.add('selected');
    oBtn.classList.remove('selected');
    currentAnswer = 'X';
    submitBtn.disabled = false;
  };
}

// ─── Short Answer ───
function renderShort() {
  shortOptions.style.display = '';
  shortInput.value = '';
  shortInput.disabled = false;
  shortInput.oninput = () => {
    submitBtn.disabled = shortInput.value.trim().length === 0;
  };
  submitBtn.disabled = true;
}

// ─── Controls ───
function setupControls() {
  submitBtn.addEventListener('click', handleSubmit);
  nextBtn.addEventListener('click', handleNext);
  prevBtn.addEventListener('click', handlePrev);

  quitBtn.addEventListener('click', () => quitModal.classList.add('visible'));
  document.getElementById('quit-confirm-btn')?.addEventListener('click', () => {
    clearPendingQuiz();
    window.location.href = '/';
  });
  document.getElementById('quit-cancel-btn')?.addEventListener('click', () => {
    quitModal.classList.remove('visible');
  });
  quitModal?.addEventListener('click', (e) => {
    if (e.target === quitModal) quitModal.classList.remove('visible');
  });

  // PDF 다운로드 버튼
  document.getElementById('download-pdf-btn')?.addEventListener('click', downloadPDF);

  // 스크랩 버튼
  document.getElementById('scrap-btn')?.addEventListener('click', toggleScrap);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target === shortInput) {
      // 주관식 입력창에서 Enter → 제출
      if (e.key === 'Enter' && !answered && !submitBtn.disabled) {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === 'Enter' && answered) {
        handleNext();
      }
      return;
    }
    if (e.key === 'Enter' && !answered && !submitBtn.disabled) handleSubmit();
    else if (e.key === 'Enter' && answered) handleNext();
    if ((e.key === 'ArrowLeft' || e.key === 'Backspace') && answered && currentIdx > 0) handlePrev();
    if (e.key === 'Escape' && !answered) quitModal.classList.toggle('visible');
    // MCQ shortcuts 1-4
    if (!answered) {
      const keyMap = { '1': 0, '2': 1, '3': 2, '4': 3 };
      if (keyMap[e.key] !== undefined) {
        const opts = mcqOptions.querySelectorAll('.quiz-option');
        if (opts[keyMap[e.key]]) opts[keyMap[e.key]].click();
      }
    }
  });
}

// ─── Submit ───
async function handleSubmit() {
  if (answered) return;
  const q = questions[currentIdx];

  if (q.type === 'short') {
    currentAnswer = shortInput.value.trim();
  }

  if (!currentAnswer) return;

  submitBtn.disabled = true;

  let isCorrect;
  if (q.type === 'short') {
    const ua = normalizeKorean(currentAnswer);
    const ca = normalizeKorean(q.answer);
    // 빠른 경로: 정확 일치 또는 포함 관계
    if (ua === ca || ua.includes(ca) || ca.includes(ua)) {
      isCorrect = true;
    } else if (keywordOverlap(ua, ca)) {
      isCorrect = true;
    } else {
      // 문장형은 AI 채점
      const originalText = submitBtn.textContent;
      try {
        const res = await fetch('/api/grade-short', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userAnswer: currentAnswer, correctAnswer: q.answer }),
        });
        const data = await res.json();
        isCorrect = (data.correct !== null && data.correct !== undefined)
          ? data.correct
          : checkAnswer(q, currentAnswer);
      } catch {
        isCorrect = checkAnswer(q, currentAnswer);
      }
      submitBtn.textContent = originalText;
    }
  } else {
    isCorrect = checkAnswer(q, currentAnswer);
  }

  answered = true;
  answeredState[currentIdx] = { isCorrect, userAnswer: currentAnswer };

  submitBtn.style.display = 'none';
  nextBtn.style.display = '';
  nextBtn.textContent = currentIdx < questions.length - 1 ? '다음 문제 →' : '결과 보기';

  if (isCorrect) {
    correctCount++;
    showFeedback('✅');
    quizCard.classList.add('correct-flash');
  } else {
    wrongAnswers.push({
      idx: currentIdx + 1,
      question: q.question,
      type: q.type,
      yourAnswer: currentAnswer,
      correctAnswer: q.answer,
      explanation: q.explanation
    });
    quizCard.classList.add('shake');
    showFeedback('❌');
  }

  // Show result on options
  revealAnswer(q, isCorrect);

  // Show explanation (항상 표시)
  explanationText.innerHTML = formatExplanation(q.explanation || '해설이 제공되지 않았습니다.');
  explanationBox.classList.add('visible');

  // 스크랩 버튼
  const scrapBtn = document.getElementById('scrap-btn');
  if (scrapBtn) {
    scrapBtn.style.display = '';
    updateScrapBtn(currentIdx);
  }

  // For short answer and OX, show correct answer if wrong
  if (!isCorrect && (q.type === 'short' || q.type === 'ox')) {
    correctAnswerBox.textContent = `✅ 정답: ${q.answer}`;
    correctAnswerBox.classList.add('visible');
  }

  // Disable inputs
  if (q.type === 'short') shortInput.disabled = true;
  if (q.type === 'ox') {
    document.getElementById('ox-o-btn').disabled = true;
    document.getElementById('ox-x-btn').disabled = true;
  }
}

// ─── Check Answer ───
function checkAnswer(q, userAnswer) {
  if (q.type === 'mcq') {
    // Compare the option marker symbol
    return normalizeAnswer(q.answer) === normalizeAnswer(userAnswer);
  }
  if (q.type === 'ox') {
    return userAnswer.toUpperCase() === q.answer.toUpperCase();
  }
  if (q.type === 'short') {
    // Fuzzy match for short answers
    const ua = normalizeKorean(userAnswer);
    const ca = normalizeKorean(q.answer);
    if (ua === ca) return true;
    if (ua.includes(ca) || ca.includes(ua)) return true;
    // Similarity check
    if (ca.length >= 4 && similarity(ua, ca) >= 0.80) return true;
    return false;
  }
  return false;
}

function normalizeAnswer(ans) {
  return (ans || '').trim().replace(/\s+/g, '');
}

function normalizeKorean(str) {
  return (str || '').trim().toLowerCase()
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x2050))  // 아랫첨자 → 숫자
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, c => '0123456789'['⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)])       // 윗첨자 → 숫자
    .replace(/[_\-]/g, '')   // P_O2 → PO2, P-H2O → PH2O
    .replace(/[.,\/#!$%\^&\*;:{}=`~()\[\]]/g, '')
    .replace(/\s+/g, '');
}

// 정답의 핵심 키워드(2글자 이상)가 사용자 답안에 모두 포함되는지 검사
function keywordOverlap(userNorm, correctNorm) {
  // 2글자 이상 토큰 추출 (공백/구두점 기준 분리 전 원본 문자열로)
  const tokens = correctNorm.match(/[가-힣a-z0-9]{2,}/g) || [];
  if (tokens.length === 0) return false;
  return tokens.every(token => userNorm.includes(token));
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshtein(a, b) / maxLen;
}

// ─── Reveal Answer UI ───
function revealAnswer(q, isCorrect) {
  if (q.type === 'mcq') {
    const buttons = mcqOptions.querySelectorAll('.quiz-option');
    buttons.forEach(btn => {
      btn.disabled = true;
      const btnVal = normalizeAnswer(btn.dataset.value);
      const correctVal = normalizeAnswer(q.answer);
      if (btnVal === correctVal) {
        btn.classList.remove('selected', 'wrong');
        btn.classList.add('correct');
      } else if (btn.classList.contains('selected') && !isCorrect) {
        btn.classList.add('wrong');
      }
    });
  }

  if (q.type === 'ox') {
    const oBtn = document.getElementById('ox-o-btn');
    const xBtn = document.getElementById('ox-x-btn');
    const correctVal = q.answer.toUpperCase();

    [oBtn, xBtn].forEach(btn => {
      btn.disabled = true;
      btn.classList.remove('selected');
      if (btn.dataset.value === correctVal) {
        btn.classList.add('correct');
      } else if (!isCorrect && btn.dataset.value === currentAnswer.toUpperCase()) {
        btn.classList.add('wrong');
      }
    });
  }
}

// ─── Feedback Animation ───
function showFeedback(emoji) {
  feedbackOverlay.textContent = emoji;
  feedbackOverlay.classList.remove('visible');
  void feedbackOverlay.offsetWidth;
  feedbackOverlay.classList.add('visible');
  setTimeout(() => feedbackOverlay.classList.remove('visible'), 700);
}

// ─── Prev / Next ───
function handlePrev() {
  if (currentIdx <= 0) return;
  currentIdx--;
  renderQuestion(currentIdx);
}

function handleNext() {
  // 이미 답한 문제에서 다음으로 이동 (복습 모드 네비게이션)
  if (answeredState[currentIdx] && currentIdx < questions.length - 1) {
    currentIdx++;
    renderQuestion(currentIdx);
    return;
  }
  // 마지막 답한 문제에서 결과로
  if (answeredState[currentIdx] && currentIdx >= questions.length - 1 && !generatingMore) {
    showResults();
    return;
  }

  currentIdx++;
  if (currentIdx >= questions.length) {
    if (generatingMore) {
      waitingForQuestions = true;
      showWaitingForQuestions();
    } else {
      showResults();
    }
  } else {
    renderQuestion(currentIdx);
  }
}

function showWaitingForQuestions() {
  quizCard.style.display = 'none';
  document.getElementById('quiz-waiting').style.display = '';
  submitBtn.style.display = 'none';
  nextBtn.style.display = 'none';
}

function hideWaitingForQuestions() {
  document.getElementById('quiz-waiting').style.display = 'none';
  quizCard.style.display = '';
}

// ─── 백그라운드 나머지 문제 생성 ───
async function fetchRemainingQuestions(user, remainder) {
  try {
    const idToken = await user.getIdToken();
    const res = await fetch('/api/generate-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: remainder.text,
        types: remainder.types,
        count: remainder.count,
        lang: remainder.lang,
        idToken,
        continuation: true,
      }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.questions?.length) {
      const offset = questions.length;
      data.questions.forEach((q, i) => questions.push({ ...q, id: offset + i + 1 }));
    }
  } catch (_) {
    // 실패 시 조용히 무시 (이미 첫 배치로 퀴즈 진행 가능)
  } finally {
    generatingMore = false;
    const badge = document.getElementById('quiz-streaming-badge');
    if (badge) badge.style.display = 'none';

    if (waitingForQuestions) {
      waitingForQuestions = false;
      hideWaitingForQuestions();
      if (currentIdx < questions.length) {
        renderQuestion(currentIdx);
      } else {
        showResults();
      }
    } else {
      // 카운터 업데이트 (현재 문제 다시 렌더하지 않고 카운터만)
      const totalLabel = questions.length;
      quizCounter.textContent = `${currentIdx + 1} / ${totalLabel}`;
    }
  }
}

// ─── Results ───
async function showResults() {
  clearPendingQuiz();

  const total = questions.length;
  const pct = Math.round((correctCount / total) * 100);

  // Save score
  if (savedQuizId) {
    await updateQuizScore(savedQuizId, pct, wrongAnswers);
  }

  showArea('results');

  // Emoji & message
  let emoji = '🎉';
  let title = '훌륭합니다!';
  let subtitle = '열심히 공부한 결과가 보입니다!';
  if (pct >= 90) { emoji = '🏆'; title = '완벽합니다!'; subtitle = '거의 모든 문제를 맞혔어요!'; }
  else if (pct >= 70) { emoji = '🎯'; title = '잘 하셨습니다!'; subtitle = '조금만 더 노력하면 완벽해질 거예요!'; }
  else if (pct >= 50) { emoji = '📚'; title = '괜찮아요!'; subtitle = '오답 노트로 틀린 문제를 다시 공부해보세요.'; }
  else { emoji = '💪'; title = '다시 도전해보세요!'; subtitle = '오답 노트를 꼭 확인하고 복습해보세요.'; }

  document.getElementById('results-emoji').textContent = emoji;
  document.getElementById('results-title').textContent = title;
  document.getElementById('results-subtitle').textContent = subtitle;
  document.getElementById('score-pct').textContent = `${pct}%`;
  document.getElementById('stat-correct').textContent = correctCount;
  document.getElementById('stat-wrong').textContent = wrongAnswers.length;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-scrap').textContent = scrappedMap.size;

  // Animate score ring
  const circumference = 364.4;
  const offset = circumference - (pct / 100) * circumference;
  setTimeout(() => {
    document.getElementById('score-ring-fill').style.strokeDashoffset = offset;
  }, 100);

  // Wrong answers
  if (wrongAnswers.length > 0) {
    const section = document.getElementById('wrong-answers-section');
    const list = document.getElementById('wrong-answers-list');
    section.style.display = '';
    list.innerHTML = wrongAnswers.map((w, i) => `
      <div class="wrong-answer-card">
        <div class="wrong-answer-num">오답 ${i + 1} · ${getBadgeText(questions[w.idx - 1]?.type)}</div>
        <div class="wrong-answer-q">${marked.parse(w.question)}</div>
        <div class="wrong-answer-yours">❌ 내 답: ${formatAnswer(w.yourAnswer)}</div>
        <div class="wrong-answer-correct">✅ 정답: ${formatAnswer(w.correctAnswer)}</div>
        ${w.explanation ? `<div class="wrong-answer-expl">📖 ${formatExplanation(w.explanation)}</div>` : ''}
      </div>
    `).join('');
  }

  // PDF 버튼 (오답이 있을 때만)
  const pdfBtn = document.getElementById('download-pdf-btn');
  if (pdfBtn) pdfBtn.style.display = wrongAnswers.length > 0 ? '' : 'none';

  // Progress bar to 100%
  progressFill.style.width = '100%';
  quizCounter.textContent = `${total} / ${total}`;
}

function getBadgeText(type) {
  return { mcq: '객관식', short: '주관식', ox: 'OX' }[type] || '문제';
}

function formatExplanation(text) {
  if (!text) return '';
  // 선지 번호(①②③④) 앞에 줄바꿈 강제 삽입 (AI가 붙여쓴 경우 대비)
  const spaced = text.replace(/([^\n])(①|②|③|④)/g, '$1\n\n$2');
  return marked.parse(spaced);
}

function formatAnswer(ans) {
  if (!ans) return '(없음)';
  return ans.length > 80 ? ans.slice(0, 80) + '...' : ans;
}


// ─── 스크랩 ───
function updateScrapBtn(idx) {
  const btn = document.getElementById('scrap-btn');
  if (!btn) return;
  const isScrapped = scrappedMap.has(idx);
  btn.textContent = isScrapped ? '🔖 스크랩됨' : '🔖 스크랩';
  btn.classList.toggle('scrapped', isScrapped);
}

async function toggleScrap() {
  if (!currentUser) {
    showToast('로그인 후 스크랩할 수 있습니다.', 'error');
    return;
  }
  const idx = currentIdx;
  const q = questions[idx];
  if (scrappedMap.has(idx)) {
    await unscrapQuestion(scrappedMap.get(idx));
    scrappedMap.delete(idx);
    showToast('스크랩이 해제됐습니다.', 'info');
  } else {
    const id = await scrapQuestion(currentUser.uid, {
      question: q.question,
      type: q.type,
      options: q.options || [],
      answer: q.answer,
      explanation: q.explanation || '',
      docName: quizMeta?.docName || '알 수 없음'
    });
    scrappedMap.set(idx, id);
    showToast('스크랩됐습니다! 📌', 'success');
  }
  updateScrapBtn(idx);
}

// ─── 오답 노트 PDF 다운로드 ───
function downloadPDF() {
  const date = new Date().toLocaleDateString('ko-KR');
  const docName = quizMeta?.docName || 'GWATOP 퀴즈';

  const cardsHtml = wrongAnswers.map((w, i) => `
    <div class="card">
      <div class="num">오답 ${i + 1} &middot; ${getBadgeText(questions[w.idx - 1]?.type)}</div>
      <div class="question">${marked.parse(w.question)}</div>
      <div class="yours">&#10060; 내 답: ${formatAnswer(w.yourAnswer)}</div>
      <div class="correct">&#9989; 정답: ${formatAnswer(w.correctAnswer)}</div>
      ${w.explanation ? `<div class="expl">&#128214; ${formatExplanation(w.explanation)}</div>` : ''}
    </div>
  `).join('');

  const win = window.open('', '_blank');
  if (!win) { showToast('팝업이 차단됐습니다. 팝업을 허용해주세요.', 'error'); return; }
  win.document.write(`<!DOCTYPE html><html lang="ko"><head>
    <meta charset="UTF-8">
    <title>오답 노트 - ${docName}</title>
    <style>
      body { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 24px; color: #1e293b; font-size: 15px; }
      h1 { font-size: 26px; font-weight: 900; margin: 0 0 4px; }
      .meta { color: #64748b; font-size: 13px; margin-bottom: 32px; }
      .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px 24px; margin-bottom: 16px; page-break-inside: avoid; }
      .num { font-size: 11px; font-weight: 700; color: #7c3aed; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 10px; }
      .question { font-size: 15px; font-weight: 600; line-height: 1.7; margin-bottom: 14px; white-space: pre-wrap; }
      .yours { color: #ef4444; font-size: 14px; margin-bottom: 6px; }
      .correct { color: #10b981; font-size: 14px; margin-bottom: 6px; }
      .expl { background: #f8fafc; border-left: 3px solid #7c3aed; padding: 10px 14px; font-size: 13px; color: #475569; margin-top: 12px; border-radius: 0 6px 6px 0; line-height: 1.7; }
      table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px; }
      th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
      th { background: #f1f5f9; font-weight: 700; }
      @media print { body { padding: 20px; } }
    </style>
  </head><body>
    <h1>&#128213; 오답 노트</h1>
    <div class="meta">${date} &middot; ${docName} &middot; ${wrongAnswers.length}개 오답</div>
    ${cardsHtml}
    <script>window.onload = function(){ window.print(); }<\/script>
  </body></html>`);
  win.document.close();
}

function showToast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
}

init();
