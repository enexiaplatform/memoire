import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './features/auth/LoginPage';
import { SignupPage } from './features/auth/SignupPage';
import { VerifyEmailPage } from './features/auth/VerifyEmailPage';
import { PricingPage } from './features/pricing/PricingPage';
import { DemoEntryPage } from './features/demo/DemoEntryPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { TodayPage } from './features/v31/TodayPage';
import { JourneyPage } from './features/v31/JourneyPage';
import { AccountsPage } from './features/v31/AccountsPage';
import { AccountMemoryPage } from './features/v31/AccountMemoryPage';
import { OpportunitiesPage } from './features/v31/OpportunitiesPage';
import { AskMemoirePage } from './features/v31/AskMemoirePage';

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
        <Route path="/demo" element={<DemoEntryPage />} />

        {/* Protected app routes */}
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/app/today" replace />} />
          <Route path="today" element={<TodayPage />} />
          <Route path="journey" element={<JourneyPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="accounts/:accountId" element={<AccountMemoryPage />} />
          <Route path="opportunities" element={<OpportunitiesPage />} />
          <Route path="ask" element={<AskMemoirePage />} />
          <Route path="settings" element={<SettingsPage />} />

          {/* Legacy V0 routes, downgraded out of the primary V1 surface. */}
          <Route path="dashboard" element={<Navigate to="/app/today" replace />} />
          <Route path="capture" element={<Navigate to="/app/today" replace />} />
          <Route path="history" element={<Navigate to="/app/today" replace />} />
          <Route path="entities" element={<Navigate to="/app/accounts" replace />} />
          <Route path="entities/:entityId" element={<Navigate to="/app/accounts" replace />} />
          <Route path="deals" element={<Navigate to="/app/opportunities" replace />} />
          <Route path="deals/new" element={<Navigate to="/app/opportunities" replace />} />
          <Route path="deals/:id" element={<Navigate to="/app/opportunities" replace />} />
          <Route path="deals/:id/edit" element={<Navigate to="/app/opportunities" replace />} />
          <Route path="search" element={<Navigate to="/app/ask" replace />} />
        </Route>

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
