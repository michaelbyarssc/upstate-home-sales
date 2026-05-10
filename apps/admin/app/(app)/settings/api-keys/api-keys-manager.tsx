'use client';

import { useState, useTransition } from 'react';
import type { OrgApiKey } from '@uhs/db';
import { createApiKey, revokeApiKey } from './actions';

export function ApiKeysManager({ initial }: { initial: OrgApiKey[] }) {
  const [keys, setKeys] = useState(initial);
  const [name, setName] = useState('');
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [justCreated, setJustCreated] = useState<{ key: string; name: string } | null>(null);

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setMsg(null);
    startTransition(async () => {
      try {
        const { key, row } = await createApiKey({ name: name.trim() });
        setJustCreated({ key, name: row.name });
        setKeys((prev) => [row, ...prev]);
        setName('');
      } catch (e) {
        setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Create failed' });
      }
    });
  }

  function revoke(k: OrgApiKey) {
    if (!confirm(`Revoke "${k.name}"? Any apps using it will get 401 immediately.`)) return;
    startTransition(async () => {
      try {
        await revokeApiKey(k.id);
        setKeys((prev) => prev.map((x) => x.id === k.id ? { ...x, revoked_at: new Date().toISOString() } : x));
        setMsg({ kind: 'success', text: `Revoked ${k.name}` });
      } catch (e) {
        setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Revoke failed' });
      }
    });
  }

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 800 }}>
      {/* One-time-show new-key panel */}
      {justCreated && (
        <section className="card" style={{ borderColor: 'var(--adm-accent)' }}>
          <div className="card-head">
            <h3>New key created — {justCreated.name}</h3>
            <div className="sub">Copy this now. We can&rsquo;t show it again.</div>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                readOnly
                value={justCreated.key}
                onFocus={(e) => e.currentTarget.select()}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(justCreated.key)}
                style={{
                  background: 'var(--adm-accent)', color: '#fff', border: 'none',
                  padding: '0 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                }}
              >
                Copy
              </button>
            </div>
            <button
              type="button"
              onClick={() => setJustCreated(null)}
              style={{
                marginTop: 10, background: 'transparent', border: 'none',
                color: 'var(--adm-ink-mute)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline',
              }}
            >
              I&rsquo;ve copied it — dismiss
            </button>
          </div>
        </section>
      )}

      {/* Existing keys */}
      <section className="card">
        <div className="card-head">
          <h3>Active keys ({keys.filter((k) => !k.revoked_at).length})</h3>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {keys.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--adm-ink-mute)' }}>No keys yet. Create one below.</div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {keys.map((k) => (
                <li key={k.id} style={{
                  padding: '12px 16px',
                  borderTop: '1px solid var(--adm-line, #e5dfd1)',
                  display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center',
                  opacity: k.revoked_at ? 0.4 : 1,
                }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>
                      {k.name}
                      {k.revoked_at && <span style={{ color: '#a53a2c', fontSize: 11, marginLeft: 8 }}>REVOKED</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--adm-ink-mute)', marginTop: 2 }}>
                      Created {new Date(k.created_at).toLocaleDateString()} · Scopes: {k.scopes.join(', ')}
                      {k.last_used_at && <> · Last used {new Date(k.last_used_at).toLocaleDateString()}</>}
                    </div>
                  </div>
                  {!k.revoked_at && (
                    <button
                      type="button"
                      onClick={() => revoke(k)}
                      disabled={pending}
                      style={{
                        background: 'transparent', border: '1px solid #a53a2c', color: '#a53a2c',
                        padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                      }}
                    >
                      Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Create */}
      <section className="card">
        <div className="card-head">
          <h3>Create key</h3>
          <div className="sub">For partners hitting <code>/api/v1/inventory</code>. Read-only by default.</div>
        </div>
        <form onSubmit={add} className="card-body">
          <div className="field">
            <label className="label">Key name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Partner site - Anderson Shopper" />
          </div>
          {msg && (
            <div style={{
              padding: 10, borderRadius: 4, fontSize: 13, marginTop: 8,
              background: msg.kind === 'success' ? '#e6efe2' : '#faf0ee',
              color: msg.kind === 'success' ? '#4a6b3f' : '#a53a2c',
            }}>{msg.text}</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="submit" disabled={pending || !name.trim()} style={{
              background: 'var(--adm-accent)', color: '#fff', border: 'none',
              padding: '8px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
              opacity: pending || !name.trim() ? 0.5 : 1,
            }}>
              {pending ? 'Creating…' : 'Create key'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
