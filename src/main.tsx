import React from 'react';
import ReactDOM from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from './auth/AuthProvider';
import App from './App';
import { installGlobalErrorReporter } from './lib/globalErrorReporter';
import './index.css';

installGlobalErrorReporter();

// Hand the head back to Helmet.
//
// The marketing routes are prerendered (scripts/prerender.mjs), so their title,
// description, canonical, Open Graph tags and JSON-LD are already in the
// document when this file runs. Helmet cannot see them - it only tracks tags it
// created itself - so it adds a second copy of each, and the rendered DOM ends
// up with two canonical links and two robots directives. Identical ones today,
// which is harmless; the risk is the day they stop being identical, because
// Google resolves a conflicting pair by ignoring both.
//
// Removing them here is safe: the crawler that never runs JavaScript reads the
// original HTML and keeps the whole head, and Helmet replaces every one of
// these within the same tick.
document.querySelectorAll('[data-prerendered-seo]').forEach((tag) => tag.remove());

// Legacy sample-data cleanup only matters when the demo flag is set. The cheap
// flag check keeps the heavy sampleData module (and the domain stores it pulls
// in) out of the critical path for anonymous public-page visitors.
if (window.localStorage.getItem('memoire.sampleData.loaded') === 'true') {
  void import('./utils/sampleData').then((module) => module.sanitizeLegacySampleDataset());
}

// Registered after load so it never competes with the first render, and only
// in a real build: in dev the worker would serve a cached shell over Vite's
// own module graph and hide every change made since the tab was opened.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // No offline shell. Capture still writes to this device, and the banner
      // still reports what is waiting - there is nothing to tell the user here.
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HelmetProvider>
  </React.StrictMode>
);
