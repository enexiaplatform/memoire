import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCaptureEntities } from '../../src/utils/captureEntityResolution.ts';
import { classifySalesActivity } from '../../src/utils/salesActivityClassifier.ts';

/**
 * Capture's extraction was written in ASCII.
 *
 * Every contact and account pattern used `[A-Z][A-Za-z...]`, so a name stopped
 * at its first accented letter: "Call with Dr. Luis Simoes" - written the way
 * its owner writes it - produced the contact "Dr. Lu", and "Called Joao
 * Ferreira at Sumol+Compal" produced no contact at all. The same fault in the
 * same week made an accented customer name read as a question in Search.
 *
 * These are the names in the workspace this was found on. A product that sells
 * to a Portuguese distributor cannot spell its customers in ASCII.
 */
const resolve = (rawNote) => resolveCaptureEntities({
  rawNote,
  accounts: [],
  opportunities: [],
  stakeholders: [],
  corrections: [],
});

describe('an accented contact name survives capture', () => {
  test('an honorific name is not cut at its first accent', () => {
    const result = resolve('Call with Dr. Luís Simões about the warehouse retrofit');
    assert.equal(result.contactName, 'Dr. Luís Simões');
  });

  test('a name with no honorific is still found', () => {
    const result = resolve('Called João Ferreira at Sumol+Compal about the line upgrade');
    assert.equal(result.contactName, 'João Ferreira');
  });

  test('Nordic letters are letters too', () => {
    const result = resolve('Met Anders Møller at Nordisk Storkøkken about the galley refit');
    assert.equal(result.contactName, 'Anders Møller');
  });

  test('the ASCII case did not regress', () => {
    const result = resolve('Met Sofia Marques at Grupo Calvo about the cold store');
    assert.equal(result.contactName, 'Sofia Marques');
  });
});

describe('an accented customer name survives capture', () => {
  test('the account is read whole', () => {
    const result = resolve('Called João Ferreira at Sumol+Compal about the line upgrade');
    assert.match(result.accountName, /Sumol/);
  });

  test('an accented company keeps its accents', () => {
    const result = resolve('Met Sofia Marques at Grupo Pestana Hotéis today');
    assert.match(result.accountName, /Hotéis/);
  });

  test('a company name is allowed to contain a plus or a slash', () => {
    // Sumol+Compal and Nordisk Storkokken A/S are both in the book this was
    // found on, and neither character was in the account class - so the name
    // was cut at the punctuation or lost entirely.
    assert.match(resolve('Called Joao Ferreira at Sumol+Compal about the line upgrade').accountName, /Sumol\+Compal/);
    assert.match(resolve('Met Anders Moller at Nordisk Storkokken A/S today').accountName, /A\/S/);
  });

  test('a time word is not part of the customer name', () => {
    // The honorific patterns had no trailing bound, so the capture ran to sixty
    // characters: "Spoke with Dr. Luis Simoes at Lactogal Produtos Alimentares
    // today" filed a customer called "... Alimentares today", and a phantom
    // account like that is then a real customer everywhere it appears.
    const result = resolve('Spoke with Dr. Luís Simões at Lactogal Produtos Alimentares today');
    assert.equal(result.accountName, 'Lactogal Produtos Alimentares');
  });

  test('the classifier reads the same names', () => {
    const classified = classifySalesActivity('Met Anders Møller at Nordisk Storkøkken about the galley refit');
    assert.match(classified.accountName || '', /Nordisk/);
  });
});

describe('a job title between the name and the company', () => {
  const read = (note) => classifySalesActivity(note);

  test('the customer is not lost to the title', () => {
    // "Sofia Marques, Head of Engineering at Grupo Pestana Hoteis" produced no
    // customer at all: the account pattern required the title to start
    // lowercase, which is not how anybody writes a job title.
    const result = read('Met Sofia Marques, Head of Engineering at Grupo Pestana Hotéis');
    assert.equal(result.accountName, 'Grupo Pestana Hotéis');
    assert.equal(result.contactName, 'Sofia Marques');
  });

  test('the title stops at the company, and the company is not part of it', () => {
    // The other half: the title clause ran through " at ", so the recorded job
    // title was "Head of Engineering at Grupo Pestana Ho" - truncated, and then
    // written onto the stakeholder record as the person's role.
    const result = read('Met Sofia Marques, Head of Engineering at Grupo Pestana Hotéis');
    assert.equal(result.stakeholderRole, 'Head of Engineering');
  });

  test('a two-word "of" title keeps both words', () => {
    const result = read('Met Ana Silva, Director of Operations at Sonae MC');
    assert.equal(result.stakeholderRole, 'Director of Operations');
    assert.equal(result.accountName, 'Sonae MC');
  });

  test('the lowercase form this pattern was written for still works', () => {
    const result = read('Met Kenji Sato, procurement manager at Sakura Manufacturing');
    assert.equal(result.accountName, 'Sakura Manufacturing');
  });

  test('the company does not end up inside the job title', () => {
    // "<role> of <thing>" cannot tell a function from a company on its own -
    // "Head of Engineering" and "manager of Bayside Freight" are the same
    // shape. Once the customer is resolved it can.
    const result = read('Met Sarah Doyle, the operations manager of Bayside Freight, yesterday.');
    assert.equal(result.accountName, 'Bayside Freight');
    assert.equal(result.stakeholderRole, 'Operations manager');
  });

  test('a function that reads like a company is still kept', () => {
    // Stripping must only remove the resolved account, never any "of" clause.
    const result = read('Met Ana Silva, Director of Operations at Sonae MC');
    assert.equal(result.stakeholderRole, 'Director of Operations');
  });

  test('a note naming nobody still proposes no customer', () => {
    // The guard that stops "Met the buyer today." becoming a customer.
    const result = read('Met the buyer today.');
    assert.equal(result.accountName, '');
  });
});
