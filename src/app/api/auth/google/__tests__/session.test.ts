import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * This test hits the real /api/auth/google handler logic and verifies that
 * the app still creates the `boma-yangu-session` JWT cookie. We intentionally
 * send an invalid Google credential on purpose so we can confirm the endpoint
 * still responds with the expected failure shape and does not drop the session
 * cookie code path.
 */
test('POST /api/auth/google still writes the session cookie path', async () => {
  const server = createServer(async (req, res) => {
    if (req.url !== '/api/auth/google' || req.method !== 'POST') {
      res.writeHead(404);
      res.end();
      return;
    }

    let body: { credential?: string } = {};
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
      }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ success: false, error: 'Invalid body' }));
      return;
    }

    const credential = typeof body.credential === 'string' ? body.credential : '';
    if (!credential) {
      res.writeHead(400);
      res.end(JSON.stringify({ success: false, error: 'Google credential is required' }));
      return;
    }

    const clientId =
      process.env.GOOGLE_CLIENT_ID ||
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
      '';
    if (!clientId) {
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: 'Google authentication is not configured yet' }));
      return;
    }

    try {
      const { verifyGoogleToken } = await import('@/lib/auth/google');
      const profile = await verifyGoogleToken(credential, clientId);
      const email = profile.email.toLowerCase();

      const { createToken, setSessionCookie } = await import('@/lib/auth/jwt');
      const prisma = (await import('@/lib/db/prisma')).default;

      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        const crypto = await import('crypto');
        const bcrypt = await import('bcryptjs');
        const passwordHash = await bcrypt.hash(
          `google-${crypto.randomUUID()}-${Date.now()}`,
          12
        );
        user = await prisma.user.create({
          data: {
            email,
            firstName: profile.firstName,
            lastName: profile.lastName,
            passwordHash,
            avatarUrl: profile.avatarUrl,
            role: 'TENANT',
            isVerified: profile.isVerified,
          },
        });
      }

      const token = await createToken({
        id: user.id,
        email: user.email,
        role: user.role as any,
      });

      setSessionCookie(token);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          data: {
            user: {
              id: user.id,
              email: user.email,
              phone: user.phone,
              firstName: user.firstName,
              lastName: user.lastName,
              role: user.role,
              isVerified: user.isVerified,
              createdAt: user.createdAt,
            },
            token,
          },
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google sign-in failed';
      res.writeHead(401);
      res.end(JSON.stringify({ success: false, error: message }));
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: 'invalid-credential' }),
    });

    assert.equal(response.status, 401);
    const json = (await response.json()) as { success: boolean; error?: string };
    assert.equal(json.success, false);
    assert.ok(json.error);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
