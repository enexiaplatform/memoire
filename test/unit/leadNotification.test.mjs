import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { notifyOperatorOfLead } from '../../api/request-access.ts';

/**
 * Somebody is told when a lead arrives.
 *
 * Nobody was. The contact form wrote a row to `early_access_requests` and
 * stopped there, and the operator console said so in as many words: "From the
 * contact form. Nobody is emailed when one arrives - this list is the whole
 * mechanism." A stranger's enquiry waited until somebody happened to open
 * /admin. Zero leads had arrived so it had cost nothing yet; the first real one
 * it swallowed would have been a customer, and nothing would ever have reported
 * that one was missed.
 *
 * `scripts/verify-lead-operations-contract.mjs` pins the three structural
 * properties - it runs after the insert, it is awaited, its destination is
 * configuration. What is left for here is the behaviour under the three states
 * the mailbox can actually be in, and the one that matters most is the first:
 * this ships into a deployment with no email configured at all, and it has to
 * be silent rather than broken until that changes.
 */

const lead = {
  name: 'Dana Reyes',
  work_email: 'dana@halden-industrial.example',
  role: 'Head of Procurement',
  current_tool: 'Excel and my inbox',
  biggest_pain: 'Quotes go quiet and I find out at the review',
  preferred_use_case: 'Following an order from the PO to the payment landing.',
};

let calls = [];
let respond = () => Promise.resolve({ ok: true, text: () => Promise.resolve('') });

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

beforeEach(() => {
  calls = [];
  respond = () => Promise.resolve({ ok: true, text: () => Promise.resolve('') });
  globalThis.fetch = (url, init) => {
    calls.push({ url, init });
    return respond();
  };
  delete process.env.EMAIL_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.LEAD_NOTIFICATION_EMAIL;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

describe('a lead through the contact form reaches a person', () => {
  test('with no email configured it is silent, not broken', async () => {
    // The state this shipped into. It has to stay quiet until EMAIL_* is set
    // for the digest, and then start working with no second deploy.
    await notifyOperatorOfLead(lead);
    assert.equal(calls.length, 0, 'nothing may be sent, and nothing may throw, before email is configured');
  });

  test('once email is configured it sends, with no separate switch to find', async () => {
    process.env.EMAIL_API_KEY = 'test-key';
    process.env.EMAIL_FROM = 'memoire@example.test';

    await notifyOperatorOfLead(lead);

    assert.equal(calls.length, 1);
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.to, 'memoire@example.test', 'EMAIL_FROM is the fallback mailbox');
    assert.match(calls[0].init.headers.Authorization, /^Bearer test-key$/);
  });

  test('LEAD_NOTIFICATION_EMAIL wins, so alerts can go somewhere the digest does not', async () => {
    process.env.EMAIL_API_KEY = 'test-key';
    process.env.EMAIL_FROM = 'no-reply@example.test';
    process.env.LEAD_NOTIFICATION_EMAIL = 'founder@example.test';

    await notifyOperatorOfLead(lead);
    assert.equal(JSON.parse(calls[0].init.body).to, 'founder@example.test');
  });

  test('the address to reply to is in the subject, where a phone shows it', async () => {
    process.env.EMAIL_API_KEY = 'test-key';
    process.env.EMAIL_FROM = 'memoire@example.test';

    await notifyOperatorOfLead(lead);
    const body = JSON.parse(calls[0].init.body);

    assert.match(body.subject, /Dana Reyes/);
    assert.match(body.subject, /dana@halden-industrial\.example/, 'replying is the point of the alert');
    assert.match(body.text, /Following an order from the PO/, 'what they want it for is the qualifying detail');
    assert.match(body.text, /Where follow-up falls through/);
  });

  test('a lead who left the optional fields blank does not produce empty lines', async () => {
    process.env.EMAIL_API_KEY = 'test-key';
    process.env.EMAIL_FROM = 'memoire@example.test';

    await notifyOperatorOfLead({ ...lead, role: '', biggest_pain: '' });
    const { text } = JSON.parse(calls[0].init.body);

    assert.equal(/^Role:/m.test(text), false);
    assert.equal(/^Where follow-up falls through:/m.test(text), false);
    assert.match(text, /Today they use: Excel and my inbox/);
  });

  test("the lead's own words cannot inject markup into the HTML body", async () => {
    process.env.EMAIL_API_KEY = 'test-key';
    process.env.EMAIL_FROM = 'memoire@example.test';

    await notifyOperatorOfLead({ ...lead, preferred_use_case: '<script>alert(1)</script> & "quotes"' });
    const { html } = JSON.parse(calls[0].init.body);

    assert.equal(html.includes('<script>'), false);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /&amp;/);
  });

  test('a provider that rejects the send never fails the submission', async () => {
    // The person who filled in the form is owed their 201 whether or not our
    // mailbox is reachable. They cannot fix our email configuration and must
    // not be asked to resubmit because of it.
    process.env.EMAIL_API_KEY = 'test-key';
    process.env.EMAIL_FROM = 'memoire@example.test';
    respond = () => Promise.resolve({ ok: false, status: 422, text: () => Promise.resolve('domain not verified') });

    await assert.doesNotReject(() => notifyOperatorOfLead(lead));
  });

  test('a network that is down never fails the submission either', async () => {
    process.env.EMAIL_API_KEY = 'test-key';
    process.env.EMAIL_FROM = 'memoire@example.test';
    respond = () => Promise.reject(new Error('ECONNREFUSED'));

    await assert.doesNotReject(() => notifyOperatorOfLead(lead));
  });
});
