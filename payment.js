// ============================================================
// GWATOP - Payment Page Logic v1.2.0
// Toss Payments 크레딧 충전
// ============================================================

import { signInWithGoogle, onUserChange, getCredits } from './auth.js';

const TOSS_CLIENT_KEY = 'test_ck_DnyRpQWGrN2jDYK5Wa0LrKwv1M9E';

let currentUser = null;
let selectedCard = null;
let tossPayments = null;
let paymentWidget = null;

// ─── Init ───
async function init() {
  setupNav();

  // Toss Payments SDK 초기화
  tossPayments = TossPayments(TOSS_CLIENT_KEY);

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

async function selectPackage(card) {
  if (!currentUser) {
    document.getElementById('login-modal').classList.add('visible');
    return;
  }

  // UI 선택 표시
  document.querySelectorAll('.package-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  selectedCard = card;

  const credits = parseInt(card.dataset.credits);
  const price = parseInt(card.dataset.price);
  const packageName = card.querySelector('.package-name').textContent;

  // 결제 버튼 표시
  const payBtn = document.getElementById('pay-btn');
  const payBtnText = document.getElementById('pay-btn-text');
  payBtn.style.display = 'flex';
  payBtnText.textContent = `${packageName} ₩${price.toLocaleString()} 결제하기`;

  // Toss 위젯 렌더링
  await renderPaymentWidget(credits, price, packageName);
}

// ─── Render Toss Payment Widget ───
async function renderPaymentWidget(credits, price, packageName) {
  const widgetContainer = document.getElementById('payment-widget');
  const agreementContainer = document.getElementById('payment-agreement');

  widgetContainer.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary)">결제 위젯 로딩 중...</div>';

  try {
    // widgets() 방식 사용 (Toss v2 위젯 SDK)
    paymentWidget = tossPayments.widgets({ customerKey: currentUser.uid });

    // 금액 설정
    await paymentWidget.setAmount({ currency: 'KRW', value: price });

    // 결제 UI 렌더링
    await paymentWidget.renderPaymentMethods({
      selector: '#payment-widget',
      variantKey: 'DEFAULT',
    });

    // 약관 렌더링
    agreementContainer.style.display = '';
    await paymentWidget.renderAgreement({ selector: '#payment-agreement' });

  } catch (e) {
    console.error('Toss widget error:', e);
    widgetContainer.innerHTML = `<div style="padding:20px;color:var(--error);text-align:center">결제 위젯 로드 실패: ${e.message}</div>`;
  }
}

// ─── Pay Button ───
document.getElementById('pay-btn')?.addEventListener('click', async () => {
  if (!currentUser || !selectedCard || !paymentWidget) return;

  const credits = parseInt(selectedCard.dataset.credits);
  const price = parseInt(selectedCard.dataset.price);
  const packageName = selectedCard.querySelector('.package-name').textContent;
  const orderId = `gwatop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    document.getElementById('pay-btn').disabled = true;

    await paymentWidget.requestPayment({
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
