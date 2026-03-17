// ============================================================
// GWATOP - Nickname Modal Module
// 첫 로그인 시 닉네임 설정
// ============================================================

import { checkNicknameAvailable, setNickname } from './auth.js';

const MODAL_ID = 'nickname-modal';

function injectModal() {
  if (document.getElementById(MODAL_ID)) return;
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="modal-overlay" id="${MODAL_ID}" style="z-index:200">
      <div class="modal" style="max-width:420px">
        <div class="modal-icon">✏️</div>
        <h2 class="modal-title">닉네임 설정</h2>
        <p class="modal-desc" style="margin-bottom:20px">놀이터에서 사용할 닉네임을 설정하세요.<br/><span style="font-size:13px;color:var(--text-muted)">한글·영문·숫자, 2~16자</span></p>
        <input
          id="nickname-input"
          type="text"
          maxlength="16"
          placeholder="닉네임 입력"
          style="width:100%;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:var(--radius-md);padding:14px 18px;font-family:var(--font);font-size:16px;font-weight:600;color:var(--text-primary);outline:none;text-align:center;transition:border-color 0.2s;box-sizing:border-box;"
        />
        <div id="nickname-msg" style="min-height:20px;font-size:13px;margin-top:8px;text-align:center;"></div>
        <div class="modal-actions" style="margin-top:20px">
          <button class="btn btn-primary btn-lg" id="nickname-save-btn" style="flex:1" disabled>저장</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(el.firstElementChild);
}

export function checkAndShowNicknameModal(user, userData) {
  if (!user || userData?.nickname) return; // 이미 닉네임 있으면 스킵
  injectModal();

  const modal = document.getElementById(MODAL_ID);
  const input = document.getElementById('nickname-input');
  const msg = document.getElementById('nickname-msg');
  const btn = document.getElementById('nickname-save-btn');

  // 이미 열려있으면 스킵
  if (modal.classList.contains('visible')) return;

  // 초기화
  input.value = '';
  msg.textContent = '';
  msg.style.color = '';
  btn.disabled = true;

  modal.classList.add('visible');
  setTimeout(() => input.focus(), 100);

  let debounceTimer = null;

  async function validateNickname(value) {
    const v = value.trim();
    if (v.length < 2) {
      msg.textContent = '2자 이상 입력해주세요.';
      msg.style.color = 'var(--text-muted)';
      btn.disabled = true;
      return;
    }
    if (!/^[가-힣a-zA-Z0-9_]+$/.test(v)) {
      msg.textContent = '한글, 영문, 숫자, 밑줄(_)만 사용 가능합니다.';
      msg.style.color = '#f87171';
      btn.disabled = true;
      return;
    }
    msg.textContent = '확인 중...';
    msg.style.color = 'var(--text-muted)';
    btn.disabled = true;

    const available = await checkNicknameAvailable(v);
    if (available) {
      msg.textContent = '✅ 사용 가능한 닉네임입니다.';
      msg.style.color = '#34d399';
      btn.disabled = false;
    } else {
      msg.textContent = '❌ 이미 사용 중인 닉네임입니다.';
      msg.style.color = '#f87171';
      btn.disabled = true;
    }
  }

  input.oninput = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => validateNickname(input.value), 400);
  };

  input.onkeydown = (e) => { if (e.key === 'Enter' && !btn.disabled) btn.click(); };

  btn.onclick = async () => {
    const nickname = input.value.trim();
    if (!nickname || btn.disabled) return;

    btn.disabled = true;
    btn.textContent = '저장 중...';

    try {
      // 저장 직전 한번 더 중복 확인 (race condition 방지)
      const available = await checkNicknameAvailable(nickname);
      if (!available) {
        msg.textContent = '❌ 이미 사용 중인 닉네임입니다.';
        msg.style.color = '#f87171';
        btn.textContent = '저장';
        return;
      }
      await setNickname(user.uid, nickname);
      modal.classList.remove('visible');
      // nav 닉네임 즉시 업데이트
      const navUsername = document.getElementById('nav-username');
      if (navUsername) navUsername.textContent = nickname;
      window.dispatchEvent(new CustomEvent('nickname-set', { detail: { nickname } }));
    } catch (e) {
      msg.textContent = '오류가 발생했습니다. 다시 시도해주세요.';
      msg.style.color = '#f87171';
      btn.disabled = false;
      btn.textContent = '저장';
    }
  };
}
