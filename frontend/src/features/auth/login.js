import { API_BASE_URL } from '../../core/config.js';
import { authorizedFetch, clearSession, getToken, saveSession } from '../../core/auth.js';
import { applyTheme, toggleTheme } from '../../core/preferences.js';

const loginStyles = document.createElement('link');
loginStyles.rel = 'stylesheet';
loginStyles.href = 'src/features/auth/login.css';
document.head.append(loginStyles);

const form = document.querySelector('#login-form');
const screen = document.querySelector('#login-screen');
const app = document.querySelector('#app-shell');
const error = document.querySelector('#login-error');
const usernameInput = document.querySelector('#login-username');
const passwordInput = document.querySelector('#login-password');
const confirmInput = document.querySelector('#confirm-password');
const confirmField = document.querySelector('#confirm-password-field');
const hint = document.querySelector('#auth-hint');
const submit = document.querySelector('#auth-submit');
const signinTab = document.querySelector('#auth-signin-tab');
const registerTab = document.querySelector('#auth-register-tab');
let mode = 'signin';
localStorage.removeItem('n-learny-user'); // Legacy UI-only login must never restore access.

const copy = {
  en: {
    signin: 'Sign in', register: 'Create account', welcome: 'Welcome back to MayStudy, your learning workspace.',
    registerIntro: 'Create your own learning space. Your subjects and documents stay yours.', confirm: 'Confirm password',
    hint: 'Use at least 8 characters. Username: 3–80 letters, numbers, _, . or -.', mismatch: 'Passwords do not match.',
    success: 'Account created. Sign in to continue.', failed: 'Could not complete this request.',
    invalidLogin: 'Invalid username or password.', usernameTaken: 'This username is already taken.',
    invalidRegistration: 'Check your username and password and try again.',
    sessionExpired: 'Your session expired. Please sign in again.',
  },
  vi: {
    signin: 'Đăng nhập', register: 'Tạo tài khoản', welcome: 'Chào mừng bạn quay lại MayStudy.',
    registerIntro: 'Tạo không gian học tập riêng. Môn học và tài liệu của bạn chỉ bạn mới xem được.', confirm: 'Xác nhận mật khẩu',
    hint: 'Mật khẩu tối thiểu 8 ký tự. Tên đăng nhập: 3–80 chữ cái, số, _, . hoặc -.', mismatch: 'Mật khẩu xác nhận không khớp.',
    success: 'Đã tạo tài khoản. Hãy đăng nhập để tiếp tục.', failed: 'Không thể hoàn thành yêu cầu.',
    invalidLogin: 'Sai tên đăng nhập hoặc mật khẩu.', usernameTaken: 'Tên đăng nhập này đã được sử dụng.',
    invalidRegistration: 'Hãy kiểm tra lại tên đăng nhập và mật khẩu.',
    sessionExpired: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.',
  },
};
const language = () => localStorage.getItem('n-learny-language') === 'vi' ? 'vi' : 'en';
const t = key => copy[language()][key];

function renderMode() {
  signinTab.classList.toggle('active', mode === 'signin');
  registerTab.classList.toggle('active', mode === 'register');
  signinTab.setAttribute('aria-pressed', String(mode === 'signin'));
  registerTab.setAttribute('aria-pressed', String(mode === 'register'));
  signinTab.textContent = t('signin');
  registerTab.textContent = t('register');
  document.querySelector('#auth-title').textContent = t(mode);
  document.querySelector('#auth-intro').textContent = t(mode === 'signin' ? 'welcome' : 'registerIntro');
  document.querySelector('#confirm-password-label').textContent = t('confirm');
  hint.textContent = t('hint');
  hint.hidden = mode !== 'register';
  confirmField.hidden = mode !== 'register';
  confirmInput.required = mode === 'register';
  passwordInput.autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
  passwordInput.minLength = mode === 'register' ? 8 : 1;
  submit.textContent = t(mode);
}

function setMode(next) {
  mode = next;
  error.textContent = '';
  error.classList.remove('auth-success');
  passwordInput.value = '';
  confirmInput.value = '';
  renderMode();
}

const showApp = () => {
  screen.hidden = true;
  app.hidden = false;
  document.body.classList.add('is-authenticated');
  document.dispatchEvent(new CustomEvent('n-learny:authenticated'));
};

signinTab.addEventListener('click', () => setMode('signin'));
registerTab.addEventListener('click', () => setMode('register'));
document.addEventListener('maystudy:language-changed', renderMode);

async function restoreSession() {
  const restoringToken = getToken();
  if (!restoringToken) return;
  try {
    const response = await authorizedFetch(`${API_BASE_URL}/auth/me`);
    if (!response.ok) throw new Error(response.status === 401 ? t('sessionExpired') : t('failed'));
    showApp();
  } catch (err) {
    if (getToken() === restoringToken || !getToken()) error.textContent = err.message;
  }
}
restoreSession();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.textContent = '';
  error.classList.remove('auth-success');
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const submittedMode = mode;
  if (submittedMode === 'register' && password !== confirmInput.value) {
    error.textContent = t('mismatch');
    return;
  }
  submit.disabled = true;
  signinTab.disabled = registerTab.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/${submittedMode === 'register' ? 'register' : 'login'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json();
    if (!response.ok) {
      const localError = response.status === 401 ? t('invalidLogin')
        : response.status === 409 ? t('usernameTaken')
          : response.status === 422 ? t('invalidRegistration') : null;
      throw new Error(localError || (typeof data.detail === 'string' ? data.detail : t('failed')));
    }

    if (submittedMode === 'register') {
      setMode('signin');
      usernameInput.value = username;
      error.textContent = t('success');
      error.classList.add('auth-success');
      passwordInput.focus();
    } else {
      saveSession(data.access_token);
      passwordInput.value = '';
      showApp();
    }
  } catch (err) {
    error.textContent = err.message;
  } finally {
    submit.disabled = false;
    signinTab.disabled = registerTab.disabled = false;
  }
});

function showLogin(message = '') {
  clearSession();
  app.hidden = true;
  screen.hidden = false;
  document.body.classList.remove('is-authenticated');
  error.textContent = message;
  error.classList.remove('auth-success');
  document.dispatchEvent(new CustomEvent('n-learny:signed-out'));
}

document.addEventListener('maystudy:session-expired', () => showLogin(t('sessionExpired')));
document.querySelector('#logout').onclick = async () => {
  try { await authorizedFetch(`${API_BASE_URL}/auth/logout`, { method: 'POST' }); } catch (_) { /* Sign out locally even when offline. */ }
  showLogin();
};

document.querySelector('#login-language').onclick = () => {
  document.querySelector('#language').click();
};

const loginTheme = document.createElement('button');
loginTheme.type = 'button';
loginTheme.id = 'login-theme';
loginTheme.dataset.themeToggle = '';
loginTheme.onclick = toggleTheme;

const preferenceControls = document.querySelector('.language-row');
preferenceControls.append(loginTheme);
document.querySelector('.login-story').append(preferenceControls);

const appTheme = document.querySelector('#theme');
appTheme.dataset.themeToggle = '';
appTheme.onclick = toggleTheme;
applyTheme();
renderMode();
