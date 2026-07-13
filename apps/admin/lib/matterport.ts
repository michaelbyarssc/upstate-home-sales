/** Validates a dealer-pasted Matterport tour URL.
 *
 * The public site renders this URL in an iframe, and the public CSP's
 * frame-src only allows matterport.com hosts — any other host loads as a
 * blank modal. Enforce that here at save time (client + server action).
 *
 * Returns an error message, or null when the URL is valid or empty.
 */
export function matterportUrlError(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null; // the field is optional

  const invalid =
    'Matterport 3D tour URL must be a full https://my.matterport.com/… link — ' +
    'other sites are blocked by the public site’s security policy.';

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalid;
  }
  // The CSP allowlist is https-only and default-port-only, so an http:// or
  // explicit-port URL would pass a host check yet still render blank.
  if (url.protocol !== 'https:' || url.port !== '') return invalid;
  const host = url.hostname.toLowerCase();
  if (host !== 'matterport.com' && !host.endsWith('.matterport.com')) return invalid;
  return null;
}
