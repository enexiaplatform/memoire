import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { DailyCapturePage } from './features/dailyCapture/DailyCapturePage';
import { SalesAssetsPage } from './features/assets/SalesAssetsPage';
import { OpportunitiesPage } from './features/opportunities/OpportunitiesPage';

const LandingPage = lazy(() => import('./pages/LandingPage').then((module) => ({ default: module.LandingPage })));
const LoginPage = lazy(() => import('./features/auth/LoginPage').then((module) => ({ default: module.LoginPage })));
const SignupPage = lazy(() => import('./features/auth/SignupPage').then((module) => ({ default: module.SignupPage })));
const VerifyEmailPage = lazy(() => import('./features/auth/VerifyEmailPage').then((module) => ({ default: module.VerifyEmailPage })));
const PricingPage = lazy(() => import('./features/pricing/PricingPage').then((module) => ({ default: module.PricingPage })));
const DemoEntryPage = lazy(() => import('./features/demo/DemoEntryPage').then((module) => ({ default: module.DemoEntryPage })));
const EarlyAccessRequestPage = lazy(() =>
  import('./features/earlyAccess/EarlyAccessRequestPage').then((module) => ({ default: module.EarlyAccessRequestPage })),
);
const DemoGuidePage = lazy(() => import('./features/demo/DemoGuidePage').then((module) => ({ default: module.DemoGuidePage })));
const ValidationFeedbackPage = lazy(() =>
  import('./features/validation/ValidationFeedbackPage').then((module) => ({ default: module.ValidationFeedbackPage })),
);
const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const SalesActivityCalendarPage = lazy(() =>
  import('./features/calendar/SalesActivityCalendarPage').then((module) => ({ default: module.SalesActivityCalendarPage })),
);
const SalesReviewsPage = lazy(() =>
  import('./features/reviews/SalesReviewsPage').then((module) => ({ default: module.SalesReviewsPage })),
);
const SalesPlaybookPage = lazy(() =>
  import('./features/playbook/SalesPlaybookPage').then((module) => ({ default: module.SalesPlaybookPage })),
);
const JourneyPage = lazy(() => import('./features/v31/JourneyPage').then((module) => ({ default: module.JourneyPage })));
const AccountsPage = lazy(() => import('./features/accounts/AccountsPage').then((module) => ({ default: module.AccountsPage })));
const AccountMemoryPage = lazy(() => import('./features/v31/AccountMemoryPage').then((module) => ({ default: module.AccountMemoryPage })));
const StakeholdersPage = lazy(() => import('./features/stakeholders/StakeholdersPage').then((module) => ({ default: module.StakeholdersPage })));
const ObjectionsPage = lazy(() => import('./features/objections/ObjectionsPage').then((module) => ({ default: module.ObjectionsPage })));
const AskMemoirePage = lazy(() => import('./features/v31/AskMemoirePage').then((module) => ({ default: module.AskMemoirePage })));
const PipelineReviewDefenseBriefPage = lazy(() =>
  import('./features/pipeline/PipelineReviewDefenseBriefPage').then((module) => ({ default: module.PipelineReviewDefenseBriefPage })),
);
const PipelineReviewPackPage = lazy(() =>
  import('./features/pipeline/PipelineReviewPackPage').then((module) => ({ default: module.PipelineReviewPackPage })),
);
const FirstPipelineReviewFlow = lazy(() =>
  import('./features/onboarding/FirstPipelineReviewFlow').then((module) => ({ default: module.FirstPipelineReviewFlow })),
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
          <Route path="/request-access" element={<EarlyAccessRequestPage />} />

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
            <Route path="demo-guide" element={<DemoGuidePage />} />
            <Route path="validation-feedback" element={<ValidationFeedbackPage />} />
            <Route path="today" element={<Navigate to="/app/dashboard" replace />} />
            <Route path="capture" element={<DailyCapturePage />} />
            <Route path="calendar" element={<SalesActivityCalendarPage />} />
            <Route path="reviews" element={<SalesReviewsPage />} />
            <Route path="playbook" element={<SalesPlaybookPage />} />
            <Route path="assets" element={<SalesAssetsPage />} />
            <Route path="journey" element={<JourneyPage />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="accounts/:accountId" element={<AccountMemoryPage />} />
            <Route path="opportunities" element={<OpportunitiesPage />} />
            <Route path="onboarding/pipeline-review" element={<FirstPipelineReviewFlow />} />
            <Route path="stakeholders" element={<StakeholdersPage />} />
            <Route path="objections" element={<ObjectionsPage />} />
            <Route path="pipeline-defense" element={<PipelineReviewDefenseBriefPage />} />
            <Route path="pipeline-defense/review-pack/:id" element={<PipelineReviewPackPage />} />
            <Route path="ask" element={<AskMemoirePage />} />
            <Route path="settings" element={<SettingsPage />} />

            {/* Legacy V0 routes, downgraded out of the primary V1 surface. */}
            <Route path="history" element={<Navigate to="/app/dashboard" replace />} />
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
