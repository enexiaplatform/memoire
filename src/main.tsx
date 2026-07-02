import React from 'react';
import ReactDOM from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from './auth/AuthProvider';
import App from './App';
import './index.css';

// Legacy sample-data cleanup only matters when the demo flag is set. The cheap
// flag check keeps the heavy sampleData module (and the domain stores it pulls
// in) out of the critical path for anonymous public-page visitors.
if (window.localStorage.getItem('memoire.sampleData.loaded') === 'true') {
  void import('./utils/sampleData').then((module) => module.sanitizeLegacySampleDataset());
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
