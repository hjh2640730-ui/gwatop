// ============================================================
// GWATOP - Quiz Page Logic v1.0.0
// 퀴즈 UI, 진행, 결과, 오답 노트
// ============================================================

import { onUserChange } from './auth.js';
import { loadPendingQuiz, clearPendingQuiz, saveQuiz, updateQuizScore } from './db.js';

// ─── State ───
let questions = [];
let currentIdx = 0;
let correctCount = 0;
let wrongAnswers = [];
let currentAnswer = null;
let answered = false;
let quizMeta = null;
let savedQuizId = null;

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

  // Save quiz to IndexedDB early
  savedQuizId = await saveQuiz(data.docId, data.docName, data.questions, data.type, 0);

  showArea('quiz');
  renderQuestion(0);
  setupControls();
}

// ─── Nav ───
function setupNav() {
  document.getElementById('nav-login-btn')?.addEventListener('click', () => {
    window.location.href = '/';
  });
  onUserChange((user) => {
    const lo = document.getElementById('nav-auth-logged-out');
    const li = document.getElementById('nav-auth-logged-in');
    if (user) {
      lo.style.display = 'none';
      li.style.display = 'flex';
      document.getElementById('nav-avatar').src = user.photoURL || '';
      document.getElementById('nav-username').textContent = user.displayName || '';
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

  answered = false;
  currentAnswer = null;

  // Reset UI
  submitBtn.style.display = '';
  nextBtn.style.display = 'none';
  submitBtn.disabled = true;
  correctAnswerBox.classList.remove('visible');
  explanationBox.classList.remove('visible');
  document.getElementById('comment-box').style.display = 'none';

  // Progress
  const pct = Math.round((idx / questions.length) * 100);
  progressFill.style.width = `${pct}%`;
  quizCounter.textContent = `${idx + 1} / ${questions.length}`;

  // Type badge
  const types = { mcq: '📝 객관식', short: '✏️ 주관식', ox: '⭕ OX 퀴즈' };
  typeBadge.textContent = types[q.type] || '📝 문제';

  // Question
  questionText.textContent = q.question;

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
  quizCard.classList.remove('shake', 'correct-flash');
  void quizCard.offsetWidth; // reflow
  quizCard.style.animation = 'none';
  void quizCard.offsetWidth;
  quizCard.style.animation = '';
}

// ─── MCQ ───
function renderMCQ(q) {
  mcqOptions.style.display = 'flex';
  mcqOptions.innerHTML = '';
  (q.options || []).forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option';
    const marker = opt.match(/^[①②③④⑤]/) ? opt[0] : String.fromCharCode(9312 + i);
    const text = opt.replace(/^[①②③④⑤]\s*/, '').trim();
    btn.innerHTML = `<span class="option-marker">${marker}</span><span>${text}</span>`;
    btn.dataset.value = marker;
    btn.addEventListener('click', () => {
      if (answered) return;
      mcqOptions.querySelectorAll('.quiz-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      currentAnswer = marker;
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
  shortInput.addEventListener('input', () => {
    submitBtn.disabled = shortInput.value.trim().length === 0;
  });
  submitBtn.disabled = true;
}

// ─── Controls ───
function setupControls() {
  submitBtn.addEventListener('click', handleSubmit);
  nextBtn.addEventListener('click', handleNext);

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

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !answered && !submitBtn.disabled) handleSubmit();
    if (e.key === 'Enter' && answered) handleNext();
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
function handleSubmit() {
  if (answered) return;
  const q = questions[currentIdx];

  // Get answer
  if (q.type === 'short') {
    currentAnswer = shortInput.value.trim();
  }

  if (!currentAnswer) return;

  answered = true;
  submitBtn.style.display = 'none';
  nextBtn.style.display = '';

  const isCorrect = checkAnswer(q, currentAnswer);

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

  // Show comment
  const commentBox = document.getElementById('comment-box');
  const commentText = document.getElementById('comment-text');
  const correctComments = ['정확합니다! 🎯', '완벽해요! ✨', '맞습니다! 잘 하셨어요 👏', '훌륭해요! 🌟', '정답입니다! 💯'];
  const wrongComments = ['아쉽네요. 다시 확인해보세요 📚', '틀렸습니다. 해설을 잘 읽어보세요 💡', '조금 더 공부가 필요해요 📖', '다음엔 맞출 수 있어요! 💪'];
  const comments = isCorrect ? correctComments : wrongComments;
  commentText.textContent = comments[Math.floor(Math.random() * comments.length)];
  commentBox.className = `quiz-comment ${isCorrect ? 'correct' : 'wrong'}`;
  commentBox.style.display = '';

  // Show explanation (항상 표시)
  explanationText.textContent = q.explanation || '해설이 제공되지 않았습니다.';
  explanationBox.classList.add('visible');

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
    if (ca.length >= 4 && similarity(ua, ca) > 0.75) return true;
    return false;
  }
  return false;
}

function normalizeAnswer(ans) {
  return (ans || '').trim().replace(/\s+/g, '');
}

function normalizeKorean(str) {
  return (str || '').trim().toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()\[\]]/g, '')
    .replace(/\s+/g, ' ');
}

function similarity(a, b) {
  if (!a || !b) return 0;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1.0;
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }
  return matches / longer.length;
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

// ─── Next Question ───
function handleNext() {
  currentIdx++;
  if (currentIdx >= questions.length) {
    showResults();
  } else {
    renderQuestion(currentIdx);
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
        <div class="wrong-answer-q">${w.question}</div>
        <div class="wrong-answer-yours">❌ 내 답: ${formatAnswer(w.yourAnswer)}</div>
        <div class="wrong-answer-correct">✅ 정답: ${formatAnswer(w.correctAnswer)}</div>
        ${w.explanation ? `<div class="wrong-answer-expl">📖 ${w.explanation}</div>` : ''}
      </div>
    `).join('');
  }

  // Progress bar to 100%
  progressFill.style.width = '100%';
  quizCounter.textContent = `${total} / ${total}`;
}

function getBadgeText(type) {
  return { mcq: '객관식', short: '주관식', ox: 'OX' }[type] || '문제';
}

function formatAnswer(ans) {
  if (!ans) return '(없음)';
  return ans.length > 80 ? ans.slice(0, 80) + '...' : ans;
}

init();
