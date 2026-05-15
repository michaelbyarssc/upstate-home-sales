'use client';

import { useState, useTransition } from 'react';
import type { Lot, OrgMember, Role } from '@uhs/db';
import { updateMember, updateUserProfile, sendPasswordReset, setUserPassword } from './actions';

const ROLES: Role[] = ['owner', 'manager', 'sales', 'service', 'readonly'];

export type MemberProfile = { email: string | null; name: string | null; phone: string | null };

type EditingUser = {
  userId: string;
  fullName: string;
  phone: string;
  email: string;
  newPassword: string;
};

export function UsersTable({
  members,
  lots,
  profiles,
}: {
  members: OrgMember[];
  lots: Pick<Lot, 'id' | 'name'>[];
  profiles: Record<string, MemberProfile>;
}) {
  const [rows, setRows] = useState(members);
  const [, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingUser | null>(null);
  const [editPending, setEditPending] = useState(false);
  const [resetPending, setResetPending] = useState<string | null>(null);

  function update(userId: string, patch: Partial<Pick<OrgMember, 'role' | 'status' | 'scoped_lots' | 'in_rotation'>>) {
    setRows((prev) => prev.map((m) => (m.user_id === userId ? { ...m, ...patch } : m)));
    startTransition(async () => {
      try {
        await updateMember(userId, patch);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Update failed');
      }
    });
  }

  function startEdit(userId: string) {
    const p = profiles[userId];
    setEditing({
      userId,
      fullName: p?.name ?? '',
      phone: p?.phone ?? '',
      email: p?.email ?? '',
      newPassword: '',
    });
    setErr(null);
    setInfo(null);
  }

  async function saveEdit() {
    if (!editing) return;
    setEditPending(true);
    setErr(null);
    try {
      await updateUserProfile(editing.userId, {
        fullName: editing.fullName,
        phone: editing.phone,
        email: editing.email,
      });
      if (editing.newPassword) {
        await setUserPassword(editing.userId, editing.newPassword);
      }
      // Update local profiles display
      profiles[editing.userId] = {
        name: editing.fullName || null,
        email: editing.email || null,
        phone: editing.phone || null,
      };
      setEditing(null);
      setInfo(editing.newPassword ? 'User updated and password changed.' : 'User updated.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Update failed');
    }
    setEditPending(false);
  }

  async function handleReset(userId: string) {
    setResetPending(userId);
    setErr(null);
    setInfo(null);
    try {
      await sendPasswordReset(userId);
      const p = profiles[userId];
      setInfo(`Password reset email sent to ${p?.email ?? 'user'}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Reset failed');
    }
    setResetPending(null);
  }

  return (
    <>
      {err && <div style={{ background: '#faf0ee', border: '1px solid #e0c0bc', color: '#a53a2c', padding: 10, borderRadius: 4, marginBottom: 12 }}>{err}</div>}
      {info && <div style={{ background: '#e6efe2', border: '1px solid #c0d8b8', color: '#4a6b3f', padding: 10, borderRadius: 4, marginBottom: 12 }}>{info}</div>}

      {/* Edit modal */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal-content" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit User</h3>
              <button type="button" className="modal-close" onClick={() => setEditing(null)}>×</button>
            </div>
            <div className="modal-body">
              <label className="field">
                <span className="field-label">Full Name</span>
                <input
                  type="text"
                  value={editing.fullName}
                  onChange={(e) => setEditing({ ...editing, fullName: e.target.value })}
                  placeholder="Full name"
                  autoFocus
                />
              </label>
              <label className="field">
                <span className="field-label">Phone</span>
                <input
                  type="tel"
                  value={editing.phone}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  placeholder="(864) 555-1234"
                />
              </label>
              <label className="field">
                <span className="field-label">Email</span>
                <input
                  type="email"
                  value={editing.email}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                  placeholder="user@example.com"
                />
              </label>
              <label className="field">
                <span className="field-label">New Password</span>
                <input
                  type="password"
                  value={editing.newPassword}
                  onChange={(e) => setEditing({ ...editing, newPassword: e.target.value })}
                  placeholder="Leave blank to keep current"
                  minLength={8}
                  autoComplete="new-password"
                />
                <span style={{ fontSize: 11, color: 'var(--adm-ink-mute)', marginTop: 2 }}>Min 8 characters. Leave blank to keep current password.</span>
              </label>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button
                type="button"
                className="btn-primary"
                disabled={editPending}
                onClick={saveEdit}
              >
                {editPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <table style={{
        width: '100%', background: '#fff', borderCollapse: 'collapse',
        border: '1px solid var(--adm-line)', borderRadius: 8, overflow: 'hidden', fontSize: 13,
      }}>
        <thead>
          <tr style={{ background: 'var(--c-bg)' }}>
            <th style={th}>User</th>
            <th style={th}>Role</th>
            <th style={th}>Lot scope</th>
            <th style={th} title="Round-robin lead assignment">Lead rotation</th>
            <th style={th}>Status</th>
            <th style={th}>Last active</th>
            <th style={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--adm-ink-mute)' }}>No members yet.</td></tr>
          )}
          {rows.map((m) => {
            const p = profiles[m.user_id];
            const primary = p?.name ?? p?.email ?? null;
            const secondary = p?.name && p?.email ? p.email : null;
            return (
            <tr key={m.user_id}>
              <td style={td}>
                {primary ? (
                  <div style={{ fontWeight: 500 }}>{primary}</div>
                ) : (
                  <code style={{ fontSize: 11 }}>{m.user_id.slice(0, 8)}…</code>
                )}
                {secondary && (
                  <div style={{ color: 'var(--adm-ink-mute)', fontSize: 11, marginTop: 2 }}>{secondary}</div>
                )}
                <div style={{ color: 'var(--adm-ink-mute)', fontSize: 11, marginTop: 2 }}>
                  Joined {new Date(m.created_at).toLocaleDateString()}
                </div>
              </td>
              <td style={td}>
                <select value={m.role} onChange={(e) => update(m.user_id, { role: e.target.value as Role })} style={sel}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </td>
              <td style={td}>
                <select
                  value={m.scoped_lots && m.scoped_lots.length === 1 ? m.scoped_lots[0] : ''}
                  onChange={(e) => update(m.user_id, { scoped_lots: e.target.value ? [e.target.value] : null })}
                  style={sel}
                >
                  <option value="">All lots</option>
                  {lots.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </td>
              <td style={td}>
                {(['owner', 'manager', 'sales'] as Role[]).includes(m.role) ? (
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={m.in_rotation}
                      onChange={(e) => update(m.user_id, { in_rotation: e.target.checked })}
                    />
                    <span style={{ fontSize: 12, color: m.in_rotation ? 'var(--adm-ink)' : 'var(--adm-ink-mute)' }}>
                      {m.in_rotation ? 'In rotation' : 'Skipped'}
                    </span>
                  </label>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--adm-ink-mute)' }}>n/a</span>
                )}
              </td>
              <td style={td}>
                <select value={m.status} onChange={(e) => update(m.user_id, { status: e.target.value as OrgMember['status'] })} style={sel}>
                  <option value="active">active</option>
                  <option value="suspended">suspended</option>
                  <option value="pending">pending</option>
                </select>
              </td>
              <td style={td}>{m.last_active_at ? new Date(m.last_active_at).toLocaleDateString() : '—'}</td>
              <td style={td}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => startEdit(m.user_id)}
                    style={actionBtn}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReset(m.user_id)}
                    disabled={resetPending === m.user_id}
                    style={{ ...actionBtn, opacity: resetPending === m.user_id ? 0.6 : 1 }}
                  >
                    {resetPending === m.user_id ? 'Sending…' : 'Reset PW'}
                  </button>
                </div>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 14px',
  font: "600 11px/1 var(--f-body)",
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--adm-ink-mute)',
  borderBottom: '1px solid var(--adm-line)',
};
const td: React.CSSProperties = { padding: '12px 14px', borderBottom: '1px solid #efeae0', verticalAlign: 'middle' };
const sel: React.CSSProperties = {
  padding: '6px 10px', fontSize: 13, border: '1px solid var(--adm-line)',
  borderRadius: 4, background: '#fff',
};
const actionBtn: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--adm-line)',
  padding: '4px 10px',
  borderRadius: 4,
  fontSize: 12,
  cursor: 'pointer',
  color: 'var(--adm-ink)',
};
