import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@uhs/db/service';
import { MODEL_3D_ASSETS_BUCKET } from '@uhs/db';

/**
 * Phase C — signed-URL proxy for 3D assets.
 *
 *   GET /api/3d-asset/<asset_id>
 *
 * The `model-3d-assets` bucket is private. The renderer can't fetch a GLB
 * directly. This route looks up the asset by id, asks Supabase for a
 * 60-minute signed URL via the service role, and 302-redirects the browser
 * there. The browser then downloads the GLB straight from Supabase's CDN
 * (no bytes flow through Vercel — keeps egress free, response is fast).
 *
 * Anon-readable: 3D assets are part of the buyer-facing configurator and
 * aren't sensitive — gating their delivery would require buyer auth that
 * we don't yet require for /inventory/[stock]/design.
 */

export const runtime = 'nodejs';

// Signed URLs expire after 60 minutes; the GLB itself is browser-cached
// well past that via the immutable Cache-Control header on Supabase Storage.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createServiceClient();

  // 1. Look up the asset row.
  const { data: asset, error } = await sb
    .from('model_3d_assets')
    .select('id, glb_storage_path')
    .eq('id', params.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });

  // 2. Generate a signed URL.
  const { data: signed, error: sErr } = await sb.storage
    .from(MODEL_3D_ASSETS_BUCKET)
    .createSignedUrl(asset.glb_storage_path, SIGNED_URL_TTL_SECONDS);
  if (sErr || !signed?.signedUrl) {
    return NextResponse.json({ error: sErr?.message ?? 'Sign failed' }, { status: 500 });
  }

  // 3. Redirect.
  return NextResponse.redirect(signed.signedUrl, 302);
}
