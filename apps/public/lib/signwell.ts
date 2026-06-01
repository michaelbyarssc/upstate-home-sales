const BASE = 'https://www.signwell.com/api/v1';

/**
 * Fetch a CURRENT embedded signing URL for one recipient straight from SignWell.
 *
 * The kiosk must never rely on the embedded URL we captured at generate time —
 * SignWell's embedded URLs expire, so a signer who returns after any delay (or a
 * later signer in a sequential session) would otherwise load a blank embed. We
 * re-fetch live on every kiosk render. Returns null on any failure so the caller
 * can fall back to the stored URL rather than hard-failing.
 *
 * Server-only: reads SIGNWELL_API_KEY (never exposed to the browser).
 */
export async function freshEmbeddedSigningUrl(
  envelopeId: string | null | undefined,
  recipientId: string | null | undefined,
): Promise<string | null> {
  const key = process.env.SIGNWELL_API_KEY;
  if (!key || !envelopeId || !recipientId) return null;
  try {
    const res = await fetch(`${BASE}/documents/${envelopeId}/`, {
      headers: { 'X-Api-Key': key },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const doc = (await res.json()) as {
      recipients?: Array<{ id?: unknown; embedded_signing_url?: unknown }>;
    };
    const match = (doc.recipients ?? []).find((r) => String(r.id) === String(recipientId));
    const url = match?.embedded_signing_url;
    return typeof url === 'string' && url.length > 0 ? url : null;
  } catch {
    return null;
  }
}
