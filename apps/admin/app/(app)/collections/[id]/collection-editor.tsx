'use client';

import { useMemo, useState, useTransition } from 'react';
import type { HomeCollection } from '@uhs/db';
import { deleteCollection, setCollectionMembers, updateCollection } from '../actions';

type Home = {
  id: string;
  name: string;
  stock_no: string;
  status: string;
  listed_price_cents: number;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
};

type Props = {
  collection: HomeCollection;
  initialMemberIds: string[];
  homes: Home[];
};

export function CollectionEditor({ collection, initialMemberIds, homes }: Props) {
  const [draft, setDraft] = useState(collection);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set(initialMemberIds));
  const [search, setSearch] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [savingMembers, setSavingMembers] = useState(false);
  const [, start] = useTransition();

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return homes;
    return homes.filter(
      (h) => h.name.toLowerCase().includes(q) || h.stock_no.toLowerCase().includes(q),
    );
  }, [homes, search]);

  const memberCount = memberIds.size;

  function saveMeta() {
    setErr(null);
    start(async () => {
      try {
        await updateCollection(collection.id, {
          name: draft.name,
          slug: draft.slug,
          description: draft.description,
          sort_order: draft.sort_order,
          is_published: draft.is_published,
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Save failed');
      }
    });
  }

  function toggleHome(id: string) {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveMembers() {
    setSavingMembers(true);
    setErr(null);
    try {
      await setCollectionMembers(collection.id, Array.from(memberIds));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingMembers(false);
    }
  }

  async function onDelete() {
    if (!confirm(`Delete the collection "${collection.name}"? Homes are not deleted.`)) return;
    try {
      await deleteCollection(collection.id);
      window.location.href = '/collections';
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {err && <div style={{ background: '#fee', color: '#a00', padding: 10, borderRadius: 6, fontSize: 13 }}>{err}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))}
            onBlur={saveMeta}
            style={{
              font: '700 22px/1.2 var(--f-display, var(--f-body))',
              border: 'none', background: 'transparent', padding: 0, color: 'var(--adm-ink)',
              width: 'min(420px, 100%)',
            }}
          />
          <span style={{
            padding: '3px 9px', borderRadius: 10, fontSize: 10,
            fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.04,
            background: draft.is_published ? '#dcfce7' : '#f3f4f6',
            color: draft.is_published ? '#166534' : '#6b7280',
          }}>
            {draft.is_published ? 'Published' : 'Draft'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              const next = !draft.is_published;
              setDraft((c) => ({ ...c, is_published: next }));
              start(() => updateCollection(collection.id, { is_published: next }).catch((e) => setErr(e.message)));
            }}
            style={{
              background: draft.is_published ? '#fff' : 'var(--adm-accent)',
              color: draft.is_published ? 'var(--adm-ink)' : '#fff',
              border: '1px solid ' + (draft.is_published ? 'var(--adm-line)' : 'var(--adm-accent)'),
              padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >
            {draft.is_published ? 'Unpublish' : 'Publish'}
          </button>
          <button
            type="button"
            onClick={onDelete}
            style={{
              background: '#fff', color: '#b3261e', border: '1px solid var(--adm-line)',
              padding: '8px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      </div>

      {/* Settings */}
      <div style={{ background: '#fff', border: '1px solid var(--adm-line)', borderRadius: 8, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label className="label">URL slug</label>
          <input
            className="input"
            value={draft.slug}
            onChange={(e) => setDraft((c) => ({ ...c, slug: e.target.value }))}
            onBlur={saveMeta}
            maxLength={60}
          />
          <div style={{ fontSize: 12, color: 'var(--adm-ink-mute)', marginTop: 4 }}>
            Public URL: <code>/inventory/collection/{draft.slug || '...'}</code>
          </div>
        </div>
        <div className="field">
          <label className="label">Description</label>
          <textarea
            className="textarea"
            rows={2}
            value={draft.description ?? ''}
            onChange={(e) => setDraft((c) => ({ ...c, description: e.target.value || null }))}
            onBlur={saveMeta}
          />
        </div>
      </div>

      {/* Homes picker */}
      <div style={{ background: '#fff', border: '1px solid var(--adm-line)', borderRadius: 8, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>Homes in this collection</h3>
            <div style={{ fontSize: 12, color: 'var(--adm-ink-mute)', marginTop: 2 }}>
              {memberCount} selected · only published homes appear on the public site.
            </div>
          </div>
          <input
            type="search"
            placeholder="Search by name or stock #"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: '7px 12px', fontSize: 13, border: '1px solid var(--adm-line)', borderRadius: 6,
              minWidth: 220,
            }}
          />
        </div>

        <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid var(--adm-line)', borderRadius: 6 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--adm-ink-mute)', fontSize: 13 }}>
              No homes match &ldquo;{search}&rdquo;.
            </div>
          ) : (
            filtered.map((h) => {
              const checked = memberIds.has(h.id);
              return (
                <label
                  key={h.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderBottom: '1px solid var(--adm-line)',
                    cursor: 'pointer', fontSize: 13,
                    background: checked ? 'rgba(185,83,42,0.04)' : 'transparent',
                  }}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleHome(h.id)} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{h.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--adm-ink-mute)' }}>
                      {h.stock_no} · {h.status} · {h.beds ?? '—'}b/{h.baths ?? '—'}ba · {h.sqft?.toLocaleString() ?? '—'} sqft
                    </div>
                  </div>
                  <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    ${Math.round(h.listed_price_cents / 100).toLocaleString()}
                  </div>
                </label>
              );
            })
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button
            type="button"
            onClick={saveMembers}
            disabled={savingMembers}
            style={{
              background: 'var(--adm-accent)', color: '#fff',
              border: 'none', padding: '9px 16px', borderRadius: 6,
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
              opacity: savingMembers ? 0.7 : 1,
            }}
          >
            {savingMembers ? 'Saving…' : `Save selection (${memberCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}
