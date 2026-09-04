import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { API_URL } from '@/lib/api';
import { VIEW_AS_COMPANY_KEY } from '@/context/AuthContext';
import './index.css';
import './styles/native-mobile.css';
import './styles/staff-mobile.css';
import 'leaflet/dist/leaflet.css';

/**
 * "View as Company" — the System Admin's per-browser override (see AuthContext's
 * viewAsCompany/setViewAsCompany), applied by tagging every authenticated API request with an
 * x-view-as-company header so the backend can scope data as if the admin were a member of that
 * company. There is no single fetch wrapper shared across the app (~16 API modules each define
 * their own), so a global fetch patch here is the only choke point that reaches all of them —
 * including the many page components that call fetch() directly instead of going through an
 * api/*.ts helper. The backend (middleware/tenant.js) only ever honors this header for a real
 * System Admin account; a stale header on any other user's browser is simply ignored server-side.
 */
if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const viewAs = localStorage.getItem(VIEW_AS_COMPANY_KEY);
    if (!viewAs) return nativeFetch(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!url || !url.startsWith(API_URL)) return nativeFetch(input, init);
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('x-view-as-company', viewAs);
    return nativeFetch(input, { ...init, headers });
  };
}

/** Block pinch-zoom on iOS where viewport meta alone is not enough */
if (typeof window !== 'undefined') {
  const blockPinch = (e: Event) => e.preventDefault();
  const mq = window.matchMedia('(max-width: 767px)');
  let attached = false;
  const syncPinchBlock = () => {
    if (!mq.matches || attached) return;
    document.addEventListener('gesturestart', blockPinch, { passive: false });
    document.addEventListener('gesturechange', blockPinch, { passive: false });
    attached = true;
  };
  syncPinchBlock();
  mq.addEventListener('change', syncPinchBlock);

  window.addEventListener('load', () => {
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/service-worker.js').then((registration) => registration.update());
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
