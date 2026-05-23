import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/layout/ProtectedRoute';

const LandingPage = lazy(() => import('./pages/LandingPage').then((module) => ({ default: module.LandingPage })));
const LoginPage = lazy(() => import('./features/auth/LoginPage').then((module) => ({ default: module.LoginPage })));
const SignupPage = lazy(() => import('./features/auth/SignupPage').then((module) => ({ default: module.SignupPage })));
const VerifyEmailPage = lazy(() => import('./features/auth/VerifyEmailPage').then((module) => ({ default: module.VerifyEmailPage })));
const PricingPage = lazy(() => import('./features/pricing/PricingPage').then((module) => ({ default: module.PricingPage })));
const DemoEntryPage = lazy(() => import('./features/demo/DemoEntryPage').then((module) => ({ default: module.DemoEntryPage })));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const TodayPage = lazy(() => import('./features/v31/TodayPage').then((module) => ({ default: module.TodayPage })));
const SalesActivityCalendarPage = lazy(() =>
  import('./features/calendar/SalesActivityCalendarPage').then((module) => ({ default: module.SalesActivityCalendarPage })),
);
const JourneyPage = lazy(() => import('./features/v31/JourneyPage').then((module) => ({ default: module.JourneyPage })));
const AccountsPage = lazy(() => import('./features/v31/AccountsPage').then((module) => ({ default: module.AccountsPage })));
const AccountMemoryPage = lazy(() => import('./features/v31/AccountMemoryPage').then((module) => ({ default: module.AccountMemoryPage })));
const OpportunitiesPage = lazy(() => import('./features/v31/OpportunitiesPage').then((module) => ({ default: module.OpportunitiesPage })));
const AskMemoirePage = lazy(() => import('./features/v31/AskMemoirePage').then((module) => ({ default: module.AskMemoirePage })));
const PipelineReviewDefenseBriefPage = lazy(() =>
  import('./features/pipeline/PipelineReviewDefenseBriefPage').then((module) => ({ default: module.PipelineReviewDefenseBriefPage })),
);

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteLoading />}>
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
            <Route path="calendar" element={<SalesActivityCalendarPage />} />
            <Route path="journey" element={<JourneyPage />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="accounts/:accountId" element={<AccountMemoryPage />} />
            <Route path="opportunities" element={<OpportunitiesPage />} />
            <Route path="pipeline-defense" element={<PipelineReviewDefenseBriefPage />} />
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
      </Suspense>
    </BrowserRouter>
  );
}

function RouteLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-600 shadow-sm">
        Loading Memoire...
      </div>
    </div>
  );
}

export default App;
