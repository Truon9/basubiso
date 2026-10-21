const remoteApiBaseUrl = 'https://2qvm9rmc-8000.asse.devtunnels.ms/v1';
const localHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

export const API_BASE_URL = localHost
  ? `http://${window.location.hostname}:8000/v1`
  : remoteApiBaseUrl;
