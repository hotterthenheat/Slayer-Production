import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './themes.css';

// Patch fetch for two cross-cutting concerns: (1) always send the httpOnly
// session cookie on same-origin requests (that cookie is the SOLE auth
// credential), and (2) lock a button while its triggering mutation is in flight.
// NOTE: there is no bearer "access token". A prior version minted a forgeable,
// never-validated `user_id:timestamp` token and attached it as Authorization —
// pure theater that delivered no security. It has been removed so the cookie is
// not mistaken for being backed by a second factor it never had.
function monkeyPatchFetchAndButtons() {
  const originalFetch = window.fetch;
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
    const isRequest = typeof Request !== 'undefined' && input instanceof Request;
    const method = (init?.method || (isRequest ? (input as Request).method : '') || '').toUpperCase();
    const btnToDisable = (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') ? activeClickEl : null;

    if (btnToDisable) {
      (btnToDisable as HTMLButtonElement).disabled = true;
      btnToDisable.setAttribute('data-ds-lock', 'true');
      btnToDisable.classList.add('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
    }

    // Shallow-clone init (never mutate the caller's object) and default
    // credentials so every same-origin request carries the session cookie.
    const reqInit: RequestInit = { ...(init || {}) };
    if (!reqInit.credentials) reqInit.credentials = 'same-origin';

    try {
      return await originalFetch(input, reqInit);
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
