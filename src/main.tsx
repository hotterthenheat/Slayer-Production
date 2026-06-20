import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Monkey patch fetch to automatically handle Token Rotation (Access/Refresh)
function monkeyPatchFetchAndButtons() {
  const originalFetch = window.fetch;
  let accessToken = ''; // In-memory, 15m expiry token
  let activeClickEl: HTMLElement | null = null;
  
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
    // Determine method (POST/PUT trigger disabled)
    const method = (init?.method || '').toUpperCase();
    const btnToDisable = (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') ? activeClickEl : null;
    
    if (btnToDisable) {
      (btnToDisable as HTMLButtonElement).disabled = true;
      btnToDisable.setAttribute('data-ds-lock', 'true');
      btnToDisable.classList.add('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
    }

    const reqInit = init || {};
    if (!reqInit.headers) reqInit.headers = {};
    if (accessToken && !('Authorization' in reqInit.headers)) {
      (reqInit.headers as any)['Authorization'] = `Bearer ${accessToken}`;
    }
    if (!reqInit.credentials) {
      reqInit.credentials = 'same-origin';
    }

    try {
      let response = await originalFetch(input, reqInit);
      if (response.status === 401) {
        try {
          const refreshResponse = await originalFetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
          if (refreshResponse.ok) {
            const data = await refreshResponse.json();
            accessToken = data.access_token;
            (reqInit.headers as any)['Authorization'] = `Bearer ${accessToken}`;
            response = await originalFetch(input, reqInit);
          }
        } catch(e) {}
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
