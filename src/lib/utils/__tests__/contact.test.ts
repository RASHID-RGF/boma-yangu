import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmail, normalizePhone, deriveNameFromEmail } from '@/lib/utils/contact';

/**
 * A landlord adds a tenant with an email/phone and the tenant later signs in
 * with it. These helpers make the two spellings comparable so the link works.
 */

test('normalizeEmail trims and lowercases so a landlord-entered email matches sign-in', () => {
  assert.equal(normalizeEmail('  Mary@Example.COM '), 'mary@example.com');
  assert.equal(normalizeEmail('mary@example.com'), 'mary@example.com');
  assert.equal(normalizeEmail(''), null);
  assert.equal(normalizeEmail(null), null);
  assert.equal(normalizeEmail(undefined), null);
});

test('normalizePhone trims surrounding whitespace', () => {
  assert.equal(normalizePhone('  0712345678 '), '0712345678');
  assert.equal(normalizePhone('0712345678'), '0712345678');
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone(null), null);
});

test('deriveNameFromEmail builds a readable name when a tenant is invited by email only', () => {
  assert.equal(deriveNameFromEmail('mary@example.com'), 'Mary');
  assert.equal(deriveNameFromEmail('Mary.Jane@Example.COM'), 'Mary Jane');
  assert.equal(deriveNameFromEmail('john_doe-2@example.com'), 'John Doe 2');
  assert.equal(deriveNameFromEmail(''), null);
  assert.equal(deriveNameFromEmail(null), null);
});
