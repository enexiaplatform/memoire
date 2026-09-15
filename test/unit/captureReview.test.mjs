import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { describeCaptureConsequences, markCaptureNote } from '../../src/utils/captureReview.ts';

const target = { accountName: 'Rohto Vietnam', opportunityId: 'opp-1', opportunityName: 'QC analyser rollout' };
const fact = (patch) => ({ id: `f-${Math.random().toString(36).slice(2)}`, evidence: '', certainty: 'exact', target, status: 'proposed', ...patch });

describe('marking a note with the words each fact came from', () => {
  const note = 'Met Rohto QC today. I promised to send the validation explanation by Friday.';

  test('each mark becomes its own run, in note order, with the plain text between kept verbatim', () => {
    const segments = markCaptureNote(note, [
      { text: 'I promised to send the validation explanation by Friday', kind: 'promise' },
      { text: 'Rohto', kind: 'account' },
    ]);
    assert.equal(segments.map((segment) => segment.text).join(''), note);
    assert.deepEqual(segments.filter((segment) => segment.kind).map((segment) => [segment.kind, segment.text]), [
      ['account', 'Rohto'],
      ['promise', 'I promised to send the validation explanation by Friday'],
    ]);
  });

  test('a customer name inside a quoted sentence does not split the sentence', () => {
    const segments = markCaptureNote('Rohto said Rohto needs proof', [
      { text: 'Rohto needs proof', kind: 'risk' },
      { text: 'Rohto', kind: 'account' },
    ]);
    assert.deepEqual(segments.filter((segment) => segment.kind).map((segment) => segment.text), ['Rohto', 'Rohto needs proof']);
  });

  test('case and a line break between words do not stop a match', () => {
    const segments = markCaptureNote('We will VISIT\nthe plant on Oct 3', [{ text: 'visit the plant', kind: 'event' }]);
    assert.equal(segments.find((segment) => segment.kind)?.text, 'VISIT\nthe plant');
  });

  test('words the note does not contain mark nothing and lose nothing', () => {
    const segments = markCaptureNote('A short note', [{ text: 'not in here', kind: 'risk' }]);
    assert.deepEqual(segments, [{ text: 'A short note', kind: null }]);
  });
});

describe('what saving changes', () => {
  test('nothing ticked says so', () => {
    assert.deepEqual(describeCaptureConsequences([]), ['Nothing is ticked, so saving changes nothing.']);
  });

  test('each kind names the record it writes, and a person is never given a role', () => {
    const sentences = describeCaptureConsequences([
      fact({ kind: 'commitment', party: 'self', ownerLabel: '', text: 'Send the explanation', dueDate: '2026-09-11' }),
      fact({ kind: 'objection', objectionType: 'Documentation', text: 'GPT verification unclear' }),
      fact({ kind: 'stakeholder', name: 'Marc', roleTitle: '' }),
      fact({ kind: 'opportunity_value', amount: 400000000, currency: 'VND', approximate: true }),
    ]);
    assert.equal(sentences.length, 4);
    assert.match(sentences[0], /^One promise you made joins your commitments, the first due/);
    assert.match(sentences[1], /objection opens on QC analyser rollout's ledger/);
    assert.match(sentences[2], /Marc is added at Rohto Vietnam with the role Unknown/);
    assert.match(sentences[3], /QC analyser rollout is valued at .*as an estimate/);
  });

  test('a promise with no date says it has none', () => {
    const [sentence] = describeCaptureConsequences([
      fact({ kind: 'commitment', party: 'self', ownerLabel: '', text: 'Call back', dueDate: '' }),
    ]);
    assert.match(sentence, /with no date yet\.$/);
  });
});
