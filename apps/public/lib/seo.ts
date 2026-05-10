/**
 * SEO helpers — JSON-LD schema generators for Google + AI Overviews.
 *
 * Keep these dependency-free so they can be inlined into both server and
 * client components. Output is a string suitable for
 * `<script type="application/ld+json">{html}</script>`.
 */

export type LDOrganization = {
  name: string;
  url: string;
  logoUrl?: string | null;
  phone?: string | null;
  streetAddress?: string;
  addressLocality?: string; // city
  addressRegion?: string;   // state code
  postalCode?: string;
  addressCountry?: string;  // ISO country code (default 'US')
  sameAs?: string[];        // social URLs
};

export type LDHome = {
  /** Public absolute URL for this home's detail page. */
  url: string;
  name: string;
  /** "Single-wide", "Double-wide", "Modular" or whatever description fits. */
  description?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  imageUrls?: string[];
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  /** Price in cents. Null/undefined → no Offer block. */
  priceCents?: number | null;
  startingFrom?: boolean;
  stockNo: string;
  status?: 'in_stock' | 'sold' | 'on_hold';
};

const PUBLIC_BASE = process.env.NEXT_PUBLIC_PUBLIC_URL ?? 'https://upstatehomecenter.com';

export function organizationSchema(org: LDOrganization): string {
  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'AutoDealer', // Manufactured-home dealers don't have a perfect schema type;
                          // AutoDealer is closest in Google's vocabulary and is what most
                          // dealers in this segment use. Real-estate agencies use a different one.
    name: org.name,
    url: org.url,
  };
  if (org.logoUrl) node.logo = org.logoUrl;
  if (org.phone) node.telephone = org.phone;
  if (org.streetAddress || org.addressLocality) {
    node.address = {
      '@type': 'PostalAddress',
      streetAddress: org.streetAddress,
      addressLocality: org.addressLocality,
      addressRegion: org.addressRegion,
      postalCode: org.postalCode,
      addressCountry: org.addressCountry ?? 'US',
    };
  }
  if (org.sameAs?.length) node.sameAs = org.sameAs;
  return JSON.stringify(node);
}

export function homeProductSchema(h: LDHome, dealerName: string): string {
  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: h.name,
    description: h.description ?? `${h.beds ?? '—'} bed, ${h.baths ?? '—'} bath manufactured home${h.sqft ? ` with ${h.sqft.toLocaleString()} sq ft` : ''}.`,
    sku: h.stockNo,
    url: h.url,
  };
  if (h.imageUrls?.length) node.image = h.imageUrls;
  if (h.manufacturer) {
    node.brand = { '@type': 'Brand', name: h.manufacturer };
    if (h.model) node.model = h.model;
  }
  // additionalProperty captures specs that don't fit Product cleanly.
  const props: Array<Record<string, unknown>> = [];
  if (h.beds != null) props.push({ '@type': 'PropertyValue', name: 'Bedrooms', value: h.beds });
  if (h.baths != null) props.push({ '@type': 'PropertyValue', name: 'Bathrooms', value: h.baths });
  if (h.sqft != null) props.push({ '@type': 'PropertyValue', name: 'Square Feet', value: h.sqft });
  if (props.length) node.additionalProperty = props;

  if (h.priceCents != null && h.priceCents > 0) {
    node.offers = {
      '@type': 'Offer',
      url: h.url,
      priceCurrency: 'USD',
      price: (h.priceCents / 100).toFixed(2),
      priceSpecification: h.startingFrom
        ? {
            '@type': 'PriceSpecification',
            price: (h.priceCents / 100).toFixed(2),
            priceCurrency: 'USD',
            description: 'Starting price; final quote depends on options and delivery.',
          }
        : undefined,
      availability:
        h.status === 'sold' ? 'https://schema.org/SoldOut'
          : h.status === 'on_hold' ? 'https://schema.org/LimitedAvailability'
          : 'https://schema.org/InStock',
      seller: { '@type': 'AutoDealer', name: dealerName },
    };
  }

  return JSON.stringify(node);
}

export type LDItemListEntry = {
  url: string;
  name: string;
};

export function itemListSchema(items: LDItemListEntry[]): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: item.url,
      name: item.name,
    })),
  });
}

export function absoluteUrl(path: string): string {
  if (path.startsWith('http')) return path;
  const base = PUBLIC_BASE.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}
