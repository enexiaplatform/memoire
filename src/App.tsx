import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { isFounderWorkspaceEnabled } from './lib/demoMode';

const LandingPage = lazy(() => import('./pages/LandingPage').then((module) => ({ default: module.LandingPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })));
const LoginPage = lazy(() => import('./features/auth/LoginPage').then((module) => ({ default: module.LoginPage })));
const SignupPage = lazy(() => import('./features/auth/SignupPage').then((module) => ({ default: module.SignupPage })));
const VerifyEmailPage = lazy(() => import('./features/auth/VerifyEmailPage').then((module) => ({ default: module.VerifyEmailPage })));
const ForgotPasswordPage = lazy(() =>
  import('./features/auth/ForgotPasswordPage').then((module) => ({ default: module.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import('./features/auth/ResetPasswordPage').then((module) => ({ default: module.ResetPasswordPage })),
);
const PricingPage = lazy(() => import('./features/pricing/PricingPage').then((module) => ({ default: module.PricingPage })));
const DemoEntryPage = lazy(() => import('./features/demo/DemoEntryPage').then((module) => ({ default: module.DemoEntryPage })));
const EarlyAccessRequestPage = lazy(() =>
  import('./features/earlyAccess/EarlyAccessRequestPage').then((module) => ({ default: module.EarlyAccessRequestPage })),
);
const LegalPage = lazy(() => import('./features/legal/LegalPage').then((module) => ({ default: module.LegalPage })));
const DemoGuidePage = lazy(() => import('./features/demo/DemoGuidePage').then((module) => ({ default: module.DemoGuidePage })));
const ValidationFeedbackPage = lazy(() =>
  import('./features/validation/ValidationFeedbackPage').then((module) => ({ default: module.ValidationFeedbackPage })),
);
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const DailyCapturePage = lazy(() =>
  import('./features/dailyCapture/DailyCapturePage').then((module) => ({ default: module.DailyCapturePage })),
);
const OpportunitiesPage = lazy(() =>
  import('./features/opportunities/OpportunitiesPage').then((module) => ({ default: module.OpportunitiesPage })),
);
const SalesAssetsPage = lazy(() =>
  import('./features/assets/SalesAssetsPage').then((module) => ({ default: module.SalesAssetsPage })),
);
const QuotesPage = lazy(() => import('./features/quotes/QuotesPage').then((module) => ({ default: module.QuotesPage })));
const RevenueViewPage = lazy(() => import('./features/revenue/RevenueViewPage').then((module) => ({ default: module.RevenueViewPage })));
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
const SalesOperatingSetupPage = lazy(() =>
  import('./features/onboarding/SalesOperatingSetupPage').then((module) => ({ default: module.SalesOperatingSetupPage })),
);
const FounderImportReviewPage = lazy(() =>
  import('./features/imports/FounderImportReviewPage').then((module) => ({ default: module.FounderImportReviewPage })),
);

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/demo" element={<DemoEntryPage />} />
          <Route path="/request-access" element={<EarlyAccessRequestPage />} />
          <Route path="/privacy" element={<Navigate to="/legal/privacy" replace />} />
          <Route path="/terms" element={<Navigate to="/legal/terms" replace />} />
          <Route path="/legal/:document" element={<LegalPage />} />

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
            <Route
              path="validation-feedback"
              element={isFounderWorkspaceEnabled ? <ValidationFeedbackPage /> : <Navigate to="/app/dashboard" replace />}
            />
            <Route path="today" element={<Navigate to="/app/dashboard" replace />} />
            <Route path="capture" element={<DailyCapturePage />} />
            <Route path="calendar" element={<SalesActivityCalendarPage />} />
            <Route path="reviews" element={<SalesReviewsPage />} />
            <Route path="playbook" element={<SalesPlaybookPage />} />
            <Route path="assets" element={<SalesAssetsPage />} />
            <Route path="journey" element={<JourneyPage />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="accounts/:accountId" element={<LegacyAccountRouteRedirect />} />
            <Route path="opportunities" element={<OpportunitiesPage />} />
            <Route path="quotes" element={<QuotesPage />} />
            <Route path="revenue" element={<RevenueViewPage />} />
            <Route path="onboarding/pipeline-review" element={<FirstPipelineReviewFlow />} />
            <Route path="onboarding/sales-operating-setup" element={<SalesOperatingSetupPage />} />
            <Route path="stakeholders" element={<StakeholdersPage />} />
            <Route path="objections" element={<ObjectionsPage />} />
            <Route path="pipeline-defense" element={<PipelineReviewDefenseBriefPage />} />
            <Route path="pipeline-defense/review-pack/:id" element={<PipelineReviewPackPage />} />
            <Route path="ask" element={<AskMemoirePage />} />
            <Route path="imports" element={<FounderImportReviewPage />} />
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

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

function LegacyAccountRouteRedirect() {
  const { accountId = '' } = useParams();
  return <Navigate to={`/app/accounts?accountId=${encodeURIComponent(accountId)}`} replace />;
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
