export const AUTOMATION_DEFAULTS = Object.freeze({
  enabled: false, timezone: 'Asia/Ho_Chi_Minh', runHour: 7,
  dailyBrief: true, quoteFollowup: false, quoteDays: 3,
  commitmentReminder: false, commitmentLeadDays: 1, maxPlanItems: 5,
});
const fields = Object.keys(AUTOMATION_DEFAULTS);
export function parseAutomationSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== fields.length || fields.some(key => !(key in value))) throw new Error('invalid_settings');
  for (const key of ['enabled', 'dailyBrief', 'quoteFollowup', 'commitmentReminder']) {
    if (typeof value[key] !== 'boolean') throw new Error('invalid_settings');
  }
  for (const [key, min, max] of [['runHour', 0, 23], ['quoteDays', 1, 30], ['commitmentLeadDays', 0, 7], ['maxPlanItems', 1, 10]]) {
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
