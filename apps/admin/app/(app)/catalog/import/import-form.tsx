'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ModelData, ProgressEvent } from '../../../../lib/catalog-importer';

type DiscoverResponse =
  | {
      adapter: { slug: string; displayName: string; manufacturerSlug: string; manufacturerName: string };
      models: ModelData[];
    }
  | { error: string; url?: string; detail?: string; slug?: string };

type LogLine = { tag: '+' | '~' | '=' | '!' | 'i'; text: string };

export function ImportForm() {
  const [url, setUrl] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [importing, setImporting] = useState(false);
  const [discovery, setDiscovery] = useState<
    null
    | { kind: 'ok'; adapter: { slug: string; displayName: string; manufacturerName: string }; models: ModelData[] }
    | { kind: 'no_adapter'; url: string }
    | { kind: 'error'; message: string }
  >(null);
  const [update, setUpdate] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [summary, setSummary] = useState<{ created: number; updated: number; skipped: number; errors: number } | null>(
    null,
  );

  async function onDiscover() {
    setDiscovery(null);
    setLog([]);
    setSummary(null);
    setDiscovering(true);
    try {
      const res = await fetch('/api/catalog/import/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      let body: DiscoverResponse | null = null;
      try {
        body = (await res.json()) as DiscoverResponse;
      } catch {
        // Non-JSON body — e.g. the platform's plain-text timeout page.
      }
      if (res.ok && body && 'adapter' in body) {
        setDiscovery({
          kind: 'ok',
          adapter: {
            slug: body.adapter.slug,
            displayName: body.adapter.displayName,
            manufacturerName: body.adapter.manufacturerName,
          },
          models: body.models,
        });
      } else if (!res.ok && body && 'error' in body && body.error === 'no_adapter') {
        setDiscovery({ kind: 'no_adapter', url: body.url ?? url.trim() });
      } else if (body) {
        const msg = ('detail' in body && body.detail) || ('error' in body && body.error) || `HTTP ${res.status}`;
        setDiscovery({ kind: 'error', message: String(msg) });
      } else {
        setDiscovery({
          kind: 'error',
          message:
            res.status === 504
              ? 'The server timed out before finishing discovery. Discovery respects the manufacturer site’s crawl-delay, so large catalogs can exceed the time limit — try a more specific URL (a single model line or series) and retry.'
              : `The server returned an unexpected response (HTTP ${res.status}). Please try again.`,
        });
      }
    } catch (e) {
      setDiscovery({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setDiscovering(false);
    }
  }

  async function onImport() {
    if (discovery?.kind !== 'ok') return;
    setImporting(true);
    setLog([]);
    setSummary(null);
    try {
      const res = await fetch('/api/catalog/import/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), update }),
      });
      if (!res.ok || !res.body) {
        let detail = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          if (j?.error) detail = String(j.detail ?? j.error);
        } catch {}
        setLog([{ tag: '!', text: detail }]);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          handleEvent(line);
        }
      }
      const tail = buf.trim();
      if (tail) handleEvent(tail);
    } catch (e) {
      setLog((prev) => [...prev, { tag: '!', text: e instanceof Error ? e.message : String(e) }]);
    } finally {
      setImporting(false);
    }
  }

  function handleEvent(line: string) {
    let event: ProgressEvent | { type: 'fatal'; detail: string };
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    if (event.type === 'start') {
      setLog((prev) => [...prev, { tag: 'i', text: `Importing ${event.total} model(s)…` }]);
      return;
    }
    if (event.type === 'summary') {
      setSummary({ created: event.created, updated: event.updated, skipped: event.skipped, errors: event.errors });
      return;
    }
    if (event.type === 'model') {
      const tag = event.action === 'created' ? '+' : event.action === 'updated' ? '~' : event.action === 'skipped' ? '=' : '!';
      const photos = event.action === 'created' || event.action === 'updated' ? ` (${event.photos}/${event.totalPhotos} photos)` : '';
      const err = event.action === 'error' ? ` — ${event.error ?? 'error'}` : '';
      const noteSkip = event.action === 'skipped' ? ' (already exists — check Refresh to update)' : '';
      setLog((prev) => [...prev, { tag, text: `${event.name}${photos}${err}${noteSkip}` }]);
      return;
    }
    if ((event as any).type === 'fatal') {
      setLog((prev) => [...prev, { tag: '!', text: `Fatal: ${(event as any).detail}` }]);
    }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <section
        style={{
          background: '#fff',
          border: '1px solid var(--adm-line)',
          borderRadius: 8,
          padding: 20,
          marginTop: 16,
        }}
      >
        <label style={{ display: 'block', fontSize: 12, color: 'var(--adm-ink-mute)', marginBottom: 6 }}>
          MANUFACTURER URL
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://owntru.com/model-lines/tru-mini/"
            style={{
              flex: 1,
              padding: '9px 12px',
              border: '1px solid var(--adm-line)',
              borderRadius: 6,
              fontSize: 13,
            }}
            disabled={discovering || importing}
          />
          <button
            type="button"
            onClick={onDiscover}
            disabled={discovering || importing || !url.trim()}
            style={{
              background: 'var(--adm-accent)',
              color: '#fff',
              padding: '9px 16px',
              borderRadius: 6,
              border: 'none',
              fontSize: 13,
              fontWeight: 500,
              cursor: discovering || !url.trim() ? 'not-allowed' : 'pointer',
              opacity: discovering || !url.trim() ? 0.6 : 1,
            }}
          >
            {discovering ? 'Discovering…' : 'Discover'}
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--adm-ink-mute)', marginTop: 8 }}>
          Examples: <code>https://claytonepicjourney.com/homes/?region=3</code>,{' '}
          <code>https://owntru.com/model-lines/tru-origin/</code>
        </p>
      </section>

      {discovery?.kind === 'no_adapter' && (
        <section
          style={{
            marginTop: 16,
            padding: 16,
            background: '#fff7e6',
            border: '1px solid #f0c987',
            borderRadius: 8,
          }}
        >
          <strong>No adapter for this site yet.</strong>
          <p style={{ fontSize: 13, marginTop: 6, color: 'var(--adm-ink-mute)' }}>
            Send this URL to engineering and we&apos;ll add support:
          </p>
          <code
            style={{
              display: 'block',
              marginTop: 8,
              padding: '8px 10px',
              background: '#fff',
              border: '1px solid var(--adm-line)',
              borderRadius: 4,
              fontSize: 12,
              wordBreak: 'break-all',
            }}
          >
            {discovery.url}
          </code>
        </section>
      )}

      {discovery?.kind === 'error' && (
        <section
          style={{
            marginTop: 16,
            padding: 12,
            background: '#ffefef',
            border: '1px solid #e09090',
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          <strong>Discovery failed:</strong> {discovery.message}
        </section>
      )}

      {discovery?.kind === 'ok' && (
        <section
          style={{
            marginTop: 16,
            background: '#fff',
            border: '1px solid var(--adm-line)',
            borderRadius: 8,
            padding: 20,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--adm-ink-mute)', textTransform: 'uppercase' }}>
                Adapter
              </div>
              <strong>{discovery.adapter.displayName}</strong>
              <div style={{ fontSize: 12, color: 'var(--adm-ink-mute)' }}>
                Manufacturer: {discovery.adapter.manufacturerName}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 24, fontWeight: 500 }}>{discovery.models.length}</div>
              <div style={{ fontSize: 11, color: 'var(--adm-ink-mute)' }}>models discovered</div>
            </div>
          </div>

          <div style={{ marginTop: 16, maxHeight: 260, overflowY: 'auto', border: '1px solid var(--adm-line)', borderRadius: 6 }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--adm-bg-subtle)', position: 'sticky', top: 0 }}>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 10px' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px' }}>Type</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px' }}>Beds/Baths</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px' }}>Sq ft</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px' }}>Photos</th>
                </tr>
              </thead>
              <tbody>
                {discovery.models.map((m) => (
                  <tr key={m.name} style={{ borderTop: '1px solid var(--adm-line)' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 500 }}>{m.name}</td>
                    <td style={{ padding: '6px 10px' }}>{m.type}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                      {m.beds ?? '?'} / {m.baths ?? '?'}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                      {m.sqft ? m.sqft.toLocaleString() : '?'}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>{m.photos.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
            <label style={{ fontSize: 12, color: 'var(--adm-ink-mute)' }}>
              <input
                type="checkbox"
                checked={update}
                onChange={(e) => setUpdate(e.target.checked)}
                disabled={importing}
              />{' '}
              Refresh existing models (re-upload photos + overwrite specs)
            </label>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={onImport}
              disabled={importing}
              style={{
                background: 'var(--adm-accent)',
                color: '#fff',
                padding: '9px 16px',
                borderRadius: 6,
                border: 'none',
                fontSize: 13,
                fontWeight: 500,
                cursor: importing ? 'not-allowed' : 'pointer',
                opacity: importing ? 0.6 : 1,
              }}
            >
              {importing ? 'Importing…' : `Import ${discovery.models.length} models`}
            </button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--adm-ink-mute)', marginTop: 8 }}>
            Heads up: imports respect the source site&apos;s crawl-delay. A ~15 model run typically takes 3–5 minutes.
          </p>
        </section>
      )}

      {(log.length > 0 || summary) && (
        <section
          style={{
            marginTop: 16,
            background: '#fff',
            border: '1px solid var(--adm-line)',
            borderRadius: 8,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--adm-ink-mute)', textTransform: 'uppercase', marginBottom: 8 }}>
            Progress
          </div>
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12,
              maxHeight: 320,
              overflowY: 'auto',
              background: '#fafafa',
              border: '1px solid var(--adm-line)',
              borderRadius: 6,
              padding: 12,
            }}
          >
            {log.map((line, i) => (
              <li key={i} style={{ color: line.tag === '!' ? '#a53a2c' : line.tag === 'i' ? 'var(--adm-ink-mute)' : 'inherit' }}>
                {line.tag} {line.text}
              </li>
            ))}
          </ul>
          {summary && (
            <div style={{ marginTop: 12, display: 'flex', gap: 24, alignItems: 'center' }}>
              <div style={{ fontSize: 13 }}>
                <strong>{summary.created}</strong> created · <strong>{summary.updated}</strong> updated ·{' '}
                <strong>{summary.skipped}</strong> skipped ·{' '}
                <span style={{ color: summary.errors > 0 ? '#a53a2c' : 'inherit' }}>
                  <strong>{summary.errors}</strong> errors
                </span>
              </div>
              <div style={{ flex: 1 }} />
              <Link
                href="/catalog"
                style={{
                  background: 'var(--adm-accent)',
                  color: '#fff',
                  padding: '8px 14px',
                  borderRadius: 6,
                  textDecoration: 'none',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                View catalog →
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
