-- ============================================================================
-- 0046_public_homes_design.sql
-- Anon-safe lookup for the public 3D Design Studio, WITHOUT granting anon
-- select on the homes table and WITHOUT touching public_homes (so existing
-- public selects keep working even before this migration is applied — the
-- feature stays dormant until the view exists).
--
--   public_home_design(home_id, stock_no, model_id, design_ready)
--     * model_id     — catalog FK so the design page can resolve the model's
--                      3D asset + options (home_models itself stays anon-revoked).
--     * design_ready — true when the model has ≥1 authored option or a 3D asset,
--                      so the site only surfaces "Design home" where the studio
--                      has real content.
-- ============================================================================

CREATE VIEW public.public_home_design AS
SELECT
  h.id        AS home_id,
  h.stock_no,
  h.model_id,
  (
    EXISTS (SELECT 1 FROM public.model_options mo      WHERE mo.home_model_id = h.model_id)
    OR EXISTS (SELECT 1 FROM public.model_3d_assets ma WHERE ma.home_model_id = h.model_id)
  ) AS design_ready
FROM public.homes h
WHERE h.status = 'published'
  AND h.deleted_at IS NULL
  AND h.hide_from_search = false;

GRANT SELECT ON public.public_home_design TO anon, authenticated;
