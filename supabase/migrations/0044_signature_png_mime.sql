-- ============================================================================
-- 0044_signature_png_mime.sql
-- The public quote e-signature (signQuote → /q/[token]) uploads the signature
-- as a PNG to the `quote-pdfs` bucket, but that bucket's allowed_mime_types is
-- restricted (PDF only), so the upload fails with:
--   "Storage upload failed: mime type image/png is not supported"
-- which blocks online quote acceptance entirely (and the auto-invoice that runs
-- after it). Allow image/png on the bucket. Idempotent; only touches the bucket
-- if it actually restricts MIME types and doesn't already permit png.
-- ============================================================================

update storage.buckets
set allowed_mime_types = allowed_mime_types || array['image/png']
where id = 'quote-pdfs'
  and allowed_mime_types is not null
  and not ('image/png' = any(allowed_mime_types));
