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
