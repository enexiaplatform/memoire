export type AutomationSettings = {
  enabled: boolean; timezone: string; runHour: number; dailyBrief: boolean;
  quoteFollowup: boolean; quoteDays: number; commitmentReminder: boolean;
  commitmentLeadDays: number; maxPlanItems: number;
};
export const AUTOMATION_DEFAULTS: Readonly<AutomationSettings>;
export function parseAutomationSettings(value: unknown): AutomationSettings;
export function automationBusinessClock(settings: AutomationSettings, now?: Date): {date: string; hour: number};
