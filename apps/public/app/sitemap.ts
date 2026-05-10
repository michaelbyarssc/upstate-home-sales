import type { MetadataRoute } from 'next';
import { createPublicClient } from '../lib/supabase';
import { absoluteUrl } from '../lib/seo';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createPublicClient();
  const { data: homes } = await supabase
    .from('public_homes')
    .select('stock_no, created_at')
    .order('created_at', { ascending: false })
    .limit(1000);

  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'daily', priority: 1.0 },
    { url: absoluteUrl('/inventory'), changeFrequency: 'daily', priority: 0.9 },
    { url: absoluteUrl('/financing'), changeFrequency: 'monthly', priority: 0.7 },
    { url: absoluteUrl('/about'), changeFrequency: 'monthly', priority: 0.5 },
    { url: absoluteUrl('/contact'), changeFrequency: 'monthly', priority: 0.6 },
    { url: absoluteUrl('/trade-in'), changeFrequency: 'monthly', priority: 0.5 },
  ];

  const homeUrls: MetadataRoute.Sitemap = (homes ?? []).map((h: { stock_no: string; created_at: string }) => ({
    url: absoluteUrl(`/inventory/${encodeURIComponent(h.stock_no)}`),
    lastModified: new Date(h.created_at),
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [...staticPages, ...homeUrls];
}
