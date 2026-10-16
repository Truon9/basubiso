const THEME_KEY = 'n-learny-theme';

function preferredTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
  return 'light';
}

function syncThemeControls(theme) {
  const isDark = theme === 'dark';

  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.textContent = isDark ? '☀' : '☾';
    button.setAttribute('aria-label', isDark ? 'Use light theme' : 'Use dark theme');
    button.setAttribute('title', isDark ? 'Use light theme' : 'Use dark theme');
    button.setAttribute('aria-pressed', String(isDark));
  });
}

export function applyTheme(theme = preferredTheme()) {
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = nextTheme;
  document.documentElement.style.colorScheme = nextTheme;
  localStorage.setItem(THEME_KEY, nextTheme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content',
    nextTheme === 'dark' ? '#151210' : '#fff8ee',
  );
  syncThemeControls(nextTheme);
}

export function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
}
