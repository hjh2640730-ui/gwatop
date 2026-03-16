// ============================================================
// GWATOP - Payment Page Logic v1.3.0
// Toss Payments API 개별 연동 (위젯 없음)
// ============================================================

import { signInWithGoogle, onUserChange } from './auth.js';

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
  document.getElementById('nav-login-btn')?.addEventListener('click', () => signInWithGoogle());
  document.getElementById('modal-login-btn')?.addEventListener('click', () => {
    document.getElementById('login-modal').classList.remove('visible');
    signInWithGoogle();
  });

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
    } else {
      lo.style.display = '';
      li.style.display = 'none';
      document.getElementById('login-modal').classList.add('visible');
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
  payBtnText.textContent = `${packageName} ₩${price.toLocaleString()} 결제하기`;
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
      orderName: `GWATOP ${packageName} 크레딧 ${credits}회`,
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
