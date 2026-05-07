import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import { formatCents, type TradeIn } from '@uhs/db';
import './trade-ins.css';

export default async function TradeInsPage() {
  const supabase = createClient();
  const { data: rows } = await supabase
    .from('trade_ins')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  const items = (rows ?? []) as TradeIn[];

  return (
    <>
      <div className="page-header">
        <div className="eyebrow">Workspace · Week 6</div>
        <h1>Trade-ins</h1>
        <p>{items.length} submissions · click to review and post a preliminary offer.</p>
      </div>

      {items.length === 0 ? (
        <div className="placeholder">
          <strong>No submissions yet.</strong> Trade-ins land here when a customer fills out the public form.
        </div>
      ) : (
        <table className="ti-table">
          <thead>
            <tr>
              <th>Contact</th>
              <th>Home</th>
              <th>Size</th>
              <th>Status</th>
              <th>Offer</th>
              <th>Submitted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id}>
                <td>
                  <strong>{t.contact_name}</strong>
                  <div className="sub">{t.email ?? '—'}{t.phone ? ` · ${t.phone}` : ''}</div>
                </td>
                <td>
                  {t.year ?? '—'} {t.make ?? ''} {t.model ?? ''}
                </td>
                <td>{t.size_w && t.size_l ? `${t.size_w}′ × ${t.size_l}′` : '—'}</td>
                <td><span className={`bd bd-${badge(t.status)}`}>{t.status}</span></td>
                <td>{t.offer_cents ? formatCents(t.offer_cents) : '—'}</td>
                <td>{new Date(t.created_at).toLocaleDateString()}</td>
                <td>
                  <Link href={`/trade-ins/${t.id}`} style={{ color: 'var(--adm-accent)', fontSize: 13 }}>
                    Review →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function badge(s: TradeIn['status']) {
  switch (s) {
    case 'submitted': return 'info';
    case 'reviewed':  return 'soft';
    case 'offered':   return 'warn';
    case 'accepted':  return 'success';
    case 'declined':  return 'danger';
  }
}
