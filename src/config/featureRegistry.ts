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
 * The navigation renders from `navigationGroups`, which is assembled here from
 * `primaryNavigation` and `globalActions`. Nothing else may add a nav item, and
 * `scripts/verify-navigation-contract.mjs` fails the build if the six primary
 * destinations change, if a hidden feature becomes visible, or if a rail item
 * exists that no group claims.
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

/**
 * The three blocks of the navigation rail.
 *
 * Status ("is this a primary destination?") and grouping ("where does it sit in
 * the rail?") used to be the same thing, and the rail read as two tiers: the six
 * primary destinations, then everything else. That is a statement about product
 * architecture, not about how the operator works. Reading it top to bottom, the
 * old order asked you to jump between rhythms - a daily surface, then a records
 * surface, then a weekly one - and the lens that answers "how is the business
 * doing" sat below the fold with Settings.
 *
 * The rail is now grouped by the question being asked, not by registry status:
 *
 *   run     - the operating rhythm: today, this week, the picture, the review.
 *   records - the three books the rhythm reads and writes.
 *   tools   - ways of searching and seeing, plus workspace settings.
 *
 * Primary destinations still exist and are still exactly six; four of them sit
 * in `run` and three in `records`, and one lens (`business-lens`) sits in `run`
 * because that is where the operator looks for it, not because its status
 * changed. `PRIMARY_DESTINATION_IDS` remains the product decision;
 * `NAVIGATION_GROUPS` is only the shape of the rail.
 */
export type NavGroupId = 'run' | 'records' | 'tools';

export type FeatureRecord = {
  /** Stable identifier. Never reused for a different capability. */
  id: string;
  label: string;
  /**
   * The name to use where there is no room for the real one - today, the phone
   * tab bar, where five labels share a 390px row. Only set it where the full
   * label would truncate, and only to a word the product already says out loud.
   */
  shortLabel?: string;
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
    // "Opportunities" truncates to "Opportuniti..." in a five-up tab bar. Deals
    // is what the product already calls them in every sentence it writes.
    shortLabel: 'Deals',
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
    //
    // Shortened again to "Orders" (2026-08-02). "& Cash" was doing no work in
    // the rail: cash is where an order ends, so naming both halves described the
    // page rather than naming the thing you go there to look at. The page still
    // walks contract to collection - the noun in the rail is just the record.
    label: 'Orders',
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
    // Renamed from "Timeline" (2026-08-02). The id stays `timeline` and the
    // route stays /app/timeline, because the destination did not change: it is
    // still the one ledger with Upcoming and History as its two halves.
    //
    // What changed is the name's honesty. "Timeline" describes the data
    // structure; nobody opens it to look at a timeline, they open it to work
    // out what this week holds. Upcoming - the plan board - is what the surface
    // opens on and where the operator spends their time, so the rail now says
    // the job. History is not demoted by this: it is the same ledger read
    // backwards, and it keeps its tab, its deep links and its route.
    label: 'Plan',
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
    // Genuinely false: Capture is the button in the top bar and the home-screen
    // shortcut on a phone. It is an action, not a place in the rail.
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
    // Was declared false while sitting in the rail all along: `navVisible` had
    // drifted into meaning "is a primary destination", which is what `status`
    // already says. It means what it says again - this is in the rail, so it is
    // true, and `navigationGroups` refuses to build a rail item that claims
    // otherwise.
    navVisible: true,
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
    // In the rail's last group. See the note on search-insights above.
    navVisible: true,
    analytics: 'active',
    dataRetention: 'Owns export, restore and sync recovery.',
    killOrActivationCondition: 'Never.',
  },
  {
    id: 'activity',
    label: 'Activity',
    status: 'global',
    ownerSurface: 'activity',
    route: '/app/activity',
    routeBehavior: 'primary',
    // Global, not a seventh primary destination, and the distinction is real
    // rather than a dodge around this file. Activity owns no records: every row
    // on it is a captured touch or a plan item that Timeline, Capture and the
    // deal already own, resolved to the one thing it was for. You do not go
    // there to work, you go there to find out what the work added up to - the
    // same job the Business Vault does for coverage. Promoting it would put two
    // calendars in the primary rail and force the operator to decide which one
    // "the week" lives in, which is the exact mistake the Plan/Activity merge
    // was undone to fix.
    navVisible: true,
    analytics: 'active',
    dataRetention: 'Derived ledger and pivots. Owns no records.',
    killOrActivationCondition:
      'Retire it if the pivot and the unattached-subject queue stop changing what the operator does next. Its one irreplaceable job is showing work that names a customer the workspace has never heard of - that work reaches no deal, no quote and no forecast, and a calendar cannot tell it apart from work that does.',
    // History: this id previously held the retired Activity *destination*, whose
    // route redirected into Timeline > History. Same capability, different
    // altitude - the ledger stayed under Timeline, and what came back is the
    // analysis over it. `/app/activity?activityId=...` still forwards to the
    // touch in Timeline > History, so every deep link ever generated resolves.
  },
  {
    id: 'business-lens',
    // Renamed from "Business" (2026-08-02) - and yes, "Dashboard" is the name
    // of a page this product deliberately retired. What was retired was the
    // *page*: a standalone surface that tried to answer "what should I do now"
    // and did it worse than Today. The word is not the mistake. "Dashboard" is
    // what every operator already calls the place they go to read instrument
    // values without touching the controls, which is exactly what this lens is
    // and exactly why it still has no action button on it.
    //
    // The retired id stays retired: `dashboard` below is still non-visible, and
    // /app/dashboard now redirects here rather than to Today, so the old
    // bookmark lands on the page that carries the name.
    label: 'Dashboard',
    status: 'global',
    ownerSurface: 'business-lens',
    route: '/app/business',
    routeBehavior: 'primary',
    // The third lens, and global for the same reason as the other two: it owns
    // no records and writes nothing. Every number on it is read from what
    // Accounts, Opportunities, Money and Timeline already wrote, and there is
    // not one action button on the page.
    //
    // The standalone Dashboard failed the feature gate in the 2026-07-26
    // refactor because it answered "what should I do now" worse than Today did.
    // This does not attempt that question - it answers "how is the business
    // doing", which is the one thing the six destinations each answer a slice
    // of and none of them answers whole. Promoting it to a seventh primary
    // would mean editing PRIMARY_DESTINATION_IDS, which is a product decision
    // and not a side effect of shipping charts.
    navVisible: true,
    analytics: 'active',
    dataRetention: 'Derived from the workspace. Owns no records.',
    killOrActivationCondition:
      'Retire it if the operator stops opening it between weekly reviews - that would mean the daily loop on Today and the weekly loop in Review already cover the question, and this is only decoration.',
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
    dataRetention: 'Derived coverage matrix. Owns no records.',
    killOrActivationCondition:
      'Was a force-directed map of accounts and deals; that drew the business accurately and was worthless, because it showed the operator the one thing they already know. It is now customer x line coverage, where the empty squares are the information. Retire it if those squares stop starting conversations.',
  },

  // -------------------------------------------------------------- embedded
  {
    id: 'dashboard',
    // The retired page, not the word. `business-lens` carries the label now, so
    // this record is named for what it actually is: the surface that was taken
    // apart in the 2026-07-26 refactor.
    label: 'Legacy dashboard page',
    status: 'embedded',
    ownerSurface: 'today/review/business-lens',
    route: '/app/dashboard',
    routeBehavior: 'redirect',
    navVisible: false,
    analytics: 'deprecated',
    dataRetention: 'Derived only. Nothing to retain.',
    killOrActivationCondition:
      'Stays embedded. Immediate priorities and risks belong on Today; trends and history belong in Review. Its route now forwards to the Business lens, which is what the rail calls Dashboard.',
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
    // The retired standalone board. The word "Plan" is back in the rail as the
    // name of the `timeline` destination, which is where this board has lived
    // since the merge - so this record is named for the old page to keep one
    // label per surface.
    label: 'Legacy plan board page',
    status: 'embedded',
    ownerSurface: 'timeline',
    route: '/app/plan',
    routeBehavior: 'redirect',
    navVisible: false,
    analytics: 'retained',
    dataRetention: 'Plan items preserved and shown under Plan > Upcoming.',
    killOrActivationCondition: 'Stays embedded - a plan item is a future-dated action, not a module.',
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
export const globalActions: FeatureRecord[] = ['capture', 'search-insights', 'activity', 'business-lens', 'business-vault', 'settings'].map((id) => {
  const feature = byId.get(id);
  if (!feature) throw new Error(`Feature registry is missing global action "${id}"`);
  return feature;
});

/**
 * The navigation rail, in order, grouped by the question each block answers.
 *
 * This is the only place the rail's shape is declared. The Sidebar renders it
 * and knows nothing else; the mobile tab bar takes its first row from the same
 * list. Adding a nav item means adding an id here, in a reviewed file, which is
 * the whole point - a rail that grows by accident is how the last suite got
 * away from us.
 *
 * Capture is deliberately absent: it is the button in the top bar and the
 * install shortcut on a phone, not a place you navigate to.
 */
const NAVIGATION_GROUP_IDS: { id: NavGroupId; label: string; itemIds: string[] }[] = [
  {
    id: 'run',
    // No heading rendered for the first block - the wordmark above it is the
    // heading, and an operator does not need to be told that Today is where
    // running the business starts.
    label: '',
    itemIds: ['today', 'timeline', 'business-lens', 'review'],
  },
  {
    id: 'records',
    label: 'Records',
    // Activity sits here from 2026-08-03. It is still `status: 'global'` and
    // still owns no records - every row is a captured touch or a plan item that
    // Capture, Timeline and the deal already own. What changed is how the
    // operator reads it: they go to Activity to look up a specific piece of
    // work, by customer, the same way they open Accounts to look up a customer.
    // That is a Records question, and filing it under "Workspace" next to
    // Settings hid it. Position in the rail is presentation; status is the
    // contract, and the contract is unchanged - it is still absent from
    // PRIMARY_DESTINATION_IDS and still writes nothing.
    itemIds: ['accounts', 'opportunities', 'money', 'activity'],
  },
  {
    id: 'tools',
    label: 'Workspace',
    itemIds: ['search-insights', 'business-vault', 'settings'],
  },
];

export type NavGroup = {
  id: NavGroupId;
  label: string;
  items: FeatureRecord[];
};

export const navigationGroups: NavGroup[] = NAVIGATION_GROUP_IDS.map((group) => ({
  id: group.id,
  label: group.label,
  items: group.itemIds.map((id) => {
    const feature = byId.get(id);
    if (!feature) throw new Error(`Feature registry is missing nav item "${id}"`);
    if (!feature.route) throw new Error(`Nav item "${id}" has no route`);
    if (!feature.navVisible) throw new Error(`Nav item "${id}" is not navVisible`);
    return feature;
  }),
}));

/**
 * The phone's bottom tab bar.
 *
 * Four destinations plus a "More" button that opens the same rail. Chosen from
 * what a distributor actually does away from the desk: what is on today, what
 * the week holds, and looking up a customer or a deal before walking into a
 * meeting. Capture is not here because it is already the primary button in the
 * top bar on every screen width.
 *
 * Everything else stays one tap away in the drawer. The point of the bar is
 * that the four things people open twenty times a day never require opening a
 * drawer at all.
 */
export const MOBILE_TAB_IDS = ['today', 'timeline', 'accounts', 'opportunities'] as const;

export const mobileTabs: FeatureRecord[] = MOBILE_TAB_IDS.map((id) => {
  const feature = byId.get(id);
  if (!feature) throw new Error(`Feature registry is missing mobile tab "${id}"`);
  return feature;
});
