import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveUserByEmail, buildEmailHtml, getSmtpConfig } from '../communication';

test('resolveUserByEmail matches lowercased email addresses', async () => {
  const user = await resolveUserByEmail('LANDLORD@BOMAYANGU.COM');
  assert.equal(user?.email, 'landlord@bomayangu.com');
});

test('buildEmailHtml includes the subject and recipient name', () => {
  const html = buildEmailHtml('Alice', 'Invoice #INV-202501-0001');
  assert.match(html, /Alice/i);
  assert.match(html, /Invoice #INV-202501-0001/i);
});

test('getSmtpConfig detects gmail SMTP settings', () => {
  process.env.SMTP_HOST = 'smtp.gmail.com';
  process.env.SMTP_PORT = '465';
  process.env.SMTP_USER = 'user@gmail.com';
  process.env.SMTP_PASS = 'app-password';

  const config = getSmtpConfig();

  assert.equal(config.enabled, true);
  assert.equal(config.host, 'smtp.gmail.com');
  assert.equal(config.user, 'user@gmail.com');
});

test('getSmtpConfig supports common alternate mail environment names', () => {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.SMTP_FROM;
  process.env.EMAIL_HOST = 'smtp.mailgun.org';
  process.env.EMAIL_PORT = '587';
  process.env.EMAIL_USER = 'postmaster@example.com';
  process.env.EMAIL_PASS = 'mailgun-password';
  process.env.EMAIL_FROM = 'alerts@example.com';

  const config = getSmtpConfig();

  assert.equal(config.enabled, true);
  assert.equal(config.host, 'smtp.mailgun.org');
  assert.equal(config.user, 'postmaster@example.com');
  assert.equal(config.from, 'alerts@example.com');
});
