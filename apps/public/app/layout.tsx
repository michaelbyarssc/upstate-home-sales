import type { Metadata } from 'next';
import './globals.css';
import { SiteHeader, SiteFooter } from './site-chrome';
import { AttributionCapture } from './attribution-capture';
import { CompareBar } from '../components/CompareBar';
import { PixelInstaller } from '../components/PixelInstaller';
import { AIChatWidget } from '../components/AIChatWidget';
import { VisitorTracker } from '../components/VisitorTracker';
import { createPublicClient } from '../lib/supabase';
import type { OrgIntegration } from '@uhs/db';

export const metadata: Metadata = {
  title: { default: 'Upstate Home Sales', template: '%s · Upstate Home Sales' },
  description:
    'Manufactured homes in the South Carolina Upstate. Family-owned dealer with two lots, every major manufacturer, honest pricing.',
};

/** Look up active org's pixel + AI config in a single round trip per request. */
async function getOrgConfig(): Promise<{
  pixels: { ga4: string | null; gtm: string | null; meta: string | null };
  ai: { enabled: boolean; orgSlug: string | null };
}> {
  const empty = {
    pixels: { ga4: null, gtm: null, meta: null },
    ai: { enabled: false, orgSlug: null },
  };
  try {
    const sb = createPublicClient();
    const { data: org } = await sb
      .from('orgs')
      .select('id, slug, ai_chat_enabled')
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
      pixels: {
        ga4: get('ga4', 'measurement_id'),
        gtm: get('gtm', 'container_id'),
        meta: get('meta', 'pixel_id'),
      },
      ai: {
        enabled: Boolean(org.ai_chat_enabled),
        orgSlug: (org.slug as string) ?? null,
      },
    };
  } catch {
    // Pre-migration or table missing → render minimal layout. Don't crash.
    return empty;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const config = await getOrgConfig();
  const pixels = config.pixels;
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
        <VisitorTracker />
        <SiteHeader />
        {children}
        <SiteFooter />
        <CompareBar />
        {config.ai.enabled && <AIChatWidget orgSlug={config.ai.orgSlug} />}
      </body>
    </html>
  );
}
