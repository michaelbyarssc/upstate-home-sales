import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE, type Location, type Org } from '@uhs/db';

export const dynamic = 'force-dynamic';

export default async function FeedsPage() {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value ?? null;
  if (!orgId) return <div className="placeholder"><strong>No active org.</strong> <Link href="/select-org">Pick one</Link>.</div>;

  const [{ data: org }, { data: locations }] = await Promise.all([
    supabase.from('orgs').select('*').eq('id', orgId).maybeSingle(),
    supabase.from('locations').select('*').eq('org_id', orgId).is('deleted_at', null).order('is_default', { ascending: false }),
  ]);

  const o = org as Org | null;
  const locs = (locations ?? []) as Location[];
  const publicBase = process.env.NEXT_PUBLIC_PUBLIC_URL ?? 'https://upstatehomecenter.com';
  const orgFeed = `${publicBase}/api/feeds/facebook-shop.xml?org=${o?.slug ?? ''}`;

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 800 }}>
      <section className="card">
        <div className="card-head">
          <h3>Facebook Shop / Catalog feed</h3>
          <div className="sub">
            Submit these URLs in <strong>Meta Commerce Manager → Catalog → Data Sources → Add → Scheduled feed</strong>.
            Updates daily, includes all <code>published</code> homes.
          </div>
        </div>
        <div className="card-body">
          <div className="field">
            <label className="label">Org-wide feed (all locations)</label>
            <input className="input" readOnly value={orgFeed} onFocus={(e) => e.currentTarget.select()} />
          </div>

          {locs.length > 1 && (
            <div className="field" style={{ marginTop: 16 }}>
              <label className="label">Per-location feeds</label>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                {locs.map((loc) => {
                  const url = `${publicBase}/${loc.slug}/api/feeds/facebook-shop.xml`;
                  return (
                    <li key={loc.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--adm-ink-mute)', minWidth: 140 }}>{loc.name}</span>
                      <input className="input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
