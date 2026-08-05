/**
 * How this customer is allowed to buy - and what that obliges the seller to do.
 *
 * This was a free-text box, and a free-text box is the wrong shape for it. The
 * route is not a description of a deal, it is the single fact that decides how
 * long the deal takes, what has to exist before a PO can be raised, and whether
 * there is a deadline that can be missed. Written as prose it is unreadable by
 * the app and usually left blank; written as a route it can be counted, warned
 * about, and turned into the next action.
 *
 * The routes below are deliberately about **what the seller must do**, not
 * about procurement law. "Needs competing quotes" is a fact about the work;
 * naming a specific regulation would be a claim this product cannot keep
 * current across the markets it is used in.
 *
 * `Not known yet` is the honest default and is treated as a gap rather than an
 * answer: not knowing how a customer buys is the most common reason a deal that
 * looked ready sits still for a quarter.
 */
export const procurementRoutes = [
  'Not known yet',
  'Direct purchase',
  'Quote comparison',
  'Open tender',
  'Framework / existing contract',
  'Through distributor or agent',
] as const;

export type ProcurementRoute = (typeof procurementRoutes)[number];

/**
 * Where the answer to a requirement already lives in the deal record.
 *
 * This is the difference between a checklist and a list of sentences. The three
 * named fields are ones the workspace can read, so the route can tell the
 * seller which of its demands they have already met and which are still open -
 * without asking them to re-record anything. `ask` means the answer is not
 * something Memoire can see; those become a next action instead of a tick.
 */
export type ProcurementRequirementSource =
  | 'budgetOwner'
  | 'decisionMaker'
  | 'technicalCriteria'
  | 'closeDate'
  | 'ask';

export type ProcurementRequirement = {
  /** What must exist, in the seller's words. */
  label: string;
  /** Which field answers it, or `ask` when only the customer can. */
  source: ProcurementRequirementSource;
  /**
   * The next action to write when this one is still open. Phrased as the thing
   * to do to a person, because a next action that reads like a checklist item
   * ("tender documents") tells you nothing on the morning you meet it.
   */
  action: string;
};

export type ProcurementRouteGuide = {
  /** One line: what this route means for the seller. */
  meaning: string;
  /** What has to be true before this customer can raise a PO. */
  requirements: ProcurementRequirement[];
  /** The thing most likely to lose the deal on this route. */
  risk: string;
  /** True when the route runs to a deadline the seller does not control. */
  hasDeadline: boolean;
  /**
   * How long this route usually takes from quote to PO, as a range.
   *
   * Deliberately a band and deliberately vague at the edges: these are the
   * shapes of the routes, not a measurement of this workspace. Once a workspace
   * has enough closed deals per route to say something truer, this is the line
   * that gets replaced by its own history.
   */
  typicalDuration: string;
  /**
   * The one question to put to the customer this week. Every route has exactly
   * one that unblocks it, and naming it is more use than five that do not.
   */
  askThisWeek: string;
};

export const PROCUREMENT_ROUTE_GUIDE: Record<ProcurementRoute, ProcurementRouteGuide> = {
  'Not known yet': {
    meaning: 'Nobody has confirmed how this customer is able to buy.',
    requirements: [
      { label: 'The route itself, confirmed by someone who buys', source: 'ask', action: 'Ask how a purchase of this size is normally approved here' },
      { label: 'Who owns the budget', source: 'budgetOwner', action: 'Find out who signs for this budget' },
    ],
    risk: 'A quote sent down the wrong route is work the customer cannot act on.',
    hasDeadline: false,
    typicalDuration: 'Unknown until the route is confirmed',
    askThisWeek: 'When you buy something like this, what does the process look like on your side?',
  },
  'Direct purchase': {
    meaning: 'The buyer can raise a PO against your quote without running a competition.',
    requirements: [
      { label: "A quote in the buyer's required format", source: 'ask', action: 'Confirm the quote format and any PO reference the buyer needs on it' },
      { label: 'The budget owner named and available', source: 'budgetOwner', action: 'Name the budget owner and confirm they are the one who signs' },
      { label: 'A week the PO is expected in', source: 'closeDate', action: 'Ask which week the PO can be raised, and set it as the expected close date' },
    ],
    risk: 'Nothing forces a date, so it slips quietly. Ask for the PO week, not the PO.',
    hasDeadline: false,
    typicalDuration: 'Usually 1-4 weeks once the quote is right',
    askThisWeek: 'Which week can the PO be raised, assuming the quote is right?',
  },
  'Quote comparison': {
    meaning: 'The buyer has to put your price beside other quotes before deciding.',
    requirements: [
      { label: 'The comparison criteria in writing', source: 'technicalCriteria', action: 'Get the comparison criteria in writing and record them under Technical criteria' },
      { label: 'Who else was asked', source: 'ask', action: 'Ask who else was invited to quote' },
      { label: 'The person who compares the quotes', source: 'decisionMaker', action: 'Name whoever actually compares the quotes' },
      { label: 'The date the comparison happens', source: 'closeDate', action: 'Ask when the quotes get compared, and set it as the expected close date' },
    ],
    risk: 'Being compared on price alone, because nobody wrote down what else counts.',
    hasDeadline: false,
    typicalDuration: 'Usually 2-8 weeks, driven by when the last quote lands',
    askThisWeek: 'Besides price, what will you be comparing the quotes on?',
  },
  'Open tender': {
    meaning: 'A published process with a closing date you do not control.',
    requirements: [
      { label: 'The tender documents', source: 'ask', action: 'Get the tender documents, or the date they will be published' },
      { label: 'Technical criteria confirmed against the spec', source: 'technicalCriteria', action: 'Check your spec line by line against the published criteria and record the gaps' },
      { label: 'Submission before the closing date', source: 'closeDate', action: 'Put the tender closing date in Expected close date and work backwards from it' },
      { label: 'Who evaluates the submissions', source: 'decisionMaker', action: 'Find out who sits on the evaluation panel' },
    ],
    risk: 'Missing the date, or being specced out of it before it is published.',
    hasDeadline: true,
    typicalDuration: 'Usually 6-16 weeks, and the date is not yours to move',
    askThisWeek: 'When does this go out, and can I see the draft specification before it is published?',
  },
  'Framework / existing contract': {
    meaning: 'The customer buys under an agreement that already exists.',
    requirements: [
      { label: 'Confirmation your line is on the agreement', source: 'ask', action: 'Confirm this exact line is listed on the agreement, at what price' },
      { label: 'The remaining value or expiry', source: 'closeDate', action: 'Find out what is left on the agreement and when it expires, and set the expiry as the expected close date' },
      { label: 'Who can call off against it', source: 'budgetOwner', action: 'Name whoever is allowed to call off against the agreement' },
    ],
    risk: 'The agreement expires or fills up while the deal is treated as open-ended.',
    hasDeadline: true,
    typicalDuration: 'Usually 1-3 weeks once the call-off is agreed',
    askThisWeek: 'How much is left on the agreement, and when does it expire?',
  },
  'Through distributor or agent': {
    meaning: 'A third party transacts, so your customer is not the one raising the PO.',
    requirements: [
      { label: 'The transacting party named', source: 'ask', action: 'Name the distributor or agent who will actually raise the PO' },
      { label: 'Margin and terms agreed with them', source: 'ask', action: 'Agree margin and payment terms with the transacting party in writing' },
      { label: 'Who owns the paperwork end to end', source: 'decisionMaker', action: 'Agree who chases the paperwork - you, the distributor, or the end customer' },
    ],
    risk: 'The end customer says yes and nothing moves, because nobody owns the paperwork.',
    hasDeadline: false,
    typicalDuration: 'Usually 3-8 weeks, most of it spent on the third party',
    askThisWeek: 'Who raises the PO, and who is chasing it once it is with them?',
  },
};

export function isProcurementRoute(value: string): value is ProcurementRoute {
  return (procurementRoutes as readonly string[]).includes(value);
}

/**
 * What the route says about the deal, for surfaces that judge readiness.
 *
 * A deal on a deadline-bearing route with no expected close date is the shape
 * this returns `true` for: the customer's own process has a clock and the
 * workspace is not carrying it.
 */
export function routeNeedsADate(route: string, expectedCloseDate: string) {
  if (!isProcurementRoute(route)) return false;
  return PROCUREMENT_ROUTE_GUIDE[route].hasDeadline && !expectedCloseDate.trim();
}

export type ProcurementDealFields = {
  decisionMaker: string;
  budgetOwner: string;
  technicalCriteria: string;
  expectedCloseDate: string;
};

export type ProcurementReadinessItem = ProcurementRequirement & {
  /** True when the deal already carries the answer. */
  met: boolean;
  /** What the record says, when it says something. Shown instead of a tick. */
  evidence: string;
};

export type ProcurementReadiness = {
  guide: ProcurementRouteGuide;
  items: ProcurementReadinessItem[];
  metCount: number;
  /** The first thing still open - the one worth doing next. */
  nextGap: ProcurementReadinessItem | null;
};

/**
 * The route's demands, checked against what this deal already records.
 *
 * The panel used to print the same three sentences at every deal on the route,
 * whether or not the seller had already done them - which is a poster, not a
 * tool. Reading the fields turns it into a position: two of four done, this one
 * next, and here is the action for it.
 */
export function buildProcurementReadiness(
  route: string,
  deal: ProcurementDealFields,
): ProcurementReadiness | null {
  if (!isProcurementRoute(route)) return null;
  const guide = PROCUREMENT_ROUTE_GUIDE[route];

  const items = guide.requirements.map((requirement) => {
    const evidence = evidenceFor(requirement.source, deal);
    return { ...requirement, evidence, met: Boolean(evidence) };
  });

  return {
    guide,
    items,
    metCount: items.filter((item) => item.met).length,
    nextGap: items.find((item) => !item.met) || null,
  };
}

function evidenceFor(source: ProcurementRequirementSource, deal: ProcurementDealFields) {
  if (source === 'budgetOwner') return deal.budgetOwner.trim();
  if (source === 'decisionMaker') return deal.decisionMaker.trim();
  if (source === 'technicalCriteria') return deal.technicalCriteria.trim();
  if (source === 'closeDate') return deal.expectedCloseDate.trim();
  // 'ask': only the customer can answer, so the workspace never claims it is done.
  return '';
}
