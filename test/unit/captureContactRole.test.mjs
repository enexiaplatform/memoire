import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { classifySalesActivity } from '../../src/utils/salesActivityClassifier.ts';

const ANCHOR = '2026-03-05';
const read = (note) => classifySalesActivity(note, ANCHOR, {});

describe('a contact written the way sellers write one', () => {
  test('name and job title separated by a comma', () => {
    // The exact note that produced no person at all, while the pipeline beside
    // it flagged "No decision maker" on every row.
    const result = read('Site visit at Grupo Pestana in Lisboa with Sofia Marques, Head of Engineering.');
    assert.equal(result.contactName, 'Sofia Marques');
    assert.equal(result.stakeholderRole, 'Head of Engineering');
  });

  test('a three-letter title reads as a title', () => {
    const result = read('Call with Ricardo Nunes, CFO, about the capex sign-off.');
    assert.equal(result.contactName, 'Ricardo Nunes');
    assert.equal(result.stakeholderRole, 'CFO');
  });

  test('modifiers in front of the head noun are kept', () => {
    const result = read('Spoke to Marta Oliveira, group energy manager, about the resorts.');
    assert.equal(result.contactName, 'Marta Oliveira');
    assert.equal(result.stakeholderRole, 'Group energy manager');
  });

  test('an accented name is a name', () => {
    // Latin-1 alone breaks half of Europe; the ASCII class kept a truncated
    // fragment or nothing.
    const result = read('Met Jose Fernandez, plant director, at the cannery.');
    assert.equal(result.contactName, 'Jose Fernandez');
    const accented = read('Met Joao Ribeiro, maintenance supervisor, on site.');
    assert.equal(accented.contactName, 'Joao Ribeiro');
  });

  test('a company in front of a title is not a person', () => {
    // "Sodexo France, regional director wants a pilot" must not invent a
    // stakeholder called Sodexo France.
    const result = read('Intro call. Sodexo France, regional director wants a pilot site.');
    assert.notEqual(result.contactName, 'Sodexo France');
  });

  test('an ordinary comma is not a job title', () => {
    const result = read('Sent the revised pricing sheet through, nothing else to report.');
    assert.equal(result.contactName, '');
    assert.equal(result.stakeholderRole, '');
  });

  test('the honorific rule still wins where it applies', () => {
    const result = read('Called Ms. Huyen at Rohto about the quotation.');
    assert.equal(result.contactName, 'Ms. Huyen');
  });
});
