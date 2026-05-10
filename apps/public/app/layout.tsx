import type { Metadata } from 'next';
import './globals.css';
import { SiteHeader, SiteFooter } from './site-chrome';
import { AttributionCapture } from './attribution-capture';
import { CompareBar } from '../components/CompareBar';
import { PixelInstaller } from '../components/PixelInstaller';
import { createPublicClient } from '../lib/supabase';
import type { OrgIntegration } from '@uhs/db';

export const metadata: Metadata = {
  title: { default: 'Upstate Home Sales', template: '%s · Upstate Home Sales' },
  description:
    'Manufactured homes in the South Carolina Upstate. Family-owned dealer with two lots, every major manufacturer, honest pricing.',
};

/** Look up the active org's pixel/analytics integration IDs. We read once
 *  per request via this helper so the layout stays simple. Multi-tenant
 *  caveat: a single public site currently maps to one org (the default
 *  active one); when multi-org goes live, gate this on the locationSlug
 *  in middleware. */
async function getPixelConfig(): Promise<{
  ga4: string | null;
  gtm: string | null;
  meta: string | null;
}> {
  const empty = { ga4: null, gtm: null, meta: null };
  try {
    const sb = createPublicClient();
    // Pick the first active org as the public site's owner. Once multi-org
    // public domains land, replace this with a domain→org lookup.
    const { data: org } = await sb
      .from('orgs')
      .select('id')
      .eq('status', 'active')
      .order('created_at')
      .limit(1)
      .maybeSingle();
    if (!org) return empty;
    const { data } = await sb
      .from('public_org_integrations')
      .select('kind, config, status')
      .eq('org_id', org.id);
    const rows = (data ?? []) as Pick<OrgIntegration, 'kind' | 'config' | 'status'>[];
    const get = (k: 'ga4' | 'gtm' | 'meta', field: string) => {
      const row = rows.find((r) => r.kind === k);
      const v = (row?.config as Record<string, unknown> | undefined)?.[field];
      return typeof v === 'string' && v.length > 0 ? v : null;
    };
    return {
      ga4: get('ga4', 'measurement_id'),
      gtm: get('gtm', 'container_id'),
      meta: get('meta', 'pixel_id'),
    };
  } catch {
    // Pre-migration or table missing → render no pixels. Don't crash layout.
    return empty;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pixels = await getPixelConfig();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <PixelInstaller
          ga4MeasurementId={pixels.ga4}
          gtmContainerId={pixels.gtm}
          metaPixelId={pixels.meta}
        />
        <AttributionCapture />
        <SiteHeader />
        {children}
        <SiteFooter />
        <CompareBar />
      </body>
    </html>
  );
}
