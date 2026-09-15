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
