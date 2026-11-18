import { handleOfflineApi } from './offlineHandler';

const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export function getApiBaseUrl() {
  if (configuredBaseUrl) return configuredBaseUrl;
  if (typeof window !== 'undefined' && window.location) {
    const { hostname, port, protocol } = window.location;
    if (protocol === 'file:') {
      return 'http://localhost:5000';
    }
    if (['localhost', '127.0.0.1'].includes(hostname) && port !== '5000') {
      return `http://${hostname}:5000`;
    }
  }
  return '';
}

export async function apiFetch(url, options = {}) {
  try {
    const baseUrl = getApiBaseUrl();
    const requestUrl = url.startsWith('/api/') ? `${baseUrl}${url}` : url;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 1200) : null;

    const response = await fetch(requestUrl, {
      ...options,
      signal: controller ? controller.signal : undefined
    });
    if (timeoutId) clearTimeout(timeoutId);

    if (response.status !== 404 && response.status !== 502) {
      return response;
    }
    return handleOfflineApi(url, options);
  } catch {
    // If server is offline or running from file://, handle completely in browser
    return handleOfflineApi(url, options);
  }
}
