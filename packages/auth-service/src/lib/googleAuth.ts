import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client();

export async function verifyGoogleToken(idToken: string): Promise<{ uid: string; name?: string }> {
  // No audience check — we accept tokens from any of our OAuth clients (Android, iOS, web)
  const ticket = await client.verifyIdToken({ idToken });
  const payload = ticket.getPayload();
  if (!payload?.sub) throw new Error('Invalid Google token payload');
  return { uid: payload.sub, name: payload.name };
}
