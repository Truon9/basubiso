import { API_BASE_URL } from '../../core/config.js';
import { applyTheme, toggleTheme } from '../../core/preferences.js';

const loginStyles = document.createElement('link');
loginStyles.rel = 'stylesheet';
loginStyles.href = 'src/features/auth/login.css';
document.head.append(loginStyles);

const form = document.querySelector('#login-form');
const screen = document.querySelector('#login-screen');
const app = document.querySelector('#app-shell');
const error = document.querySelector('#login-error');

const showApp = () => {
  screen.hidden = true;
  app.hidden = false;
  document.body.classList.add('is-authenticated');
  document.dispatchEvent(new CustomEvent('n-learny:authenticated'));
};

if (localStorage.getItem('n-learny-user')) showApp();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.textContent = '';

  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.querySelector('#login-username').value,
        password: document.querySelector('#login-password').value,
      }),
    });
    const user = await response.json();
    if (!response.ok) throw new Error(user.detail || 'Sign in failed.');

    localStorage.setItem('n-learny-user', JSON.stringify(user));
    showApp();
  } catch (err) {
    error.textContent = err.message;
  }
});

document.querySelector('#logout').onclick = () => {
  localStorage.removeItem('n-learny-user');
  app.hidden = true;
  screen.hidden = false;
  document.body.classList.remove('is-authenticated');
  document.dispatchEvent(new CustomEvent('n-learny:signed-out'));
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
