import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Monkey patch fetch to automatically handle Token Rotation (Access/Refresh)
function monkeyPatchFetchAndButtons() {
  const originalFetch = window.fetch;
  let accessToken = ''; // In-memory, 15m expiry token
  let activeClickEl: HTMLElement | null = null;
  // Single-flight refresh: many requests can 401 at once on boot; without this
  // they each POST /api/auth/refresh and clobber each other's rotated token.
  let refreshInFlight: Promise<string> | null = null;

  const refreshAccessToken = (): Promise<string> => {
    if (!refreshInFlight) {
      refreshInFlight = (async () => {
        try {
          const r = await originalFetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
          if (r.ok) { const d = await r.json(); accessToken = d?.access_token || ''; return accessToken; }
        } catch { /* refresh failed */ }
        return '';
      })().finally(() => { refreshInFlight = null; });
    }
    return refreshInFlight;
  };

  window.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const btn = el.closest('button');
    if (btn && !btn.disabled) {
      activeClickEl = btn;
      // We will only disable if accompanied by a fetch call soon after
      setTimeout(() => { activeClickEl = null; }, 50);
    }
  }, true);

  Object.defineProperty(window, 'fetch', { configurable: true, writable: true, value: async (input: RequestInfo | URL, init?: RequestInit) => {
    const isRequest = typeof Request !== 'undefined' && input instanceof Request;
    const method = (init?.method || (isRequest ? (input as Request).method : '') || '').toUpperCase();
    const btnToDisable = (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') ? activeClickEl : null;

    if (btnToDisable) {
      (btnToDisable as HTMLButtonElement).disabled = true;
      btnToDisable.setAttribute('data-ds-lock', 'true');
      btnToDisable.classList.add('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
    }

    // Per-call init (shallow clone — never mutate the caller's object) and a
    // proper Headers instance so attaching Authorization works whether the
    // caller passed a plain object, a Headers, or a tuple array (or a Request).
    const reqInit: RequestInit = { ...(init || {}) };
    const headers = new Headers((init && init.headers) || (isRequest ? (input as Request).headers : undefined));
    if (accessToken && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${accessToken}`);
    reqInit.headers = headers;
    if (!reqInit.credentials) reqInit.credentials = 'same-origin';
    // A Request body is consumed by the first send; keep a clone for the 401 retry.
    const retrySource = isRequest ? (input as Request).clone() : null;

    try {
      let response = await originalFetch(input, reqInit);
      if (response.status === 401) {
        const token = await refreshAccessToken();
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
          response = await originalFetch(retrySource ?? input, { ...reqInit, headers });
        }
      }

      if (response.ok && typeof input === 'string' && (input.includes('/clerk-login') || input.includes('/clerk-signup') || input.includes('/verify-totp'))) {
        try {
          const clone = response.clone();
          const body = await clone.json();
          if (body && body.access_token) {
            accessToken = body.access_token;
          }
        } catch(e) {}
      }
      return response;
    } finally {
      if (btnToDisable) {
        (btnToDisable as HTMLButtonElement).disabled = false;
        btnToDisable.removeAttribute('data-ds-lock');
        btnToDisable.classList.remove('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
      }
    }
    }});
}

monkeyPatchFetchAndButtons();

createRoot(document.getElementById('root')!).render(
  <App />
);
