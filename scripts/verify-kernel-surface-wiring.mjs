import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The Commercial Thread and the Commitment Ledger only work if they appear
// wherever the thread is relevant. A kernel that exists in the domain layer but
// shows up on one page is just another module - the whole point is that the
// seller reads the same six answers in the same shape on every surface, and
// never has to reconstruct the story from a different layout.

const read = (file) => readFileSync(file, 'utf8');

// 1. One component, one derivation, one hook. Not three copies that can drift.
{
  const quickLook = read('src/features/threads/ThreadQuickLook.tsx');
  for (const answer of ['Money', 'Waiting', 'Quiet for', 'Next commitment']) {
    assert.ok(quickLook.includes(answer), `the thread card must answer: ${answer}`);
  }

  const hook = read('src/features/threads/useCommercialThreads.ts');
  assert.ok(hook.includes('resolveCommercialThreads'), 'threads must come from the shared derivation');
  assert.ok(hook.includes('evaluateCommercialPolicies'), 'recommendations must come from the policy engine');
  assert.ok(
    hook.includes('COMMITMENTS_UPDATED_EVENT'),
    'a commitment ticked anywhere must refresh the threads that depend on it',
  );
}

// 2. Threads appear on every surface where a thread is relevant.
for (const [file, surface] of [
  ['src/features/dashboard/DashboardPage.tsx', 'Today'],
  ['src/features/accounts/AccountsPage.tsx', 'Accounts'],
  ['src/features/opportunities/OpportunitiesPage.tsx', 'Opportunities'],
  ['src/features/revenue/RevenueViewPage.tsx', 'Money'],
  ['src/features/reviews/SalesReviewsPage.tsx', 'Review'],
]) {
  const source = read(file);
  assert.ok(
    source.includes('<ThreadsSection') || source.includes('<ThreadQuickLook'),
    `${surface} must show commercial threads`,
  );
}

// 3. Commitments are editable from Today, Timeline and Review, through the same
// ledger component - so a promise ticked in one place is kept in all of them.
for (const [file, surface] of [
  ['src/features/dashboard/DashboardPage.tsx', 'Today'],
  ['src/features/timeline/TimelinePage.tsx', 'Timeline'],
  ['src/features/reviews/SalesReviewsPage.tsx', 'Review'],
]) {
  assert.ok(
    read(file).includes('<CommitmentLedgerPanel'),
    `${surface} must show the commitment ledger`,
  );
}

// 4. The ledger keeps the three parties visible and never hides a renegotiation.
{
  const panel = read('src/features/commitments/CommitmentLedgerPanel.tsx');
  for (const marker of ['I owe', 'Customer owes', 'Internal owes']) {
    assert.ok(panel.includes(marker), `the ledger must distinguish: ${marker}`);
  }
  assert.ok(panel.includes('first promised'), 'a moved promise must show the date it was first promised');
  assert.ok(panel.includes('Overdue') && panel.includes('Due today'), 'the ledger groups by when it is due');

  const hook = read('src/features/commitments/useCommitmentLedger.ts');
  for (const command of ['createCommitment', 'completeCommitment', 'cancelCommitment', 'rescheduleCommitment']) {
    assert.ok(hook.includes(command), `the ledger must go through the ${command} command`);
  }
  // The panel must not reach around the commands into the store.
  assert.equal(
    panel.includes('saveCommitment') || panel.includes('localStorage'),
    false,
    'the ledger UI must not write records directly - transitions belong to commands',
  );
}

// 5. Recommendations are explainable in the interface, not just in the domain.
{
  const risk = read('src/features/threads/CommercialRiskPanel.tsx');
  assert.ok(risk.includes('Why am I seeing this?'), 'a recommendation must be checkable by the person it is shown to');
  for (const field of ['reasonCode', 'threshold', 'sourceRecordIds', 'calculatedAt']) {
    assert.ok(risk.includes(field), `the explanation must expose ${field}`);
  }
  assert.ok(
    risk.includes('No AI service was involved'),
    'the explanation must state that the answer was computed locally',
  );
}

// 6. "Saved by Memoire" is optional, inline, and honest.
{
  const prompt = read('src/features/value/SavedByMemoirePrompt.tsx');
  assert.ok(prompt.includes('recordValueOutcome'), 'the prompt must write through the command');
  assert.ok(
    prompt.includes('I would have done it anyway'),
    'the honest answer must be offered, first and as easily as the flattering ones',
  );
  // A modal after every action trains people to dismiss it, and a ledger of
  // reflexive dismissals looks like evidence while measuring nothing.
  assert.equal(
    /role="dialog"|aria-modal/.test(prompt),
    false,
    'the value prompt must never be a modal',
  );
  assert.ok(prompt.includes('Not now'), 'the prompt must be dismissible without answering');
}

console.log('Kernel surface wiring verified: one thread component, one ledger, explainable recommendations.');
