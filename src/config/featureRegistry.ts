/**
 * Feature lifecycle registry - the single source of truth for what Memoire
 * exposes as a product surface.
 *
 * Memoire is a Personal Commercial Control Tower. Its promise is "from
 * conversation to cash, nothing goes silent", and its whole operating loop runs
 * through six primary destinations. Every previous surface that grew its own
 * page has been re-classified here rather than deleted piecemeal, because the
 * failure mode this file exists to prevent is the slow return of a seventh nav
 * item: a page reappears, the sidebar grows, and the product stops being
 * describable in one sentence.
 *
 * The navigation renders from `primaryNavigation` / `globalActions`. Nothing
 * else may add a nav item, and `scripts/verify-navigation-contract.mjs` fails
 * the build if the six primary destinations change or a hidden feature becomes
 * visible.
 *
 * Statuses:
 *   core        - a primary destination in the beta product.
 *   global      - always reachable, but not a primary destination.
 *   embedded    - the capability survives inside an owner surface; its old
 *                 route redirects or renders in context.
 *   hidden      - data and code preserved, not reachable in normal navigation;
 *                 activates on a stated evidence condition.
 *   founder     - operator-only, behind the founder workspace flag.
 *   deprecated  - route kept for deep links only; no product investment.
 *   removed     - gone from the product surface entirely.
 */

export type FeatureStatus =
  | 'core'
  | 'global'
  | 'embedded'
  | 'hidden'
  | 'founder'
  | 'deprecated'
  | 'removed';

export type RouteBehavior = 'primary' | 'contextual' | 'redirect' | 'compatibility' | 'none';

export type AnalyticsStatus = 'active' | 'retained' | 'deprecated' | 'none';

export type FeatureRecord = {
  /** Stable identifier. Never reused for a different capability. */
  id: string;
  label: string;
  status: FeatureStatus;
  /** Where the capability lives now. For `core`, this is its own route. */
  ownerSurface: string;
  route: string | null;
  routeBehavior: RouteBehavior;
  navVisible: boolean;
  analytics: AnalyticsStatus;
  /** What happens to records this feature owns. Never "deleted" for user data. */
  dataRetention: string;
  /** The condition that would activate a hidden feature, or retire a live one. */
  killOrActivationCondition: string;
};

export const PRIMARY_DESTINATION_IDS = [
  'today',
  'accounts',
  'opportunities',
  'money',
  'timeline',
  'review',
] as const;

export type PrimaryDestinationId = (typeof PRIMARY_DESTINATION_IDS)[number];

export const featureRegistry: FeatureRecord[] = [
  // ---------------------------------------------------------------- primary
  {
    id: 'today',
    label: 'Today',
    status: 'core',
    ownerSurface: 'today',
    route: '/app/today',
    routeBehavior: 'primary',
    navVisible: true,
    analytics: 'active',
    dataRetention: 'Derived view. Owns no records.',
    killOrActivationCondition: 'Retire only if the daily loop moves elsewhere.',
  },
  {
    id: 'accounts',
    label: 'Accounts',
    status: 'core',
    ownerSurface: 'accounts',
    route: '/app/accounts',
    routeBehavior: 'primary',
    navVisible: true,
    analytics: 'active',
    dataRetention: 'Source of truth for accounts, contacts and stakeholders.',
    killOrActivationCondition: 'Never - a canonical kernel entity surface.',
  },
  {
    id: 'opportunities',
    label: 'Opportunities',
    status: 'core',
    ownerSurface: 'opportunities',
    route: '/app/opportunities',
    routeBehavior: 'primary',
    navVisible: true,
    analytics: 'active',
    dataRetention: 'Source of truth for opportunities and their stage evidence.',
    killOrActivationCondition: 'Never - a canonical kernel entity surface.',
  },
  {
    id: 'money',
    // Renamed from "Money" (2026-07-28, founder feedback): the surface is not
    // "all money things", it is the committed orders and their road to cash.
    label: 'Orders & Cash',
    status: 'core',
    ownerSurface: 'money',
    route: '/app/revenue',
    routeBehavior: 'primary',
    navVisible: true,
    analytics: 'active',
    dataRetention: 'Owns quotes and money checkpoints. Not an accounting ledger.',
    killOrActivationCondition: 'Never - commercial money flow is the differentiator.',
  },
  {
    id: 'timeline',
    label: 'Timeline',
    status: 'core',
    ownerSurface: 'timeline',
    route: '/app/timeline',
    routeBehavior: 'primary',
    navVisible: true,
    analytics: 'active',
    dataRetention: 'Presents plan items, commitments and commercial events. Owns none of them.',
    killOrActivationCondition: 'Never - Upcoming and History are the two halves of the ledger.',
  },
  {
    id: 'review',
    label: 'Review',
    status: 'core',
    ownerSurface: 'review',
    route: '/app/reviews',
    routeBehavior: 'primary',
    navVisible: true,
    analytics: 'active',
    dataRetention: 'Owns review packs and saved briefs as artifacts.',
    killOrActivationCondition: 'Never - the weekly loop closes here.',
  },

  // ---------------------------------------------------------------- global
  {
    id: 'capture',
    label: 'Capture',
    status: 'global',
    ownerSurface: 'capture',
    route: '/app/capture',
    routeBehavior: 'primary',
    navVisible: false,
    analytics: 'active',
    dataRetention: 'Creates commercial events. Raw text preserved.',
    killOrActivationCondition: 'Never - the entry point of the whole loop.',
  },
  {
    id: 'search-insights',
    label: 'Search & Insights',
    status: 'global',
    ownerSurface: 'search-insights',
    route: '/app/ask',
    routeBehavior: 'primary',
    navVisible: false,
    analytics: 'active',
    dataRetention: 'Derived query results only.',
    killOrActivationCondition: 'Never - bounded, deterministic answers over the workspace.',
  },
  {
    id: 'settings',
    label: 'Settings',
    status: 'global',
    ownerSurface: 'settings',
    route: '/app/settings',
    routeBehavior: 'primary',
    navVisible: false,
    analytics: 'active',
    dataRetention: 'Owns export, restore and sync recovery.',
    killOrActivationCondition: 'Never.',
  },
  {
    id: 'business-vault',
    label: 'Business Vault',
    status: 'global',
    ownerSurface: 'business-vault',
    route: '/app/vault',
    routeBehavior: 'primary',
    // Deliberately a global surface rather than a seventh primary destination.
    // It is a way of seeing the six, not a seventh place to work: everything on
    // the map is a customer, a deal or a brand that already has an owner
    // surface. Making it primary would be the exact drift this registry exists
    // to stop - and would have meant editing PRIMARY_DESTINATION_IDS, which is
    // a product decision, not a side effect of shipping a map.
    navVisible: true,
    analytics: 'active',
    dataRetention: 'Derived map. Owns no records.',
    killOrActivationCondition:
      'Retire if the map is never the thing that starts an action - a picture people admire and never click is decoration.',
  },

  // -------------------------------------------------------------- embedded
  {
    id: 'dashboard',
    label: 'Dashboard',
    status: 'embedded',
    ownerSurface: 'today/review',
    route: '/app/dashboard',
    routeBehavior: 'redirect',
    navVisible: false,
    analytics: 'deprecated',
    dataRetention: 'Derived only. Nothing to retain.',
    killOrActivationCondition:
      'Stays embedded. Immediate priorities and risks belong on Today; trends and history belong in Review.',
  },
  {
    id: 'pipeline-defense',
    label: 'Pipeline Defense',
    status: 'embedded',
    ownerSurface: 'review',
    route: '/app/pipeline-defense',
    routeBehavior: 'compatibility',
    navVisible: false,
    analytics: 'retained',
    dataRetention: 'Briefs and review packs preserved; shared brief links keep working.',
    killOrActivationCondition:
      'Stays an artifact produced by Review. Never a separate mental model.',
  },
  {
    id: 'plan',
    label: 'Plan',
    status: 'embedded',
    ownerSurface: 'timeline',
    route: '/app/plan',
    routeBehavior: 'redirect',
    navVisible: false,
    analytics: 'retained',
    dataRetention: 'Plan items preserved and shown under Timeline > Upcoming.',
    killOrActivationCondition: 'Stays embedded - a plan item is a future-dated action, not a module.',
  },
  {
    id: 'activity',
    label: 'Activity',
    status: 'embedded',
    ownerSurface: 'timeline',
    route: '/app/activity',
    routeBehavior: 'redirect',
    navVisible: false,
    analytics: 'retained',
    dataRetention: 'Sales activities preserved and shown under Timeline > History.',
    killOrActivationCondition: 'Stays embedded - history is one half of the timeline.',
  },
  {
    id: 'stakeholders',
    label: 'Stakeholders',
    status: 'embedded',
    ownerSurface: 'accounts/opportunities',
    route: '/app/stakeholders',
    routeBehavior: 'contextual',
    navVisible: false,
    analytics: 'deprecated',
    dataRetention: 'Stakeholder records preserved; shown on Account and Opportunity.',
    killOrActivationCondition:
      'Stays embedded - a stakeholder is a participant, not a destination. The route survives as the editor behind the Account and Opportunity panels, because those panels are read-only.',
  },
  {
    id: 'objections',
    label: 'Objections',
    status: 'embedded',
    ownerSurface: 'opportunities',
    route: '/app/objections',
    routeBehavior: 'contextual',
    navVisible: false,
    analytics: 'deprecated',
    dataRetention: 'Objection records preserved; shown under Opportunity > Risks & Objections.',
    killOrActivationCondition:
      'Stays embedded - an objection is context on a thread. The route survives as the editor behind the Opportunity panel.',
  },
  {
    id: 'quotes',
    label: 'Quotes',
    status: 'embedded',
    ownerSurface: 'money/opportunities',
    route: '/app/quotes',
    routeBehavior: 'contextual',
    navVisible: false,
    analytics: 'retained',
    dataRetention: 'Quote records fully preserved and still deep-linkable.',
    killOrActivationCondition:
      'Stays contextual. Memoire is not a document-generation or invoicing system.',
  },

  // ---------------------------------------------------------------- hidden
  {
    id: 'playbook',
    label: 'Playbook',
    status: 'hidden',
    ownerSurface: 'library (future)',
    route: '/app/playbook',
    routeBehavior: 'compatibility',
    navVisible: false,
    analytics: 'deprecated',
    dataRetention: 'Playbook records preserved untouched.',
    killOrActivationCondition:
      'Activates on real workspace evidence: >= 10 real commercial events, >= 1 won or lost opportunity, and >= 1 repeated objection with a recorded response. Sample data never counts.',
  },
  {
    id: 'assets',
    label: 'Assets',
    status: 'hidden',
    ownerSurface: 'library (future)',
    route: '/app/assets',
    routeBehavior: 'compatibility',
    navVisible: false,
    analytics: 'deprecated',
    dataRetention: 'Asset records preserved untouched.',
    killOrActivationCondition: 'Same evidence gate as playbook.',
  },
  {
    id: 'expenses-pnl',
    label: 'Expenses & profit-and-loss',
    status: 'hidden',
    ownerSurface: 'money',
    route: null,
    routeBehavior: 'none',
    navVisible: false,
    analytics: 'deprecated',
    dataRetention: 'Expense records preserved and still exported.',
    killOrActivationCondition:
      'Off by default: testing the commercial-control proposition and a solo-accounting proposition at once teaches neither. Re-enable only as a deliberate, separate experiment.',
  },

  // --------------------------------------------------------------- founder
  {
    id: 'founder-import',
    label: 'Founder Import',
    status: 'founder',
    ownerSurface: 'founder tooling',
    route: '/app/imports',
    routeBehavior: 'compatibility',
    navVisible: false,
    analytics: 'retained',
    dataRetention: 'Import audit trail preserved.',
    killOrActivationCondition: 'Founder-only forever. Never a primary destination.',
  },
  {
    id: 'cohort-console',
    label: 'Cohort qualification console',
    status: 'founder',
    ownerSurface: 'founder tooling',
    route: '/app/validation-feedback',
    routeBehavior: 'compatibility',
    navVisible: false,
    analytics: 'retained',
    dataRetention: 'Validation feedback preserved.',
    killOrActivationCondition: 'Founder-only.',
  },

  // --------------------------------------------------------------- removed
  {
    id: 'operating-system',
    label: 'Operating System page',
    status: 'embedded',
    ownerSurface: 'review',
    route: '/app/operating-system',
    routeBehavior: 'contextual',
    navVisible: false,
    analytics: 'deprecated',
    dataRetention: 'Operating-context (initiative) records preserved and still editable.',
    killOrActivationCondition:
      'The destination and its "Memoire is an operating system" framing are gone; it is now the must-win-work editor opened from Review. It survives as a route only because it is the sole editor for initiative records - deleting it would have removed user capability, not just a page.',
  },
  {
    id: 'workspace-lens',
    label: 'Workspace Lens',
    status: 'removed',
    ownerSurface: 'none',
    route: null,
    routeBehavior: 'none',
    navVisible: false,
    analytics: 'deprecated',
    dataRetention: 'Preference key abandoned; it never shaped any record.',
    killOrActivationCondition:
      'Removed. One product, one voice, one target user during validation.',
  },
  {
    id: 'sales-operating-setup',
    label: 'Sales Operating Setup',
    status: 'removed',
    ownerSurface: 'settings',
    route: '/app/onboarding/sales-operating-setup',
    routeBehavior: 'redirect',
    navVisible: false,
    analytics: 'deprecated',
    dataRetention: 'Operating-context records preserved.',
    killOrActivationCondition:
      'Removed from the beta journey. Nobody should define a GTM system before experiencing value.',
  },
  {
    id: 'quick-start-setup',
    label: 'Quick Start Setup',
    status: 'removed',
    ownerSurface: 'first-week-path',
    route: '/app/onboarding/quick-start',
    routeBehavior: 'redirect',
    navVisible: false,
    analytics: 'deprecated',
    dataRetention: 'No records of its own.',
    killOrActivationCondition: 'Folded into the single First Week Path.',
  },
  {
    id: 'first-pipeline-review-flow',
    label: 'First Pipeline Review Flow',
    status: 'removed',
    ownerSurface: 'review',
    route: '/app/onboarding/pipeline-review',
    routeBehavior: 'redirect',
    navVisible: false,
    analytics: 'deprecated',
    dataRetention: 'No records of its own.',
    killOrActivationCondition: "Folded into Review's empty state.",
  },
];

const byId = new Map(featureRegistry.map((feature) => [feature.id, feature]));

export function getFeature(id: string): FeatureRecord | undefined {
  return byId.get(id);
}

export function isFeatureVisible(id: string): boolean {
  return byId.get(id)?.navVisible === true;
}

/** The six primary destinations, in navigation order. */
export const primaryNavigation: FeatureRecord[] = PRIMARY_DESTINATION_IDS.map((id) => {
  const feature = byId.get(id);
  if (!feature) throw new Error(`Feature registry is missing primary destination "${id}"`);
  return feature;
});

/** Always reachable, never a primary destination. */
export const globalActions: FeatureRecord[] = ['capture', 'search-insights', 'business-vault', 'settings'].map((id) => {
  const feature = byId.get(id);
  if (!feature) throw new Error(`Feature registry is missing global action "${id}"`);
  return feature;
});
