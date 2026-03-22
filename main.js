// ============================================================
// GWATOP - Main Page Logic v1.2.0
// PDF 업로드, 텍스트 추출, 퀴즈 생성, 크레딧 기반 과금
// ============================================================

import { signInWithGoogle, signInWithKakao, signInWithNaver, logOut, handleRedirectResult, onUserChange, deductCreditMixed, calcCredits } from './auth.js';
import { saveDocument, savePendingQuiz } from './db.js';
import { checkAndShowNicknameModal } from './nickname.js';

// ─── PDF.js Setup ───
const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pdfjsLib = null;

async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PDFJS_CDN;
    script.onload = () => {
      pdfjsLib = window['pdfjs-dist/build/pdf'];
      if (!pdfjsLib) pdfjsLib = window.pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      resolve(pdfjsLib);
    };
    script.onerror = () => reject(new Error('pdf.js 로드 실패'));
    document.head.appendChild(script);
  });
}

// ─── State ───
let currentUser = null;
let currentUserData = null;
let selectedFile = null;
let extractedText = '';

// ─── DOM Elements ───
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');
const uploadBtnClick = document.getElementById('upload-btn-click');
const fileInfo = document.getElementById('file-info');
const fileName = document.getElementById('file-name');
const fileSize = document.getElementById('file-size');
const fileRemoveBtn = document.getElementById('file-remove-btn');
const uploadIcon = document.getElementById('upload-icon');
const quizSettings = document.getElementById('quiz-settings');
const countSlider = document.getElementById('count-slider');
const countDisplay = document.getElementById('count-display');
const generateBtn = document.getElementById('generate-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const upgradeBanner = document.getElementById('upgrade-banner');
const loginModal = document.getElementById('login-modal');
const upgradeModal = document.getElementById('upgrade-modal');

// Nav
const navLoggedOut = document.getElementById('nav-auth-logged-out');
const navLoggedIn = document.getElementById('nav-auth-logged-in');
const navAvatar = document.getElementById('nav-avatar');
const navUsername = document.getElementById('nav-username');
const navPlanBadge = document.getElementById('nav-plan-badge');
const navLoginBtn = document.getElementById('nav-login-btn');
const navLogoutBtn = document.getElementById('nav-logout-btn');

// ─── Init ───
async function init() {
  await handleRedirectResult();
  setupNav();
  setupUpload();
  setupSlider();
  setupGenerateBtn();
  setupModals();
  setupPricing();
  updateSliderStyle();
  updateCreditCostLabel();
  checkPreloadedDoc();
}

function checkPreloadedDoc() {
  const raw = sessionStorage.getItem('gwatop_preload_doc');
  if (!raw) return;
  sessionStorage.removeItem('gwatop_preload_doc');
  try {
    const doc = JSON.parse(raw);
    extractedText = doc.text;
    selectedFile = { name: doc.name, size: doc.fileSize || 0, _preloadedDocId: doc.id };
    fileName.textContent = doc.name;
    fileSize.textContent = formatSize(doc.fileSize || 0);
    fileInfo.classList.add('visible');
    uploadZone.classList.add('has-file');
    uploadIcon.textContent = '✅';
    quizSettings.style.display = '';
    generateBtn.disabled = false;
    showToast(`"${doc.name}" 문서가 로드되었습니다.`, 'success');
  } catch { /* 무시 */ }
}

// ─── Navigation Auth ───
function setupNav() {
  navLoginBtn?.addEventListener('click', () => openModal(loginModal));
  navLogoutBtn?.addEventListener('click', () => logOut());

  onUserChange((user, userData) => {
    currentUser = user;
    currentUserData = userData;
    updateNavUI(user, userData);
    updateGenerateBtn();
    checkAndShowNicknameModal(user, userData);
  });
}

function updateNavUI(user, userData) {
  if (user) {
    navLoggedOut.style.display = 'none';
    navLoggedIn.style.display = 'flex';
    navAvatar.src = user.photoURL || '';
    navUsername.textContent = (userData?.icon ? userData.icon + ' ' : '') + (userData?.nickname || user.displayName || user.email || '사용자');
    const credits = userData?.credits ?? 0;
    document.getElementById('nav-credits').textContent = credits;
    updateCreditTypeUI(userData);
    updateCreditCostLabel();
  } else {
    navLoggedOut.style.display = '';
    navLoggedIn.style.display = 'none';
  }
}

function updateCreditTypeUI(userData) {
  const row = document.getElementById('credit-type-row');
  if (!row) return;
  const fp = userData?.freePoints ?? 0;
  const nc = userData?.credits ?? 0;
  const normalBadge = document.getElementById('normal-credits-badge');
  if (normalBadge) normalBadge.textContent = `(보유: ${nc}P)`;
  if (fp > 0) {
    row.style.display = '';
    const badge = document.getElementById('free-points-badge');
    if (badge) badge.textContent = `(보유: ${fp}P)`;
  } else {
    row.style.display = 'none';
    const normalRadio = document.querySelector('input[name="credit-type"][value="normal"]');
    if (normalRadio) normalRadio.checked = true;
  }
}

// ─── Upload Zone ───
function setupUpload() {
  uploadBtnClick?.addEventListener('click', () => fileInput.click());
  uploadZone?.addEventListener('click', (e) => {
    if (e.target === uploadBtnClick || uploadBtnClick?.contains(e.target)) return;
    fileInput.click();
  });
  fileInput?.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });
  fileRemoveBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    clearFile();
  });

  // Drag & Drop
  uploadZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });
  uploadZone?.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      handleFile(file);
    } else {
      showToast('PDF 파일만 업로드할 수 있습니다.', 'error');
    }
  });
}

async function handleFile(file) {
  if (file.type !== 'application/pdf') {
    showToast('PDF 파일만 업로드할 수 있습니다.', 'error'); return;
  }
  if (file.size > 50 * 1024 * 1024) {
    showToast('파일 크기가 50MB를 초과합니다.', 'error'); return;
  }

  selectedFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatSize(file.size);
  fileInfo.classList.add('visible');
  uploadZone.classList.add('has-file');
  uploadIcon.textContent = '✅';
  quizSettings.style.display = '';
  generateBtn.disabled = false;

  showToast('파일이 선택되었습니다. 설정 후 퀴즈를 생성하세요.', 'success');
}

function clearFile() {
  selectedFile = null;
  extractedText = '';
  fileInput.value = '';
  fileInfo.classList.remove('visible');
  uploadZone.classList.remove('has-file');
  uploadIcon.textContent = '📄';
  quizSettings.style.display = 'none';
  generateBtn.disabled = true;
}

// ─── Slider ───
function setupSlider() {
  countSlider?.addEventListener('input', () => {
    countDisplay.textContent = countSlider.value;
    updateSliderStyle();
    updateCreditCostLabel();
  });
  document.addEventListener('change', (e) => {
    if (e.target?.name === 'credit-type') updateCreditCostLabel();
  });
}

function updateCreditCostLabel() {
  const count = parseInt(countSlider?.value || 15);
  const cost = calcCredits(count);
  const label = document.getElementById('credit-cost-label');
  if (!label) return;
  const useFree = document.querySelector('input[name="credit-type"]:checked')?.value === 'free';
  const fp = currentUserData?.freePoints ?? 0;
  if (useFree && fp > 0) {
    const freeUsed = Math.min(fp, cost);
    const creditsUsed = cost - freeUsed;
    if (creditsUsed > 0) {
      label.textContent = `🎁 ${freeUsed}P + ⚡ ${creditsUsed}문제 차감`;
    } else {
      label.textContent = `🎁 ${freeUsed}P 무료 차감`;
    }
  } else {
    label.textContent = `⚡ ${cost}문제 차감`;
  }
}

function updateSliderStyle() {
  if (!countSlider) return;
  const min = parseInt(countSlider.min);
  const max = parseInt(countSlider.max);
  const val = parseInt(countSlider.value);
  const pct = ((val - min) / (max - min)) * 100;
  countSlider.style.setProperty('--progress', `${pct}%`);
}

// ─── Generate Button ───
function setupGenerateBtn() {
  generateBtn?.addEventListener('click', handleGenerate);
}

function updateGenerateBtn() {
  if (!generateBtn) return;
  if (selectedFile) generateBtn.disabled = false;
}

async function handleGenerate() {
  if (!selectedFile) return;

  // Auth check
  if (!currentUser) {
    openModal(loginModal); return;
  }

  // Credits check
  const count = parseInt(countSlider?.value || 15);
  const required = calcCredits(count);
  const credits = currentUserData?.credits ?? 0;
  const freePoints = currentUserData?.freePoints ?? 0;
  const useFree = document.querySelector('input[name="credit-type"]:checked')?.value === 'free';
  const effectiveFree = useFree ? freePoints : 0;
  if (credits + effectiveFree < required) {
    openModal(upgradeModal); return;
  }

  await generateQuiz(useFree);
}

// ─── Core: Load PDF Document (공유) ───
async function loadPDFDocument(file) {
  const lib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  return lib.getDocument({ data: arrayBuffer }).promise;
}

// ─── Core: Extract Text from PDF ───
async function extractTextFromPDF(pdf) {
  let text = '';
  const maxPages = Math.min(pdf.numPages, 80);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .filter(item => item.str?.trim())
      .map(item => item.str)
      .join(' ');
    text += pageText + '\n';
  }
  return text.trim();
}


// ─── Core: Generate Quiz via API ───
async function generateQuiz(useFreeFirst = false) {
  const checked = [...document.querySelectorAll('input[name="quiz-type"]:checked')].map(el => el.value);
  const types = checked.length > 0 ? checked : ['mcq'];
  const count = parseInt(countSlider?.value || 15);
  const lang = document.querySelector('input[name="quiz-lang"]:checked')?.value || 'ko';

  const preventUnload = e => { e.preventDefault(); e.returnValue = ''; };
  window.addEventListener('beforeunload', preventUnload);

  showLoading(true);
  generateBtn.disabled = true;
  setLoadingStep(1, '📖 PDF 텍스트 읽는 중...', 'PDF에서 글자와 내용을 추출합니다');

  try {
    // 1) Extract text + images (저장된 문서에서 로드한 경우 스킵)
    const isPreloaded = !!selectedFile._preloadedDocId;

    if (!isPreloaded && !extractedText) {
      setLoadingStep(1, '📖 PDF 텍스트 읽는 중...', 'PDF에서 글자와 내용을 추출합니다');
      const pdf = await loadPDFDocument(selectedFile);
      extractedText = await extractTextFromPDF(pdf);
    }

    const hasText = extractedText && extractedText.length >= 100;
    if (!hasText) {
      throw new Error('PDF 내용을 읽을 수 없습니다. 파일이 손상되었거나 지원하지 않는 형식일 수 있습니다.');
    }

    // 2) Call API – 첫 배치만 빠르게 생성 (5문제), 나머지는 quiz.html에서 백그라운드 생성
    const firstBatch = Math.min(5, count);
    const remaining = count - firstBatch;

    setLoadingStep(isPreloaded ? 2 : 2, '🤖 AI가 첫 문제를 출제 중...', `첫 ${firstBatch}문제를 먼저 만듭니다. 나머지는 풀면서 자동 생성됩니다`);

    const idToken = await currentUser.getIdToken();
    const response = await fetch('/api/generate-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: extractedText.slice(0, 60000),
        types,
        count: firstBatch,
        lang,
        idToken
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `API 오류: ${response.status}`);
    }

    const data = await response.json();
    if (!data.questions || !Array.isArray(data.questions) || data.questions.length === 0) {
      throw new Error('퀴즈 데이터를 파싱하지 못했습니다. 다시 시도해주세요.');
    }

    // 3) Deduct credits (전체 문제 수 기준, 무료P 우선 or 일반 크레딧)
    const deductAmount = calcCredits(count);
    const ok = await deductCreditMixed(currentUser.uid, deductAmount, useFreeFirst);
    if (!ok) throw new Error('크레딧 차감에 실패했습니다. 잔액을 확인해주세요.');
    if (currentUserData) {
      const fp = currentUserData.freePoints ?? 0;
      const freeUsed = useFreeFirst ? Math.min(fp, deductAmount) : 0;
      const creditsUsed = deductAmount - freeUsed;
      currentUserData.freePoints = Math.max(0, fp - freeUsed);
      currentUserData.credits = Math.max(0, (currentUserData.credits ?? 0) - creditsUsed);
      document.getElementById('nav-credits').textContent = currentUserData.credits;
      updateCreditTypeUI(currentUserData);
    }

    // 4) Save document (저장된 문서에서 로드한 경우 기존 docId 재사용)
    const docId = selectedFile._preloadedDocId || await saveDocument(currentUser.uid, selectedFile.name, extractedText, selectedFile.size);

    // 5) Pass to quiz page via sessionStorage (나머지 배치 정보 포함)
    savePendingQuiz({
      uid: currentUser.uid,
      docId,
      docName: selectedFile.name,
      questions: data.questions,
      type: types.join(','),
      streamingRemainder: remaining > 0 ? {
        count: remaining,
        text: hasText ? extractedText.slice(0, 60000) : '',
        types,
        lang,
      } : null,
    });

    showToast(`✅ 첫 ${data.questions.length}문제 생성! 나머지는 풀면서 자동 생성됩니다`, 'success');
    setTimeout(() => { window.location.href = '/quiz.html'; }, 400);

  } catch (err) {
    console.error('Quiz generation error:', err);
    showToast(`❌ ${err.message}`, 'error');
    generateBtn.disabled = false;
  } finally {
    showLoading(false);
    window.removeEventListener('beforeunload', preventUnload);
  }
}

// ─── Modals ───
function setupModals() {
  const closeLogin = () => closeModal(loginModal);
  document.getElementById('modal-login-google')?.addEventListener('click', () => { closeLogin(); signInWithGoogle(); });
  document.getElementById('modal-login-kakao')?.addEventListener('click', () => { closeLogin(); signInWithKakao(); });
  document.getElementById('modal-login-naver')?.addEventListener('click', () => { closeLogin(); signInWithNaver(); });
  document.getElementById('modal-close-btn')?.addEventListener('click', closeLogin);
  document.getElementById('modal-upgrade-btn')?.addEventListener('click', () => {
    closeModal(upgradeModal);
    window.location.href = '/payment.html';
  });
  document.getElementById('modal-upgrade-close-btn')?.addEventListener('click', () => closeModal(upgradeModal));
  document.getElementById('upgrade-btn')?.addEventListener('click', () => openModal(upgradeModal));

  // Close on backdrop click
  [loginModal, upgradeModal].forEach(modal => {
    modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
  });
}

function openModal(modal) { modal?.classList.add('visible'); }
function closeModal(modal) { modal?.classList.remove('visible'); }

function showUpgradeInfo() {
  showToast('💳 결제 시스템 준비 중입니다. 곧 오픈됩니다!', 'warning');
}

// ─── Pricing ───
function setupPricing() {
  ['pricing-starter-btn', 'pricing-standard-btn', 'pricing-premium-btn'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      if (!currentUser) { signInWithGoogle(); } else { window.location.href = '/payment.html'; }
    });
  });
}

// ─── Toast ───
function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success: '✅', error: '❌', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || '💬'}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ─── Loading ───
function showLoading(show) {
  loadingOverlay?.classList.toggle('visible', show);
}

function setLoadingStep(step, title, desc) {
  const badge = document.getElementById('loading-step-badge');
  const titleEl = document.getElementById('loading-title');
  const descEl = document.getElementById('loading-desc');
  if (badge) badge.textContent = `${step} / 3`;
  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = desc;
}

// ─── Utils ───
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

init();
