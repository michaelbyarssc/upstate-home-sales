/**
 * Minimal, dependency-free HTML email builder.
 *
 * Why this exists: Resend only renders clickable links when the message carries
 * an HTML part. Our plain-text emails get auto-linkified by Gmail but show as
 * dead text in Outlook / Apple Mail / web portals. `renderEmailHtml` produces an
 * HTML alternative (sent alongside the existing plain-text body) with real
 * <a href> links and a CTA button that works across clients.
 *
 * Constraints that keep it compatible everywhere:
 *  - table-based layout, INLINE styles only (clients strip <style>/external CSS)
 *  - every dynamic value is HTML-escaped (callers pass raw text — no double-escape)
 *  - the CTA button puts its background on <td bgcolor> so it stays filled even
 *    where Outlook drops the anchor's background; rounded corners degrade to square
 *  - no images, no remote CSS, no tracking pixels (deliverability + privacy)
 */

/** Escape the five HTML-significant chars so dynamic text can't break layout or inject markup. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Accept only a #RGB / #RRGGBB hex; otherwise fall back to the brand default
 *  (also prevents CSS injection via a malicious brand_color value). */
function safeColor(input?: string | null): string {
  const fallback = '#B9532A'; // matches the app's default brand color
  const v = (input ?? '').trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v : fallback;
}

export function renderEmailHtml(opts: {
  heading?: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  secondaryLinks?: { label: string; url: string }[];
  brandColor?: string | null;
  signature?: string;
}): string {
  const accent = safeColor(opts.brandColor);

  const headingHtml = opts.heading
    ? `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#111827;font-weight:600;">${escapeHtml(
        opts.heading,
      )}</h1>`
    : '';

  const paragraphsHtml = opts.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#374151;">${escapeHtml(p)}</p>`,
    )
    .join('');

  const buttonHtml = opts.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;">
         <tr>
           <td align="center" bgcolor="${accent}" style="border-radius:6px;">
             <a href="${escapeHtml(opts.button.url)}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;font-family:Helvetica,Arial,sans-serif;">${escapeHtml(
               opts.button.label,
             )}</a>
           </td>
         </tr>
       </table>`
    : '';

  const secondaryHtml =
    opts.secondaryLinks && opts.secondaryLinks.length
      ? opts.secondaryLinks
          .map(
            (l) =>
              `<p style="margin:0 0 10px;font-size:14px;line-height:1.5;"><a href="${escapeHtml(
                l.url,
              )}" style="color:${accent};text-decoration:underline;">${escapeHtml(l.label)}</a></p>`,
          )
          .join('')
      : '';

  const signatureHtml = opts.signature
    ? `<p style="margin:20px 0 0;font-size:14px;color:#6b7280;">${escapeHtml(opts.signature)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:8px;border:1px solid #e5e7eb;">
          <tr>
            <td style="padding:28px 28px 24px;font-family:Helvetica,Arial,sans-serif;">
              ${headingHtml}
              ${paragraphsHtml}
              ${buttonHtml}
              ${secondaryHtml}
              ${signatureHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
