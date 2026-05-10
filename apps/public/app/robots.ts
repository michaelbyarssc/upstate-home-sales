import type { MetadataRoute } from 'next';
import { absoluteUrl } from '../lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Block private/internal routes that shouldn't be indexed.
        disallow: ['/q/', '/api/', '/portal/'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
