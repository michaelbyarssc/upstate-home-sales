-- ============================================================================
-- 0047_design_ready_options_only.sql
-- The public Design Studio dropped its 3D view — the studio's content is now
-- entirely the authored options. A model with only a 3D asset (no options)
-- has nothing to configure, so it must not light up the "Design home" CTA
-- (the design page would just bounce back to the detail page).
-- Same columns/order as 0046 → CREATE OR REPLACE is safe.
-- ============================================================================

CREATE OR REPLACE VIEW public.public_home_design AS
SELECT
  h.id        AS home_id,
  h.stock_no,
  h.model_id,
  EXISTS (SELECT 1 FROM public.model_options mo WHERE mo.home_model_id = h.model_id) AS design_ready
FROM public.homes h
WHERE h.status = 'published'
  AND h.deleted_at IS NULL
  AND h.hide_from_search = false;

GRANT SELECT ON public.public_home_design TO anon, authenticated;
