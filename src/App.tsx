import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { AppErrorBoundary } from './components/common/AppErrorBoundary';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { isFounderWorkspaceEnabled } from './lib/demoMode';
import { LibraryGate } from './features/library/LibraryGate';

const AppShell = lazy(() => import('./components/layout/AppShell').then((module) => ({ default: module.AppShell })));
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
const SharedBriefPage = lazy(() => import('./features/pipeline/SharedBriefPage').then((module) => ({ default: module.SharedBriefPage })));
const ValidationFeedbackPage = lazy(() =>
  import('./features/validation/ValidationFeedbackPage').then((module) => ({ default: module.ValidationFeedbackPage })),
);
const TodayPage = lazy(() => import('./features/dashboard/DashboardPage').then((module) => ({ default: module.TodayPage })));
const TimelinePage = lazy(() => import('./features/timeline/TimelinePage').then((module) => ({ default: module.TimelinePage })));
const OperatingSystemPage = lazy(() =>
  import('./features/operatingSystem/OperatingSystemPage').then((module) => ({ default: module.OperatingSystemPage })),
);
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
const SalesReviewsPage = lazy(() =>
  import('./features/reviews/SalesReviewsPage').then((module) => ({ default: module.SalesReviewsPage })),
);
const SalesPlaybookPage = lazy(() =>
  import('./features/playbook/SalesPlaybookPage').then((module) => ({ default: module.SalesPlaybookPage })),
);
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
const FounderImportReviewPage = lazy(() =>
  import('./features/imports/FounderImportReviewPage').then((module) => ({ default: module.FounderImportReviewPage })),
);
const BusinessVaultPage = lazy(() =>
  import('./features/vault/BusinessVaultPage').then((module) => ({ default: module.BusinessVaultPage })),
);

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppErrorBoundary>
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
          <Route path="/share/brief" element={<SharedBriefPage />} />

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

            {/* The six primary destinations. See src/config/featureRegistry.ts -
                nothing may be added here without a registry entry. */}
            <Route path="today" element={<TodayPage />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="opportunities" element={<OpportunitiesPage />} />
            <Route path="revenue" element={<RevenueViewPage />} />
            <Route path="timeline" element={<TimelinePage />} />
            <Route path="reviews" element={<SalesReviewsPage />} />

            {/* Global actions: reachable everywhere, not destinations. */}
            <Route path="capture" element={<DailyCapturePage />} />
            <Route path="ask" element={<AskMemoirePage />} />
            <Route path="settings" element={<SettingsPage />} />

            {/* Contextual surfaces: opened from a record, a search result or a
                deep link, never from the nav rail. */}
            <Route path="quotes" element={<QuotesPage />} />
            {/* The Account and Opportunity pages show stakeholders and
                objections in place. These two routes are the editors behind
                those panels - reachable from the record, never from the rail.
                Redirecting them instead would have silently removed the only
                way to create, edit or delete either record. */}
            <Route path="stakeholders" element={<StakeholdersPage />} />
            <Route path="objections" element={<ObjectionsPage />} />
            {/* Was the "Operating System" destination. It is the only editor for
                initiative records, so the route survives as the must-win-work
                editor behind Review; only the standalone destination and the
                "we are an operating system" framing are gone. */}
            <Route path="operating-system" element={<OperatingSystemPage />} />
            <Route path="pipeline-defense" element={<PipelineReviewDefenseBriefPage />} />
            <Route path="pipeline-defense/review-pack/:id" element={<PipelineReviewPackPage />} />
            <Route path="demo-guide" element={<DemoGuidePage />} />

            {/* Hidden until the workspace has real outcome evidence. The routes
                stay resolvable so existing records are never stranded. */}
            <Route path="playbook" element={<LibraryGate title="Playbook"><SalesPlaybookPage /></LibraryGate>} />
            <Route path="assets" element={<LibraryGate title="Assets"><SalesAssetsPage /></LibraryGate>} />

            {/* Founder-only operator tooling. */}
            <Route path="imports" element={<FounderImportReviewPage />} />
            <Route path="vault" element={<BusinessVaultPage />} />
            <Route
              path="validation-feedback"
              element={isFounderWorkspaceEnabled ? <ValidationFeedbackPage /> : <Navigate to="/app/today" replace />}
            />

            {/* Retired destinations. Deep links, bookmarks and shared links keep
                working; each lands on the surface that now owns the job. */}
            <Route path="dashboard" element={<LegacyRedirect to="/app/today" />} />
            <Route path="plan" element={<LegacyRedirect to="/app/timeline" params={{ view: 'upcoming' }} />} />
            <Route path="activity" element={<LegacyRedirect to="/app/timeline" params={{ view: 'history' }} />} />
            <Route path="calendar" element={<LegacyRedirect to="/app/timeline" params={{ view: 'history' }} />} />
            <Route path="weekly-brief" element={<LegacyRedirect to="/app/reviews" />} />
            <Route path="onboarding/pipeline-review" element={<LegacyRedirect to="/app/reviews" />} />
            <Route path="onboarding/sales-operating-setup" element={<LegacyRedirect to="/app/settings" />} />
            <Route path="onboarding/quick-start" element={<LegacyRedirect to="/app/today" />} />

            {/* Legacy V0 routes, downgraded out of the primary surface. */}
            <Route path="accounts/:accountId" element={<LegacyAccountRouteRedirect />} />
            <Route path="journey" element={<LegacyRedirect to="/app/accounts" />} />
            <Route path="history" element={<LegacyRedirect to="/app/timeline" params={{ view: 'history' }} />} />
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
      </AppErrorBoundary>
    </BrowserRouter>
  );
}

/**
 * Redirects a retired route while keeping its query string and hash.
 *
 * A plain <Navigate> drops them, which would have quietly broken every deep
 * link that carries a record id - `/app/activity?activityId=...` is generated
 * by Today, the plan board and Search, and would have landed on an unfiltered
 * Timeline with the record nowhere in sight. `params` supplies the destination
 * defaults (which tab to open) without overwriting anything the caller sent.
 */
function LegacyRedirect({ to, params }: { to: string; params?: Record<string, string> }) {
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(params || {})) {
    if (!search.has(key)) search.set(key, value);
  }
  const query = search.toString();
  return <Navigate to={`${to}${query ? `?${query}` : ''}${location.hash}`} replace />;
}

function LegacyAccountRouteRedirect() {
  const { accountId = '' } = useParams();
  return <Navigate to={`/app/accounts?accountId=${encodeURIComponent(accountId)}`} replace />;
}

function RouteLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div
        className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-600 shadow-sm"
        aria-label="Loading Memoire workspace"
      >
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-brand-blue" />
        Loading Memoire workspace...
      </div>
    </div>
  );
}

export default App;
