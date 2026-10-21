export type AutomationSettings = {
  enabled: boolean; timezone: string; runHour: number; dailyBrief: boolean;
  quoteFollowup: boolean; quoteDays: number; commitmentReminder: boolean;
  commitmentLeadDays: number; maxPlanItems: number;
  continuous: boolean; collectionReminder: boolean; collectionLeadDays: number;
  supplierReminder: boolean; supplierLeadDays: number; leadFollowup: boolean;
  orderReminder: boolean; opportunityReminder: boolean; weeklyReview: boolean;
  preparedOutputs: boolean; savedReports: boolean; savedDashboards: boolean;
};
export const AUTOMATION_RULES: readonly { key: keyof AutomationSettings; label: string; detail: string }[];
export function proposeAutomationSettings(text: string, current: AutomationSettings): { config: AutomationSettings; keys: string[] } | null;
export const AUTOMATION_DEFAULTS: Readonly<AutomationSettings>;
export function parseAutomationSettings(value: unknown): AutomationSettings;
export function automationBusinessClock(settings: AutomationSettings, now?: Date): {date: string; hour: number};
