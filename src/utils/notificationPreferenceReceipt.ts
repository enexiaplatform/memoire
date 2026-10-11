/** A returned identity alone cannot prove that the requested fields were saved. */
export function notificationPreferenceMatches(saved: unknown, expected: { userId: string; daily: boolean; weekly: boolean; hour: number; offsetMinutes: number }): boolean {
  if (!saved || typeof saved !== 'object') return false;
  const row = saved as Record<string, unknown>;
  return row.id === expected.userId && row.daily_digest_enabled === expected.daily && row.weekly_review_enabled === expected.weekly
    && row.digest_send_hour === expected.hour && row.digest_utc_offset_minutes === expected.offsetMinutes;
}
