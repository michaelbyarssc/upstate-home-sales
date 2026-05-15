'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import type { CollabRole } from '@uhs/db';
import { addCollaborator, searchUsersForSharing } from './actions';

type UserResult = { id: string; email: string; name: string | null };
type MemberInfo = { user_id: string; role: string; name?: string | null; email?: string | null };

type Props = {
  leadId: string;
  members: MemberInfo[];
  existingCollaboratorUserIds: Set<string>;
  assigneeId: string | null;
  onClose: () => void;
  onAdded: () => void;
};

const COLLAB_ROLES: { value: CollabRole; label: string }[] = [
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'split', label: 'Split' },
];

export function ShareLeadModal({ leadId, members, existingCollaboratorUserIds, assigneeId, onClose, onAdded }: Props) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const [role, setRole] = useState<CollabRole>('editor');
  const [splitPct, setSplitPct] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter same-org members that aren't already collaborators or the assignee
  const availableMembers = members.filter(
    (m) => !existingCollaboratorUserIds.has(m.user_id) && m.user_id !== assigneeId,
  );

  useEffect(() => {
    if (search.length < 3) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await searchUsersForSharing(search);
        // Filter out users already on the deal
        setResults(r.filter((u) => !existingCollaboratorUserIds.has(u.id) && u.id !== assigneeId));
      } catch {
        setResults([]);
      }
      setSearching(false);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, existingCollaboratorUserIds, assigneeId]);

  function selectUser(user: UserResult) {
    setSelectedUser(user);
    setSearch('');
    setResults([]);
    setErr(null);
  }

  function handleSubmit() {
    if (!selectedUser) {
      setErr('Select a user to share with');
      return;
    }
    if (role === 'split') {
      const pct = parseFloat(splitPct);
      if (isNaN(pct) || pct <= 0 || pct > 100) {
        setErr('Enter a valid split percentage (1-100)');
        return;
      }
    }
    setErr(null);

    startTransition(async () => {
      try {
        await addCollaborator({
          leadId,
          userId: selectedUser.id,
          role,
          splitPct: role === 'split' ? parseFloat(splitPct) : null,
          note: note.trim() || null,
        });
        onAdded();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to add collaborator');
      }
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Share Deal</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {selectedUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#f6efe6', borderRadius: 6, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{selectedUser.name || selectedUser.email}</div>
                {selectedUser.name && <div style={{ fontSize: 11, color: 'var(--adm-ink-mute)' }}>{selectedUser.email}</div>}
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--adm-ink-mute)', fontSize: 14 }}
              >
                ×
              </button>
            </div>
          ) : (
            <>
              {/* Same-org quick picks */}
              {availableMembers.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <span className="field-label" style={{ display: 'block', marginBottom: 6 }}>Team members</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {availableMembers.map((m) => (
                      <button
                        key={m.user_id}
                        type="button"
                        onClick={() => selectUser({ id: m.user_id, email: m.email ?? '', name: m.name ?? null })}
                        style={{
                          padding: '6px 12px', fontSize: 12, borderRadius: 16,
                          border: '1px solid var(--adm-line)', background: '#fff',
                          cursor: 'pointer', color: 'var(--adm-ink)',
                        }}
                      >
                        {m.name || m.email || m.user_id.slice(0, 8)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Cross-org search */}
              <label className="field">
                <span className="field-label">Search by email</span>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Type at least 3 characters..."
                  autoFocus
                />
              </label>
              {searching && <div style={{ fontSize: 12, color: 'var(--adm-ink-mute)', marginBottom: 8 }}>Searching...</div>}
              {results.length > 0 && (
                <div style={{ border: '1px solid var(--adm-line)', borderRadius: 6, maxHeight: 160, overflowY: 'auto', marginBottom: 12 }}>
                  {results.map((u) => (
                    <div
                      key={u.id}
                      onClick={() => selectUser(u)}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f0ebe3' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f2ee')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ fontWeight: 500 }}>{u.name || u.email}</div>
                      {u.name && <div style={{ fontSize: 11, color: 'var(--adm-ink-mute)' }}>{u.email}</div>}
                    </div>
                  ))}
                </div>
              )}
              {search.length >= 3 && !searching && results.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--adm-ink-mute)', marginBottom: 8 }}>No users found</div>
              )}
            </>
          )}

          {/* Role + split */}
          <div style={{ display: 'grid', gridTemplateColumns: role === 'split' ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 12 }}>
            <label className="field">
              <span className="field-label">Access level</span>
              <select value={role} onChange={(e) => setRole(e.target.value as CollabRole)}>
                {COLLAB_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </label>
            {role === 'split' && (
              <label className="field">
                <span className="field-label">Split %</span>
                <input
                  type="number"
                  value={splitPct}
                  onChange={(e) => setSplitPct(e.target.value)}
                  placeholder="e.g. 40"
                  min="1"
                  max="100"
                  step="0.01"
                />
              </label>
            )}
          </div>

          <label className="field">
            <span className="field-label">Note (optional)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Helping with financing"
            />
          </label>

          {err && <div style={{ color: '#a53a2c', fontSize: 13, marginTop: 4 }}>{err}</div>}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={!selectedUser || isPending}
            onClick={handleSubmit}
          >
            {isPending ? 'Sharing...' : 'Share'}
          </button>
        </div>
      </div>
    </div>
  );
}
