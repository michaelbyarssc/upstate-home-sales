import { NextResponse } from 'next/server';
import { createClient } from '@uhs/db/server';
import { findAdapter, runDiscovery } from '../../../../../lib/catalog-importer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Discovery honors each adapter's robots.txt crawl-delay (10s for the
// Clayton/OwnTru sites), so a 13-model line needs ~2.5 minutes. 300s matches
// the apply route — the highest the project's plan allows. Catalogs too big
// for this window need a narrower URL (single series/region).
export const maxDuration = 300;

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let url: string;
  try {
    const body = await req.json();
    url = String(body?.url ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'bad_request', detail: 'invalid JSON' }, { status: 400 });
  }
  if (!url) return NextResponse.json({ error: 'bad_request', detail: 'missing url' }, { status: 400 });
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: 'bad_request', detail: 'not a URL' }, { status: 400 });
  }

  const adapter = findAdapter(url);
  if (!adapter) {
    return NextResponse.json({ error: 'no_adapter', url }, { status: 404 });
  }

  // Confirm the dealer's session has a manufacturer match. This also exercises
  // the user's RLS view of the manufacturers table.
  const { data: mfr } = await supabase
    .from('manufacturers')
    .select('id, name, slug')
    .eq('slug', adapter.manufacturerSlug)
    .maybeSingle();
  if (!mfr) {
    return NextResponse.json(
      { error: 'manufacturer_missing', slug: adapter.manufacturerSlug },
      { status: 500 },
    );
  }

  try {
    const result = await runDiscovery({ adapter, url });
    return NextResponse.json({
      adapter: {
        slug: adapter.slug,
        displayName: adapter.displayName,
        manufacturerSlug: adapter.manufacturerSlug,
        manufacturerName: mfr.name,
      },
      models: result.models,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'discovery_failed', detail }, { status: 502 });
  }
}
