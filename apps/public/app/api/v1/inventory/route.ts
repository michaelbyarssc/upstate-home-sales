import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@uhs/db/service';
import { authenticateApiKey, hasScope } from '../../../../lib/api-auth';

/**
 * Phase I — public read-only inventory API.
 *
 *   GET /api/v1/inventory?limit=20&offset=0&type=double&min_beds=3
 *   Authorization: Bearer <api-key>
 *
 * Returns the requesting org's published homes with the same masking as
 * public_homes (base_price_cents and markup_pct stripped; listed_price_cents
 * null when prices_hidden=true).
 *
 * Rate-limit + per-key quota enforcement is handled by Vercel's built-in
 * limits for v1; a stricter Redis-backed limiter lands when the dealer
 * upgrades to Pro.
 */

export const runtime = 'nodejs';

const MAX_LIMIT = 100;

export async function GET(req: NextRequest) {
  const authed = await authenticateApiKey(req);
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasScope(authed, 'read:inventory')) {
    return NextResponse.json({ error: 'Insufficient scope' }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10) || 20));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
  const type = url.searchParams.get('type');
  const minBeds = url.searchParams.get('min_beds');
  const maxPrice = url.searchParams.get('max_price');

  const sb = createServiceClient();
  let q = sb
    .from('public_homes')
    .select('id, stock_no, name, model, type, beds, baths, sqft, width_ft, length_ft, year_built, listed_price_cents, prices_hidden, starting_from, headline, description, on_lot_since, is_featured, created_at', { count: 'exact' })
    .eq('org_id', authed.orgId);
  if (type) q = q.eq('type', type);
  if (minBeds) q = q.gte('beds', Number(minBeds));
  if (maxPrice) q = q.lte('listed_price_cents', Number(maxPrice) * 100);
  q = q.order('on_lot_since', { ascending: false, nullsFirst: false }).range(offset, offset + limit - 1);

  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data: data ?? [],
    pagination: { limit, offset, total: count ?? 0 },
  }, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
