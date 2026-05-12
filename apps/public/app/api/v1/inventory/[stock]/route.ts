import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@uhs/db/service';
import { authenticateApiKey, hasScope } from '../../../../../lib/api-auth';
import { enforceRateLimit, rateLimitHeaders } from '../../../../../lib/rate-limit';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: { stock: string } },
) {
  const authed = await authenticateApiKey(req);
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasScope(authed, 'read:inventory')) {
    return NextResponse.json({ error: 'Insufficient scope' }, { status: 403 });
  }

  const rl = await enforceRateLimit(authed.keyHash, authed.rateLimitPerMinute);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', limit: rl.limit, retry_after_seconds: Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000)) },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const sb = createServiceClient();
  const { data, error } = await sb
    .from('public_homes')
    .select('*')
    .eq('org_id', authed.orgId)
    .eq('stock_no', params.stock)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ data }, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      ...rateLimitHeaders(rl),
    },
  });
}
