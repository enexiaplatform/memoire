import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './features/auth/LoginPage';
import { SignupPage } from './features/auth/SignupPage';
import { VerifyEmailPage } from './features/auth/VerifyEmailPage';
import { PricingPage } from './features/pricing/PricingPage';
import { DashboardPage } from './pages/DashboardPage';
import { CapturePage } from './features/capture/CapturePage';
import { HistoryPage } from './features/history/HistoryPage';
import { EntitiesPage } from './features/entities/EntitiesPage';
import { SearchPage } from './features/search/SearchPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { DealArchivePage } from './pages/DealArchivePage';
import { DealDetailPage } from './pages/DealDetailPage';
import { DealEditPage } from './pages/DealEditPage';

import { EntityDetailPage } from './features/entities/EntityDetailPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/pricing" element={<PricingPage />} />

        {/* Protected app routes */}
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/app/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="capture" element={<CapturePage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="entities" element={<EntitiesPage />} />
          <Route path="entities/:entityId" element={<EntityDetailPage />} />
          <Route path="deals" element={<DealArchivePage />} />
          <Route path="deals/new" element={<DealEditPage />} />
          <Route path="deals/:id" element={<DealDetailPage />} />
          <Route path="deals/:id/edit" element={<DealEditPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
