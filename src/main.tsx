import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import './styles/native-mobile.css';
import './styles/staff-mobile.css';
import 'leaflet/dist/leaflet.css';

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
