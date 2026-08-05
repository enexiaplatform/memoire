/**
 * The digest, built on the server from what the account actually holds.
 *
 * A deliberate design decision sits behind how small this is. The app builds a
 * far richer daily digest on the operator's device, from the full record graph
 * in their browser; reproducing that here would mean reproducing the mapping
 * layer, the money model and the thread derivation on the server, and then
 * keeping two copies in step forever. The first time they disagreed, the email
 * would be lying about the app.
 *
 * So this does not try to be the app. It answers three questions from columns
 * that exist, in the smallest number of sentences that can carry them, and then
 * gets out of the way with a link. An email is a nudge, not a report - the
 * authoritative view is one tap away and always will be.
 *
 *   1. What is overdue - a next action dated before today, still open.
 *   2. What has gone quiet - a live deal with no recorded touch in two weeks.
 *   3. Where money is stuck - a quote past its payment or delivery date.
 *
 * The weekly one asks a different question, the one Review opens on: what
 * closed, and what that leaves of the quarter.
 */

const QUIET_DAYS = 14;

export function todayInZone(offsetMinutes, now = new Date()) {
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export function localHourInZone(offsetMinutes, now = new Date()) {
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
  return shifted.getUTCHours();
}

function daysBetween(from, to) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

function dateKey(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : '';
}

/**
 * Reads one operator's cloud records. Only the columns the digest can speak
 * about, and only rows that belong to them - the service-role client has no
 * row-level security, so the user filter is the boundary and it is applied to
 * every query rather than assumed.
 */
export async function loadDigestInputs(supabase, userId, today) {
  const [opportunities, activities, quotes, expenses] = await Promise.all([
    supabase
      .from('opportunities')
      .select('id, account_name, opportunity_name, title, stage, status, next_action, next_action_date, estimated_value, currency, updated_at')
      .eq('user_id', userId)
      .limit(1000),
    supabase
      .from('sales_activities')
      .select('id, account_name, activity_date')
      .eq('user_id', userId)
      .gte('activity_date', shiftDays(today, -90))
      .limit(2000),
    supabase
      .from('quotes')
      .select('id, payload, updated_at')
      .eq('user_id', userId)
      .limit(1000),
    // Money out. The digest asks "what is stuck", and until the expenses table
    // existed it could only ever answer about money coming in - so an operator
    // with a supplier payment two weeks past due got a mail telling them
    // nothing needed them today.
    supabase
      .from('expenses')
      .select('id, payload, updated_at')
      .eq('user_id', userId)
      .limit(1000),
  ]);

  return {
    opportunities: opportunities.data || [],
    activities: activities.data || [],
    quotes: (quotes.data || []).map((row) => ({ id: row.id, ...(row.payload || {}) })),
    expenses: (expenses.data || []).map((row) => ({ id: row.id, ...(row.payload || {}) })),
    errors: [opportunities.error, activities.error, quotes.error, expenses.error]
      .filter(Boolean)
      .map((error) => error.message),
  };
}

function shiftDays(dateString, days) {
  const parsed = Date.parse(`${dateString}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return dateString;
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10);
}

function isOpen(opportunity) {
  const status = String(opportunity.status || '').toLowerCase();
  const stage = String(opportunity.stage || '').toLowerCase();
  return status !== 'won' && status !== 'lost' && stage !== 'won' && stage !== 'lost';
}

function dealName(opportunity) {
  return opportunity.opportunity_name || opportunity.title || 'Untitled deal';
}

export function buildDailyDigest(input, today) {
  const open = input.opportunities.filter(isOpen);

  const overdue = open
    .filter((opportunity) => {
      const due = dateKey(opportunity.next_action_date);
      return due && due < today && String(opportunity.next_action || '').trim();
    })
    .sort((left, right) => dateKey(left.next_action_date).localeCompare(dateKey(right.next_action_date)));

  const lastTouchByAccount = new Map();
  input.activities.forEach((activity) => {
    const account = String(activity.account_name || '').trim().toLowerCase();
    const when = dateKey(activity.activity_date);
    if (!account || !when) return;
    const existing = lastTouchByAccount.get(account);
    if (!existing || when > existing) lastTouchByAccount.set(account, when);
  });

  const quiet = open
    .map((opportunity) => {
      const account = String(opportunity.account_name || '').trim().toLowerCase();
      const lastTouch = account ? lastTouchByAccount.get(account) : undefined;
      const days = lastTouch ? daysBetween(lastTouch, today) : null;
      return { opportunity, lastTouch, days };
    })
    .filter((entry) => entry.days === null || entry.days >= QUIET_DAYS)
    .sort((left, right) => (right.days ?? 9999) - (left.days ?? 9999));

  const stuckMoney = input.quotes.filter((quote) => {
    if (quote.__deleted === true || quote.status === 'Rejected') return false;
    const paymentDue = dateKey(quote.paymentDueDate);
    const deliveryDue = dateKey(quote.expectedDeliveryDate);
    const paymentLate = paymentDue && paymentDue < today && quote.paymentStatus !== 'Paid';
    const deliveryLate = deliveryDue && deliveryDue < today && quote.deliveryStatus !== 'Delivered';
    return Boolean(paymentLate || deliveryLate);
  });

  // What the operator owes and has not paid. An obligation past its own due
  // date is the same kind of fact as a customer payment that has not arrived,
  // and it is the one the app has always shown and the email never has.
  const owedPayments = (input.expenses || []).filter((expense) => {
    if (expense.__deleted === true || expense.status !== 'Upcoming') return false;
    const due = dateKey(expense.dueDate);
    return Boolean(due) && due < today;
  });

  const hasSignal = overdue.length > 0 || quiet.length > 0 || stuckMoney.length > 0 || owedPayments.length > 0;

  const lines = [];
  if (overdue.length > 0) {
    lines.push(`${overdue.length} next action${overdue.length === 1 ? '' : 's'} past due:`);
    overdue.slice(0, 5).forEach((opportunity) => {
      lines.push(`  · ${opportunity.account_name || 'No account'} — ${opportunity.next_action} (due ${dateKey(opportunity.next_action_date)})`);
    });
  }
  if (quiet.length > 0) {
    lines.push(`${quiet.length} live deal${quiet.length === 1 ? '' : 's'} with nothing recorded in ${QUIET_DAYS} days:`);
    quiet.slice(0, 5).forEach((entry) => {
      const age = entry.days === null ? 'no touch ever recorded' : `quiet ${entry.days} days`;
      lines.push(`  · ${entry.opportunity.account_name || 'No account'} / ${dealName(entry.opportunity)} — ${age}`);
    });
  }
  if (stuckMoney.length > 0) {
    lines.push(`${stuckMoney.length} quote${stuckMoney.length === 1 ? '' : 's'} past a promised date:`);
    stuckMoney.slice(0, 5).forEach((quote) => {
      lines.push(`  · ${quote.accountName || 'No account'} — ${quote.title || quote.quoteId || 'quote'}`);
    });
  }
  if (owedPayments.length > 0) {
    lines.push(`${owedPayments.length} payment${owedPayments.length === 1 ? '' : 's'} you owe ${owedPayments.length === 1 ? 'is' : 'are'} past due:`);
    owedPayments.slice(0, 5).forEach((expense) => {
      lines.push(`  · ${expense.vendor || expense.label || 'Payment'} — due ${dateKey(expense.dueDate)}`);
    });
  }

  return {
    kind: 'daily',
    hasSignal,
    subject: hasSignal
      ? `Memoire: ${overdue.length} overdue, ${quiet.length} going quiet`
      : 'Memoire: nothing needs you today',
    headline: hasSignal
      ? 'Four questions, answered from your own records.'
      : 'Nothing is overdue, nothing has gone quiet, no money is late in either direction.',
    lines,
    counts: {
      overdue: overdue.length,
      quiet: quiet.length,
      stuckMoney: stuckMoney.length,
      owedPayments: owedPayments.length,
    },
  };
}

export function buildWeeklyDigest(input, today) {
  const weekStart = shiftDays(today, -7);

  const closed = input.opportunities.filter((opportunity) => {
    const status = String(opportunity.status || '').toLowerCase();
    const updated = dateKey(opportunity.updated_at);
    return (status === 'won' || status === 'lost') && updated >= weekStart && updated <= today;
  });

  const won = closed.filter((opportunity) => String(opportunity.status).toLowerCase() === 'won');
  const lost = closed.filter((opportunity) => String(opportunity.status).toLowerCase() === 'lost');
  const touches = input.activities.filter((activity) => {
    const when = dateKey(activity.activity_date);
    return when >= weekStart && when <= today;
  });

  const openCount = input.opportunities.filter(isOpen).length;
  const hasSignal = closed.length > 0 || touches.length > 0;

  const lines = [
    `Closed: ${won.length} won, ${lost.length} lost.`,
    `Recorded: ${touches.length} customer touch${touches.length === 1 ? '' : 'es'} across the week.`,
    `Open now: ${openCount} deal${openCount === 1 ? '' : 's'}.`,
  ];

  return {
    kind: 'weekly',
    hasSignal,
    subject: `Memoire week in review: ${won.length} won, ${touches.length} touches`,
    headline: 'What last week produced. The scoreboard against your quarter is in Review.',
    lines,
    counts: { won: won.length, lost: lost.length, touches: touches.length, open: openCount },
  };
}

/**
 * Plain text and a plain HTML twin. No tracking pixel, no image, no remote
 * font: this product's whole trust position is that customer context stays
 * where the operator put it, and an email that phones home about being opened
 * would be the first thing to contradict it.
 */
export function renderDigestEmail(digest, links) {
  const text = [
    digest.headline,
    '',
    ...digest.lines,
    '',
    `Open Memoire: ${links.appUrl}`,
    '',
    `Stop these emails: ${links.unsubscribeUrl}`,
  ].join('\n');

  const html = [
    '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.55;color:#0F172A;max-width:560px">',
    `<p style="margin:0 0 12px;font-weight:700">${escapeHtml(digest.headline)}</p>`,
    ...digest.lines.map((line) => (line.startsWith('  · ')
      ? `<div style="margin:2px 0 2px 14px;color:#374151">${escapeHtml(line.slice(4))}</div>`
      : `<p style="margin:12px 0 4px;font-weight:600">${escapeHtml(line)}</p>`)),
    `<p style="margin:20px 0 0"><a href="${escapeHtml(links.appUrl)}" style="background:#1B2B3A;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:700">Open Memoire</a></p>`,
    `<p style="margin:20px 0 0;font-size:12px;color:#6B7280">Built from your own records on Memoire's server. <a href="${escapeHtml(links.unsubscribeUrl)}" style="color:#6B7280">Stop these emails</a>.</p>`,
    '</div>',
  ].join('');

  return { subject: digest.subject, text, html };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Sending, without adding a dependency.
 *
 * Configured by environment rather than by an SDK, so the provider can change
 * without a deploy of new code, and so an unconfigured environment reports
 * "not configured" instead of failing. The shape is the one Resend, Postmark
 * and most transactional providers accept.
 */
export async function sendEmail({ to, subject, text, html }) {
  const endpoint = process.env.EMAIL_API_URL || 'https://api.resend.com/emails';
  const apiKey = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    return { ok: false, skipped: true, detail: 'EMAIL_API_KEY or EMAIL_FROM is not set' };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, text, html }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return { ok: false, skipped: false, detail: `${response.status} ${detail.slice(0, 200)}` };
  }

  return { ok: true, skipped: false, detail: '' };
}
