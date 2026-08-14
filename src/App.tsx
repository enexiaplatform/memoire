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
const UseCasesPage = lazy(() => import('./features/useCases/UseCasesPage').then((module) => ({ default: module.UseCasesPage })));
const EarlyAccessRequestPage = lazy(() =>
  import('./features/earlyAccess/EarlyAccessRequestPage').then((module) => ({ default: module.EarlyAccessRequestPage })),
);
const LegalPage = lazy(() => import('./features/legal/LegalPage').then((module) => ({ default: module.LegalPage })));
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
const CostAnalysisPage = lazy(() => import('./features/revenue/CostAnalysisPage').then((module) => ({ default: module.CostAnalysisPage })));
const CashCollectionPage = lazy(() => import('./features/revenue/CashCollectionPage').then((module) => ({ default: module.CashCollectionPage })));
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
const BusinessLensPage = lazy(() =>
  import('./features/business/BusinessLensPage').then((module) => ({ default: module.BusinessLensPage })),
);
const BusinessVaultPage = lazy(() =>
  import('./features/vault/BusinessVaultPage').then((module) => ({ default: module.BusinessVaultPage })),
);
const ActivityPage = lazy(() =>
  import('./features/activity/ActivityPage').then((module) => ({ default: module.ActivityPage })),
);
const PortfolioCoveragePage = lazy(() =>
  import('./features/coverage/PortfolioCoveragePage').then((module) => ({ default: module.PortfolioCoveragePage })),
);
const FirstRunPage = lazy(() =>
  import('./features/onboarding/FirstRunPage').then((module) => ({ default: module.FirstRunPage })),
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
          <Route path="/use-cases" element={<UseCasesPage />} />
          <Route path="/request-access" element={<EarlyAccessRequestPage />} />
          <Route path="/privacy" element={<Navigate to="/legal/privacy" replace />} />
          <Route path="/terms" element={<Navigate to="/legal/terms" replace />} />
          <Route path="/legal/:document" element={<LegalPage />} />
          <Route path="/share/brief" element={<SharedBriefPage />} />

          {/* The welcome. Protected like the rest of `/app`, but deliberately
              outside the shell: a first-run screen framed by a navigation rail
              of eleven destinations the person has no reason to understand yet
              is the confusion it exists to prevent. React Router ranks this
              static path above the shell's catch-all child. */}
          <Route
            path="/app/start"
            element={
              <ProtectedRoute>
                <FirstRunPage />
              </ProtectedRoute>
            }
          />

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
            <Route path="activity" element={<ActivityRouteEntry />} />
            {/* The buy side of the order book. Its own destination since
                2026-08-06 - see the registry entry for why it left the Orders
                page it used to sit inside. */}
            <Route path="cost-analysis" element={<CostAnalysisPage />} />
            {/* Separate from Orders on purpose, at the founder's call on
                2026-08-06: an order is a thing you fulfil and a receivable is a
                thing you chase, and a delivery that is on time can sit behind
                money that is ninety days late. */}
            <Route path="cash-collection" element={<CashCollectionPage />} />
            <Route path="business" element={<BusinessLensPage />} />
            <Route path="vault" element={<BusinessVaultPage />} />
            <Route path="settings" element={<SettingsPage />} />

            {/* Contextual surfaces: opened from a record, a search result or a
                deep link, never from the nav rail. */}
            <Route path="quotes" element={<QuotesPage />} />
            {/* The customer x line grid. It was the Business Vault until
                2026-08-09; the Vault is now business memory, and a grid of
                accounts against lines belongs beside Accounts. Contextual
                rather than a fifteenth rail row: reached from the Accounts
                header and from the Vault's Library, both of which are places
                someone is already asking a coverage question. */}
            <Route path="portfolio-coverage" element={<PortfolioCoveragePage />} />
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

            {/* Hidden until the workspace has real outcome evidence. The routes
                stay resolvable so existing records are never stranded. */}
            <Route path="playbook" element={<LibraryGate title="Playbook"><SalesPlaybookPage /></LibraryGate>} />
            <Route path="assets" element={<LibraryGate title="Assets"><SalesAssetsPage /></LibraryGate>} />

            {/* Founder-only operator tooling. */}
            <Route path="imports" element={<FounderImportReviewPage />} />
            <Route
              path="validation-feedback"
              element={isFounderWorkspaceEnabled ? <ValidationFeedbackPage /> : <Navigate to="/app/today" replace />}
            />

            {/* Retired destinations. Deep links, bookmarks and shared links keep
                working; each lands on the surface that now owns the job. */}
            {/* Followed Today until 2026-08-02, when the Business lens took the
                name "Dashboard" in the rail. A bookmark to /app/dashboard now
                lands on the page that carries that name; the daily loop it used
                to forward to is one tap away and is not what someone typing
                "dashboard" is looking for. */}
            <Route path="dashboard" element={<LegacyRedirect to="/app/business" />} />
            <Route path="plan" element={<LegacyRedirect to="/app/timeline" params={{ view: 'upcoming' }} />} />
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

            {/* Singular/plural. `/app/plan` and `/app/dashboard` redirected and
                `/app/review` 404'd, which is a coin toss the operator has to
                lose once to learn. The rail writes the plural; both are typed. */}
            <Route path="review" element={<LegacyRedirect to="/app/reviews" />} />
            <Route path="account" element={<LegacyRedirect to="/app/accounts" />} />
            <Route path="opportunity" element={<LegacyRedirect to="/app/opportunities" />} />
            <Route path="stakeholder" element={<LegacyRedirect to="/app/stakeholders" />} />
            <Route path="quote" element={<LegacyRedirect to="/app/quotes" />} />
            <Route path="objection" element={<LegacyRedirect to="/app/objections" />} />

            {/* Anything else under /app is still a Memoire page as far as the
                operator is concerned, so it keeps the shell - rail, header, a
                way back - rather than dropping to a bare document. */}
            <Route path="*" element={<NotFoundPage />} />
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

/**
 * `/app/activity` serves two jobs that used to be one.
 *
 * The Activity surface is now the analysis over the ledger, so the bare URL
 * renders it. But `/app/activity?activityId=...` has been a live deep link since
 * the ledger lived here - Today, Search and the daily digest all generate it, and
 * it is expected to open that exact touch with its detail modal. A row id is a
 * request for a record, not for a dashboard, so it keeps forwarding to Timeline >
 * History where the record and its modal live.
 */
function ActivityRouteEntry() {
  const location = useLocation();
  const hasRecordId = new URLSearchParams(location.search).has('activityId');
  if (hasRecordId) return <LegacyRedirect to="/app/timeline" params={{ view: 'history' }} />;
  return <ActivityPage />;
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
