'use client';

import { useState, useTransition } from 'react';
import type { IntegrationKind, OrgIntegration } from '@uhs/db';
import { saveIntegrationConfig, disconnectIntegration } from './actions';

type Props = { initialByKind: Partial<Record<IntegrationKind, OrgIntegration>> };

function Field({ label, value, onChange, placeholder, help }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; help?: string;
}) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {help && <div className="help">{help}</div>}
    </div>
  );
}

export function IntegrationsForm({ initialByKind }: Props) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Pull initial config values out of the (typed-loose) jsonb.
  const initGa4 = String((initialByKind.ga4?.config as Record<string, unknown>)?.measurement_id ?? '');
  const initMeta = String((initialByKind.meta?.config as Record<string, unknown>)?.pixel_id ?? '');
  const initGtm = String((initialByKind.gtm?.config as Record<string, unknown>)?.container_id ?? '');
  const initGmbAcct = String((initialByKind.gmb?.config as Record<string, unknown>)?.account_id ?? '');

  const [ga4, setGa4] = useState(initGa4);
  const [meta, setMeta] = useState(initMeta);
  const [gtm, setGtm] = useState(initGtm);
  const [gmbAcct, setGmbAcct] = useState(initGmbAcct);

  function save<K extends IntegrationKind>(kind: K, config: Record<string, unknown>) {
    setMsg(null);
    startTransition(async () => {
      try {
        await saveIntegrationConfig({ kind, config });
        setMsg({ kind: 'success', text: `${kind.toUpperCase()} saved.` });
      } catch (e) {
        setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Save failed' });
      }
    });
  }

  function disconnect(kind: IntegrationKind) {
    if (!confirm(`Disconnect ${kind.toUpperCase()}?`)) return;
    startTransition(async () => {
      try {
        await disconnectIntegration(kind);
        setMsg({ kind: 'success', text: `${kind.toUpperCase()} disconnected.` });
      } catch (e) {
        setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Disconnect failed' });
      }
    });
  }

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 800 }}>
      {/* GA4 */}
      <section className="card">
        <div className="card-head">
          <h3>Google Analytics 4</h3>
          <div className="sub">Pastes your GA4 measurement ID and we&rsquo;ll inject gtag on every public page.</div>
        </div>
        <form className="card-body" onSubmit={(e) => { e.preventDefault(); save('ga4', { measurement_id: ga4.trim() }); }}>
          <Field label="Measurement ID" value={ga4} onChange={setGa4} placeholder="G-XXXXXXXXXX" help="Find in Admin → Data Streams." />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
            {initialByKind.ga4 && (
              <button type="button" onClick={() => disconnect('ga4')} disabled={pending}
                style={{ background: 'transparent', border: '1px solid #a53a2c', color: '#a53a2c', padding: '6px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>
                Disconnect
              </button>
            )}
            <button type="submit" disabled={pending} style={{ background: 'var(--adm-accent)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
              Save
            </button>
          </div>
        </form>
      </section>

      {/* GTM */}
      <section className="card">
        <div className="card-head">
          <h3>Google Tag Manager</h3>
          <div className="sub">Container ID — we&rsquo;ll inject the GTM snippet on every public page.</div>
        </div>
        <form className="card-body" onSubmit={(e) => { e.preventDefault(); save('gtm', { container_id: gtm.trim() }); }}>
          <Field label="Container ID" value={gtm} onChange={setGtm} placeholder="GTM-XXXXXXX" />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
            {initialByKind.gtm && (
              <button type="button" onClick={() => disconnect('gtm')} disabled={pending}
                style={{ background: 'transparent', border: '1px solid #a53a2c', color: '#a53a2c', padding: '6px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>
                Disconnect
              </button>
            )}
            <button type="submit" disabled={pending} style={{ background: 'var(--adm-accent)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
              Save
            </button>
          </div>
        </form>
      </section>

      {/* Meta Pixel */}
      <section className="card">
        <div className="card-head">
          <h3>Meta Pixel (Facebook + Instagram)</h3>
          <div className="sub">Pixel ID for FB / IG ad attribution. Auto-fires PageView; lead form fires Lead.</div>
        </div>
        <form className="card-body" onSubmit={(e) => { e.preventDefault(); save('meta', { pixel_id: meta.trim() }); }}>
          <Field label="Pixel ID" value={meta} onChange={setMeta} placeholder="1234567890123456" />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
            {initialByKind.meta && (
              <button type="button" onClick={() => disconnect('meta')} disabled={pending}
                style={{ background: 'transparent', border: '1px solid #a53a2c', color: '#a53a2c', padding: '6px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>
                Disconnect
              </button>
            )}
            <button type="submit" disabled={pending} style={{ background: 'var(--adm-accent)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
              Save
            </button>
          </div>
        </form>
      </section>

      {/* GMB */}
      <section className="card">
        <div className="card-head">
          <h3>Google Business Profile (GMB)</h3>
          <div className="sub">OAuth-based — review syncing + reply publishing. Manual <code>account_id</code> override below.</div>
        </div>
        <div className="card-body">
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: 'var(--adm-ink-mute)' }}>
              {initialByKind.gmb?.status === 'connected'
                ? <>✓ Connected. Reviews + replies sync daily via <code>/api/cron/gmb-sync</code>.</>
                : <>Not connected. Authorize via Google&rsquo;s consent screen.</>}
            </div>
            <a
              href="/marketing/integrations/gmb/connect"
              className="btn"
              style={{
                background: initialByKind.gmb?.status === 'connected' ? 'var(--adm-bg)' : 'var(--adm-accent)',
                color: initialByKind.gmb?.status === 'connected' ? 'var(--adm-ink)' : '#fff',
                border: initialByKind.gmb?.status === 'connected' ? '1px solid var(--adm-line)' : 'none',
                padding: '8px 14px',
                borderRadius: 6,
                fontSize: 13,
                textDecoration: 'none',
              }}
            >
              {initialByKind.gmb?.status === 'connected' ? 'Manage connection' : 'Connect with Google'}
            </a>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); save('gmb', { account_id: gmbAcct.trim() }); }}>
            <Field label="GMB Account ID (override)" value={gmbAcct} onChange={setGmbAcct} placeholder="123456789" help="Optional. Auto-detected during OAuth — only set this if you manage multiple accounts." />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              {initialByKind.gmb && (
                <button type="button" onClick={() => disconnect('gmb')} disabled={pending}
                  style={{ background: 'transparent', border: '1px solid #a53a2c', color: '#a53a2c', padding: '6px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>
                  Disconnect
                </button>
              )}
              <button type="submit" disabled={pending} style={{ background: 'var(--adm-accent)', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
                Save override
              </button>
            </div>
          </form>
        </div>
      </section>

      {msg && (
        <div style={{ padding: 10, borderRadius: 4, fontSize: 13,
          background: msg.kind === 'success' ? '#e6efe2' : '#faf0ee',
          color: msg.kind === 'success' ? '#4a6b3f' : '#a53a2c' }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
