export const AUTOMATION_DEFAULTS = Object.freeze({
  enabled: false, timezone: 'Asia/Ho_Chi_Minh', runHour: 7,
  dailyBrief: true, quoteFollowup: false, quoteDays: 3,
  commitmentReminder: false, commitmentLeadDays: 1, maxPlanItems: 5,
  continuous: false, collectionReminder: false, collectionLeadDays: 7,
  supplierReminder: false, supplierLeadDays: 7, leadFollowup: false,
  orderReminder: false, opportunityReminder: false, weeklyReview: false,
  preparedOutputs: false, savedReports: false, savedDashboards: false,
});
const fields = Object.keys(AUTOMATION_DEFAULTS);
const legacyFields = fields.slice(0, 9);
export const AUTOMATION_RULES = Object.freeze([
  { key: 'continuous', label: 'Refresh during the day', detail: 'Recheck every 15 minutes after the start hour. The Plan limit is shared by the whole local day.' },
  { key: 'collectionReminder', label: 'Collection installments', detail: 'Prepare work for unpaid installments approaching their recorded date. Missing values and planned dates stay explicit.' },
  { key: 'supplierReminder', label: 'Supplier and principal promises', detail: 'Prepare due supplier work from the original promise, without recording payments or completion.' },
  { key: 'leadFollowup', label: 'Lead nurture and first touch', detail: 'Revisit recorded nurture dates and untouched leads. Qualification stays yours.' },
  { key: 'orderReminder', label: 'Order milestones', detail: 'Prepare overdue or stalled milestone work from recorded order evidence.' },
  { key: 'opportunityReminder', label: 'Opportunity next-action gaps', detail: 'Prepare a next-action review for active qualified deals without a dated action.' },
  { key: 'weeklyReview', label: 'Weekly Review draft', detail: 'Keep a dated draft of open work and recorded changes. Reflections and outcomes require your review.' },
  { key: 'preparedOutputs', label: 'Workspace preparation', detail: 'Prepare Capture, Plan, Account/stakeholder, Margin, Portfolio, knowledge, import-quality and cloud-health queues. Source records stay unchanged.' },
  { key: 'savedReports', label: 'Run saved Reports', detail: 'Refresh active saved definitions using a dated cloud money basis. Browser-only FX overrides are excluded.' },
  { key: 'savedDashboards', label: 'Refresh saved Dashboards', detail: 'Use the saved widgets, linked reports and one shared source snapshot; errors remain visible.' },
]);
/** Supported natural-language shortcuts only propose settings; saving remains explicit. */
export function proposeAutomationSettings(text, current) {
  const value = String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const matches = [
    ['collectionReminder', /collection|cong no|thu tien/], ['supplierReminder', /supplier|nha cung cap|principal/],
    ['leadFollowup', /lead|nurture/], ['quoteFollowup', /quote|bao gia/],
    ['commitmentReminder', /commitment|cam ket|loi hua/], ['orderReminder', /order|don hang/],
    ['opportunityReminder', /opportunit|co hoi/], ['weeklyReview', /weekly|hang tuan|review/],
    ['preparedOutputs', /workspace|chuan bi|toan bo/], ['savedReports', /report|bao cao/],
    ['savedDashboards', /dashboard/], ['continuous', /15|trong ngay|continuous/],
  ].filter(([, pattern]) => pattern.test(value)).map(([key]) => key);
  if (!matches.length) return null;
  return { config: parseAutomationSettings({ ...current, ...Object.fromEntries(matches.map(key => [key, !/pause|tam dung|disable/.test(value)])) }), keys: matches };
}
export function parseAutomationSettings(value) {
  if (value && typeof value === 'object' && Object.keys(value).length === legacyFields.length && legacyFields.every(key => key in value)) value = { ...AUTOMATION_DEFAULTS, ...value };
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== fields.length || fields.some(key => !(key in value))) throw new Error('invalid_settings');
  for (const key of fields.filter(key => typeof AUTOMATION_DEFAULTS[key] === 'boolean')) {
    if (typeof value[key] !== 'boolean') throw new Error('invalid_settings');
  }
  for (const [key, min, max] of [['runHour', 0, 23], ['quoteDays', 1, 30], ['commitmentLeadDays', 0, 7], ['maxPlanItems', 1, 10], ['collectionLeadDays', 0, 30], ['supplierLeadDays', 0, 30]]) {
    if (!Number.isInteger(value[key]) || value[key] < min || value[key] > max) throw new Error('invalid_settings');
  }
  if (typeof value.timezone !== 'string' || value.timezone.length > 80) throw new Error('invalid_timezone');
  try { new Intl.DateTimeFormat('en-US', { timeZone: value.timezone }).format(); } catch { throw new Error('invalid_timezone'); }
  return Object.fromEntries(fields.map(key => [key, value[key]]));
}
export function automationBusinessClock(settings, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: settings.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const part = type => parts.find(item => item.type === type)?.value;
  return { date: `${part('year')}-${part('month')}-${part('day')}`, hour: Number(part('hour')) };
}
