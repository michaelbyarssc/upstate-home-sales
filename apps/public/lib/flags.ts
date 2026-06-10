/**
 * Public-site feature flags.
 *
 * DESIGN_STUDIO_ENABLED — kill switch for the Design Studio (dealer request,
 * 2026-06-09: hide it until the experience is reworked). While false:
 *   - fetchDesignReadyIds() returns an empty set, so every "Design home" /
 *     "Design this home" CTA stays hidden on all surfaces.
 *   - /inventory/[stock]/design redirects to the home's detail page.
 * Flip to true to relaunch — no other code changes needed.
 */
export const DESIGN_STUDIO_ENABLED = false;
