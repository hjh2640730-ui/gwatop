// ============================================================
// GWATOP - Main Page Logic v1.0.0
// PDF 업로드, 텍스트 추출, 퀴즈 생성
// ============================================================

import { signInWithGoogle, logOut, handleRedirectResult, onUserChange, checkAndIncrementQuizCount } from './auth.js';
import { saveDocument, savePendingQuiz, getGuestQuizCount, incrementGuestQuizCount } from './db.js';

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
}

// ─── Navigation Auth ───
function setupNav() {
  navLoginBtn?.addEventListener('click', () => signInWithGoogle());
  navLogoutBtn?.addEventListener('click', () => logOut());

  onUserChange((user, userData) => {
    currentUser = user;
    currentUserData = userData;
    updateNavUI(user, userData);
    updateGenerateBtn();
  });
}

function updateNavUI(user, userData) {
  if (user) {
    navLoggedOut.style.display = 'none';
    navLoggedIn.style.display = 'flex';
    navAvatar.src = user.photoURL || '';
    navUsername.textContent = user.displayName || user.email || '사용자';
    const plan = userData?.plan || 'free';
    navPlanBadge.textContent = plan === 'premium' ? 'Premium' : 'Free';
    navPlanBadge.className = `nav-plan-badge ${plan}`;
  } else {
    navLoggedOut.style.display = '';
    navLoggedIn.style.display = 'none';
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
  });
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

  // Quota check
  const check = await checkAndIncrementQuizCount(currentUser.uid);
  if (!check.allowed) {
    openModal(upgradeModal); return;
  }

  await generateQuiz();
}

// ─── Core: Extract Text from PDF ───
async function extractTextFromPDF(file) {
  const lib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  const maxPages = Math.min(pdf.numPages, 80); // cap at 80 pages
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
async function generateQuiz() {
  const checked = [...document.querySelectorAll('input[name="quiz-type"]:checked')].map(el => el.value);
  const types = checked.length > 0 ? checked : ['mcq'];
  const count = parseInt(countSlider?.value || 15);

  showLoading(true);
  generateBtn.disabled = true;

  try {
    // 1) Extract text
    showToast('📖 PDF 텍스트 추출 중...', 'warning');
    extractedText = await extractTextFromPDF(selectedFile);

    if (!extractedText || extractedText.length < 100) {
      throw new Error('PDF에서 텍스트를 추출할 수 없습니다. 이미지 기반 PDF일 수 있습니다.');
    }

    // 2) Call API
    showToast('🤖 AI가 문제를 생성 중입니다...', 'warning');
    const response = await fetch('/api/generate-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: extractedText.slice(0, 60000),
        types,
        count
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

    // 3) Save document
    const docId = await saveDocument(selectedFile.name, extractedText, selectedFile.size);

    // 4) Pass to quiz page via sessionStorage
    savePendingQuiz({
      docId,
      docName: selectedFile.name,
      questions: data.questions,
      type: types.join(',')
    });

    showToast(`✅ ${data.questions.length}문제 생성 완료!`, 'success');
    setTimeout(() => { window.location.href = '/quiz.html'; }, 500);

  } catch (err) {
    console.error('Quiz generation error:', err);
    showToast(`❌ ${err.message}`, 'error');
    generateBtn.disabled = false;
  } finally {
    showLoading(false);
  }
}

// ─── Modals ───
function setupModals() {
  document.getElementById('modal-login-btn')?.addEventListener('click', () => {
    closeModal(loginModal);
    signInWithGoogle();
  });
  document.getElementById('modal-close-btn')?.addEventListener('click', () => closeModal(loginModal));
  document.getElementById('modal-upgrade-btn')?.addEventListener('click', () => {
    closeModal(upgradeModal);
    showUpgradeInfo();
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
  document.getElementById('pricing-free-btn')?.addEventListener('click', () => {
    if (!currentUser) { signInWithGoogle(); } else { showToast('이미 무료 플랜을 사용 중입니다.', 'success'); }
  });
  document.getElementById('pricing-premium-btn')?.addEventListener('click', () => {
    showUpgradeInfo();
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

// ─── Utils ───
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

init();
