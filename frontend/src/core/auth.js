const SESSION_KEY = 'maystudy-session';

export const getToken = () => localStorage.getItem(SESSION_KEY);
export const saveSession = token => localStorage.setItem(SESSION_KEY, token);
export const clearSession = () => localStorage.removeItem(SESSION_KEY);

export async function authorizedFetch(url, options = {}) {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401 && token && getToken() === token) {
    clearSession();
    document.dispatchEvent(new CustomEvent('maystudy:session-expired'));
  }
  if (token !== getToken() && response.status !== 401) throw new Error('Session changed. Please sign in again.');
  return response;
}
