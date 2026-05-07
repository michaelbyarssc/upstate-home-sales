import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import type { TradeIn } from '@uhs/db';
import { TradeInActions } from './actions-form';
import '../trade-ins.css';

export default async function TradeInDetail({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from('trade_ins')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (!data) notFound();
  const t = data as TradeIn;

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <Link href="/trade-ins" style={{ color: 'var(--adm-ink-mute)', fontSize: 13, textDecoration: 'none' }}>
          ← Back to trade-ins
        </Link>
      </div>
      <div className="page-header">
        <div className="eyebrow">Trade-in submission</div>
        <h1>{t.contact_name}</h1>
        <p>
          {t.email ?? '—'}{t.phone ? ` · ${t.phone}` : ''} · submitted {new Date(t.created_at).toLocaleString()}
        </p>
      </div>

      <div className="ti-detail">
        <div className="card">
          <div className="card-head"><h3>Home details</h3></div>
          <div className="card-body">
            <div className="field-row">
              <div className="field"><label className="label">Year</label><div>{t.year ?? '—'}</div></div>
              <div className="field"><label className="label">Manufacturer</label><div>{t.make ?? '—'}</div></div>
            </div>
            <div className="field-row">
              <div className="field"><label className="label">Model</label><div>{t.model ?? '—'}</div></div>
              <div className="field"><label className="label">Size</label><div>{t.size_w && t.size_l ? `${t.size_w}′ × ${t.size_l}′` : '—'}</div></div>
            </div>
            <div className="field">
              <label className="label">Condition notes</label>
              <div style={{ whiteSpace: 'pre-wrap', padding: 12, background: 'var(--c-bg)', borderRadius: 4 }}>
                {t.condition_notes ?? <em style={{ color: 'var(--adm-ink-mute)' }}>None provided.</em>}
              </div>
            </div>
          </div>
        </div>

        <aside>
          <TradeInActions tradeIn={t} />
        </aside>
      </div>
    </>
  );
}
