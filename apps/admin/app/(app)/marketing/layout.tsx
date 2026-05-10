import Link from 'next/link';
import { headers } from 'next/headers';

const TABS = [
  { href: '/marketing/integrations', label: 'Integrations' },
  { href: '/marketing/reviews', label: 'Reviews' },
  { href: '/marketing/feeds', label: 'Feeds' },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const pathname = headers().get('x-pathname') ?? '';
  return (
    <>
      <div className="page-header">
        <div className="eyebrow">Workspace</div>
        <h1>Marketing</h1>
        <p>Connect GMB, Meta, GA4, and GTM. Generate Facebook Shop feeds. See review activity.</p>
      </div>
      <div style={{
        display: 'flex', gap: 4, marginBottom: 24,
        borderBottom: '1px solid var(--adm-line, #e5dfd1)',
      }}>
        {TABS.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              style={{
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                color: active ? 'var(--adm-accent)' : 'var(--adm-ink-mute)',
                textDecoration: 'none',
                borderBottom: active ? '2px solid var(--adm-accent)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      {children}
    </>
  );
}
