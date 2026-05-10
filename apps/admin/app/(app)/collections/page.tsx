import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import type { HomeCollection } from '@uhs/db';

export const dynamic = 'force-dynamic';

export default async function CollectionsListPage() {
  const supabase = createClient();
  const [{ data: collections }, { data: members }] = await Promise.all([
    supabase
      .from('home_collections')
      .select('id, name, slug, description, is_published, sort_order, created_at')
      .order('sort_order')
      .order('name'),
    supabase
      .from('home_collection_members')
      .select('collection_id'),
  ]);

  const counts = new Map<string, number>();
  for (const m of (members ?? []) as Array<{ collection_id: string }>) {
    counts.set(m.collection_id, (counts.get(m.collection_id) ?? 0) + 1);
  }

  const rows = (collections ?? []) as Array<Pick<HomeCollection, 'id' | 'name' | 'slug' | 'description' | 'is_published' | 'sort_order' | 'created_at'>>;

  return (
    <>
      <div className="page-header">
        <div className="eyebrow">Workspace · Curated</div>
        <h1>Collections</h1>
        <p>
          Group homes for marketing landing pages — &ldquo;Under $100k&rdquo;, &ldquo;Single-wides&rdquo;, &ldquo;New arrivals&rdquo;.
          Each collection gets its own URL on the public site.
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Link
          href="/collections/new"
          style={{
            background: 'var(--adm-accent)', color: '#fff',
            padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          + New collection
        </Link>
      </div>

      {rows.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid var(--adm-line)', borderRadius: 8, padding: 60, textAlign: 'center' }}>
          <h3>No collections yet</h3>
          <p style={{ color: 'var(--adm-ink-mute)', marginTop: 8 }}>
            Curate a set of homes around a theme, deal, or buyer profile.
          </p>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--adm-line)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--adm-bg)' }}>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Slug</th>
                <th style={{ ...th, textAlign: 'right' }}>Homes</th>
                <th style={th}>Status</th>
                <th style={th}>Public URL</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--adm-line)' }}>
                  <td style={td}>
                    <Link href={`/collections/${c.id}`} style={{ color: 'var(--adm-accent)', fontWeight: 500, textDecoration: 'none' }}>
                      {c.name}
                    </Link>
                    {c.description && (
                      <div style={{ fontSize: 12, color: 'var(--adm-ink-mute)', marginTop: 2 }}>{c.description}</div>
                    )}
                  </td>
                  <td style={{ ...td, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, color: 'var(--adm-ink-mute)' }}>
                    {c.slug}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {counts.get(c.id) ?? 0}
                  </td>
                  <td style={td}>
                    <span style={{
                      padding: '3px 9px', borderRadius: 10, fontSize: 10,
                      fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.04,
                      background: c.is_published ? '#dcfce7' : '#f3f4f6',
                      color: c.is_published ? '#166534' : '#6b7280',
                    }}>
                      {c.is_published ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td style={{ ...td, fontSize: 12 }}>
                    {c.is_published ? (
                      <code style={{ color: 'var(--adm-ink-mute)' }}>/inventory/collection/{c.slug}</code>
                    ) : (
                      <span style={{ color: 'var(--adm-ink-mute)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '12px 16px',
  font: '600 11px/1 var(--f-body)', letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--adm-ink-mute)',
};
const td: React.CSSProperties = { padding: '12px 16px', verticalAlign: 'middle' };
