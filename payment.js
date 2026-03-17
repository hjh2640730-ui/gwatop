// ============================================================
// GWATOP - Payment Page Logic v1.3.0
// Toss Payments API 개별 연동 (위젯 없음)
// ============================================================

import { signInWithGoogle, logOut, onUserChange } from './auth.js';

const TOSS_CLIENT_KEY = 'test_ck_DnyRpQWGrN2jDYK5Wa0LrKwv1M9E';

let currentUser = null;
let selectedCard = null;
let tossPayments = null;

// ─── Init ───
async function init() {
  tossPayments = TossPayments(TOSS_CLIENT_KEY);
  setupNav();
  setupPackageCards();
}

// ─── Nav ───
function setupNav() {
  document.getElementById('nav-logout-btn')?.addEventListener('click', () => logOut());
  // nav-login-btn and modal login buttons are handled by inline script in payment.html

  onUserChange(async (user, userData) => {
    currentUser = user;
    const lo = document.getElementById('nav-auth-logged-out');
    const li = document.getElementById('nav-auth-logged-in');

    if (user) {
      lo.style.display = 'none';
      li.style.display = 'flex';
      document.getElementById('nav-avatar').src = user.photoURL || '';
      document.getElementById('nav-username').textContent = user.displayName || '';
      const credits = userData?.credits ?? 0;
      document.getElementById('nav-credits').textContent = credits;
      document.getElementById('current-credits').textContent = credits;
      document.getElementById('credits-info-bar').style.display = 'flex';
      setupReferral(user, userData);
    } else {
      lo.style.display = '';
      li.style.display = 'none';
    }
  });
}

// ─── Package Cards ───
function setupPackageCards() {
  document.querySelectorAll('.package-card').forEach(card => {
    card.addEventListener('click', () => selectPackage(card));
  });
}

function selectPackage(card) {
  if (!currentUser) {
    document.getElementById('login-modal').classList.add('visible');
    return;
  }

  document.querySelectorAll('.package-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  selectedCard = card;

  const credits = card.dataset.credits;
  const price = parseInt(card.dataset.price);
  const packageName = card.querySelector('.package-name').textContent;

  const payBtn = document.getElementById('pay-btn');
  const payBtnText = document.getElementById('pay-btn-text');
  payBtn.style.display = 'flex';
  payBtnText.textContent = `${packageName} ${parseInt(credits).toLocaleString()}문제 ₩${price.toLocaleString()} 결제하기`;
}

// ─── Pay Button ───
document.getElementById('pay-btn')?.addEventListener('click', async () => {
  if (!currentUser || !selectedCard) return;

  const credits = selectedCard.dataset.credits;
  const price = parseInt(selectedCard.dataset.price);
  const packageName = selectedCard.querySelector('.package-name').textContent;
  const orderId = `gwatop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    document.getElementById('pay-btn').disabled = true;

    const payment = tossPayments.payment({ customerKey: currentUser.uid });
    await payment.requestPayment({
      method: 'CARD',
      amount: { currency: 'KRW', value: price },
      orderId,
      orderName: `GWATOP ${packageName} ${parseInt(credits).toLocaleString()}문제`,
      successUrl: `${window.location.origin}/payment-success.html`,
      failUrl: `${window.location.origin}/payment-fail.html`,
      customerEmail: currentUser.email,
      customerName: currentUser.displayName || '사용자',
    });
  } catch (e) {
    if (e.code !== 'USER_CANCEL') {
      showToast('결제 중 오류가 발생했습니다: ' + e.message, 'error');
    }
    document.getElementById('pay-btn').disabled = false;
  }
});

// ─── Referral ───
function setupReferral(user, userData) {
  const section = document.getElementById('referral-section');
  section.style.display = '';

  const referralUrl = `${window.location.origin}/?ref=${user.uid}`;
  document.getElementById('referral-link').value = referralUrl;
  document.getElementById('referral-credits-count').textContent = userData?.referralCredits ?? 0;

  document.getElementById('copy-referral-btn')?.addEventListener('click', () => {
    copyToClipboard(referralUrl);
  });
  document.getElementById('share-copy-btn')?.addEventListener('click', () => {
    copyToClipboard(referralUrl);
  });
  document.getElementById('share-kakao-btn')?.addEventListener('click', () => {
    const msg = `GWATOP - AI 퀴즈 생성기\nPDF 업로드 한 번으로 시험 문제 자동 생성!\n${referralUrl}`;
    if (navigator.share) {
      navigator.share({ title: 'GWATOP', text: msg, url: referralUrl });
    } else {
      copyToClipboard(referralUrl);
      showToast('링크가 복사됐습니다. 카카오톡에 붙여넣기 하세요!', 'success');
    }
  });
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('추천 링크가 복사됐습니다!', 'success');
  }).catch(() => {
    showToast('복사 실패. 직접 선택해서 복사해주세요.', 'error');
  });
}

// ─── Toast ───
function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success: '✅', error: '❌', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 300); }, 3500);
}

init();
