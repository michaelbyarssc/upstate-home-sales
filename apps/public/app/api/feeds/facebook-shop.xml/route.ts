import { NextResponse } from 'next/server';
import { createPublicClient, publicPhotoUrl } from '../../../../lib/supabase';
import { absoluteUrl } from '../../../../lib/seo';
import { formatCents } from '@uhs/db';

/**
 * Meta Commerce Catalog feed (XML/RSS dialect).
 *
 *   GET /api/feeds/facebook-shop.xml?org=<org-slug>
 *
 * Returns all `published` homes for the given org as a Facebook Product
 * Feed. Cached server-side for 1 hour. The dealer pastes the feed URL
 * into Meta Commerce Manager → Catalog → Data Sources → Scheduled feed.
 *
 * Spec reference: https://developers.facebook.com/docs/commerce-platform/catalog/fields
 */

export const revalidate = 3600;

function escapeXml(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function priceTag(cents: number | null | undefined): string {
  if (!cents || cents <= 0) return '0.00 USD';
  return `${(cents / 100).toFixed(2)} USD`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orgSlug = url.searchParams.get('org');
  if (!orgSlug) {
    return new NextResponse('Missing ?org=', { status: 400 });
  }

  const sb = createPublicClient();
  const { data: org } = await sb
    .from('orgs')
    .select('id, name, slug')
    .eq('slug', orgSlug)
    .maybeSingle();
  if (!org) return new NextResponse('Org not found', { status: 404 });

  // Use public_homes view so we automatically respect prices_hidden + soft-delete.
  const { data: homes } = await sb
    .from('public_homes')
    .select(
      'id, stock_no, name, model, type, beds, baths, sqft, listed_price_cents, prices_hidden, headline, description, manufacturer_id, manufacturers(name), public_home_photos(storage_path, sort_order)'
    )
    .eq('org_id', org.id)
    .order('on_lot_since', { ascending: false, nullsFirst: false })
    .limit(1000);

  type FeedHome = {
    id: string;
    stock_no: string;
    name: string;
    model: string | null;
    type: string;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    listed_price_cents: number | null;
    prices_hidden: boolean;
    headline: string | null;
    description: string | null;
    manufacturers?: { name: string } | null;
    public_home_photos?: Array<{ storage_path: string; sort_order: number }> | null;
  };
  const list = (homes ?? []) as unknown as FeedHome[];

  const items = list.map((h) => {
    const detailUrl = absoluteUrl(`/inventory/${encodeURIComponent(h.stock_no)}`);
    const firstPhoto = h.public_home_photos?.[0]?.storage_path;
    const imgUrl = firstPhoto ? publicPhotoUrl(firstPhoto) : '';
    const description =
      h.description ??
      h.headline ??
      `${h.beds ?? '—'} bed / ${h.baths ?? '—'} bath · ${h.sqft?.toLocaleString() ?? '—'} sq ft`;
    const brand = h.manufacturers?.name ?? 'Manufactured Home';

    // Some FB fields require non-empty values; we substitute sensible defaults.
    const price = h.prices_hidden || !h.listed_price_cents
      ? '0.00 USD'
      : priceTag(h.listed_price_cents);

    return `
    <item>
      <g:id>${escapeXml(h.stock_no)}</g:id>
      <g:title>${escapeXml(h.name)}</g:title>
      <g:description>${escapeXml(description)}</g:description>
      <g:link>${escapeXml(detailUrl)}</g:link>
      <g:image_link>${escapeXml(imgUrl)}</g:image_link>
      <g:availability>in stock</g:availability>
      <g:condition>new</g:condition>
      <g:price>${price}</g:price>
      <g:brand>${escapeXml(brand)}</g:brand>
      <g:product_type>Manufactured Homes &gt; ${escapeXml(h.type)}</g:product_type>
      <g:google_product_category>Home &amp; Garden &gt; Household Appliances</g:google_product_category>
      <g:identifier_exists>FALSE</g:identifier_exists>
    </item>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${escapeXml(org.name)} — Manufactured Home Inventory</title>
    <link>${escapeXml(absoluteUrl('/'))}</link>
    <description>Live inventory feed for ${escapeXml(org.name)}.</description>
    ${items.join('')}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
    },
  });
}
