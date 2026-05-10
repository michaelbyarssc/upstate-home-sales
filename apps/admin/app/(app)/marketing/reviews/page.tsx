import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE, type GmbReview } from '@uhs/db';

export const dynamic = 'force-dynamic';

export default async function ReviewsPage() {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value ?? null;
  if (!orgId) return <div className="placeholder"><strong>No active org.</strong> <Link href="/select-org">Pick one</Link>.</div>;

  const { data } = await supabase
    .from('gmb_reviews')
    .select('*')
    .eq('org_id', orgId)
    .order('reviewed_at', { ascending: false })
    .limit(100);
  const reviews = (data ?? []) as GmbReview[];

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 800 }}>
      <section className="card">
        <div className="card-head">
          <h3>Recent reviews ({reviews.length})</h3>
          <div className="sub">Pulled daily from Google Business Profile via /api/cron/gmb-sync.</div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {reviews.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--adm-ink-mute)' }}>
              No reviews synced yet. Connect Google Business Profile in <Link href="/marketing/integrations" style={{ color: 'var(--adm-accent)' }}>Integrations</Link> and the next cron run will populate this list.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {reviews.map((r) => (
                <li key={r.id} style={{ padding: '14px 16px', borderTop: '1px solid var(--adm-line, #e5dfd1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>
                      {r.author_name ?? 'Anonymous'}
                      <span style={{ color: '#E0A82E', marginLeft: 8 }}>
                        {'★'.repeat(r.rating)}<span style={{ color: 'var(--adm-line, #e5dfd1)' }}>{'★'.repeat(5 - r.rating)}</span>
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--adm-ink-mute)' }}>
                      {new Date(r.reviewed_at).toLocaleDateString()}
                    </div>
                  </div>
                  {r.comment && (
                    <p style={{ marginTop: 6, fontSize: 13, color: 'var(--adm-ink-soft)', whiteSpace: 'pre-wrap' }}>
                      {r.comment}
                    </p>
                  )}
                  {r.reply_text ? (
                    <div style={{ marginTop: 10, padding: '8px 12px', background: '#FAF4EB', borderRadius: 4, fontSize: 12 }}>
                      <strong>Your reply</strong> ({r.replied_at ? new Date(r.replied_at).toLocaleDateString() : ''}): {r.reply_text}
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--adm-ink-mute)', fontStyle: 'italic' }}>
                      No reply yet. Reply via Google Business Profile (in-app reply UI lands in a follow-up).
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
