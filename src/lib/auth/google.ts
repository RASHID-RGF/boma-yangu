export type GoogleTokenClaims = {
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
  picture?: string;
  aud?: string;
  iss?: string;
};

export type NormalizedGoogleProfile = {
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  isVerified: boolean;
};

export function normalizeGoogleProfile(claims: GoogleTokenClaims): NormalizedGoogleProfile {
  const email = (claims.email || '').trim().toLowerCase();

  const fullName = (claims.name || '').trim();
  const nameParts = fullName ? fullName.split(/\s+/) : [];
  const firstName = (claims.given_name || nameParts[0] || email.split('@')[0] || 'User').trim();
  const lastName = (claims.family_name || nameParts.slice(1).join(' ') || 'User').trim();

  return {
    email,
    firstName: firstName || 'User',
    lastName: lastName || 'User',
    avatarUrl: claims.picture || null,
    isVerified: Boolean(claims.email_verified),
  };
}

export async function verifyGoogleToken(
  credential: string,
  allowedClientId: string
): Promise<NormalizedGoogleProfile> {
  if (!credential) {
    throw new Error('Google credential is required');
  }

  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
    { cache: 'no-store' }
  );

  if (!response.ok) {
    throw new Error('Google token verification failed');
  }

  const claims = (await response.json()) as GoogleTokenClaims;

  if (!claims.email) {
    throw new Error('Google account email is missing');
  }

  if (claims.email_verified === false) {
    throw new Error('Google email must be verified');
  }

  if (claims.aud && claims.aud !== allowedClientId) {
    throw new Error('Google client ID mismatch');
  }

  return normalizeGoogleProfile(claims);
}
