'use client';

import { useState, useTransition } from 'react';
import type { Lot, Role } from '@uhs/db';
import { inviteUser, createUser } from './actions';

const ROLES: Role[] = ['owner', 'manager', 'sales', 'service', 'readonly'];

export function InviteForm({
  orgId,
  lots,
}: {
  orgId: string | null;
  lots: Pick<Lot, 'id' | 'name'>[];
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [mode, setMode] = useState<'invite' | 'create'>('create');

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgId) return;
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    const form = e.currentTarget;

    startTransition(async () => {
      try {
        if (mode === 'create') {
          await createUser({
            orgId,
            email: String(fd.get('email') ?? '').trim(),
            password: String(fd.get('password') ?? ''),
            fullName: String(fd.get('fullName') ?? '').trim(),
            role: (fd.get('role') as Role) ?? 'sales',
            scopedLot: String(fd.get('scopedLot') ?? '') || null,
          });
          form.reset();
          setMsg({ kind: 'success', text: 'User created. They can sign in immediately.' });
        } else {
          const result = await inviteUser({
            orgId,
            email: String(fd.get('email') ?? '').trim(),
            role: (fd.get('role') as Role) ?? 'sales',
            scopedLot: String(fd.get('scopedLot') ?? '') || null,
          });
          form.reset();
          setMsg({
            kind: 'success',
            text: result.invited_existing
              ? 'User added to this org. They can sign in immediately.'
              : 'Invite sent. The user will receive an email magic link.',
          });
        }
      } catch (e) {
        setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Failed' });
      }
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => { setMode('create'); setMsg(null); }}
          style={{
            background: mode === 'create' ? 'var(--adm-accent)' : '#fff',
            color: mode === 'create' ? '#fff' : 'var(--adm-ink)',
            border: '1px solid var(--adm-line)',
            padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          Create user
        </button>
        <button
          type="button"
          onClick={() => { setMode('invite'); setMsg(null); }}
          style={{
            background: mode === 'invite' ? 'var(--adm-accent)' : '#fff',
            color: mode === 'invite' ? '#fff' : 'var(--adm-ink)',
            border: '1px solid var(--adm-line)',
            padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          Send invite
        </button>
      </div>

      <form onSubmit={onSubmit} style={{
        background: '#fff', border: '1px solid var(--adm-line)', borderRadius: 8, padding: 18,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {mode === 'create' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="label">Full Name *</label>
              <input className="input" name="fullName" type="text" required placeholder="Jane Doe" />
            </div>
            <div>
              <label className="label">Password *</label>
              <input className="input" name="password" type="password" required minLength={8} placeholder="Min 8 characters" />
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: mode === 'create' ? '1fr 1fr 1fr' : '2fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
          <div>
            <label className="label">Email *</label>
            <input className="input" name="email" type="email" required placeholder="user@example.com" />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="select" name="role" defaultValue="sales">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Scope to lot</label>
            <select className="select" name="scopedLot" defaultValue="">
              <option value="">All lots</option>
              {lots.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <button type="submit" disabled={pending} style={{
            background: 'var(--adm-accent)', color: '#fff', border: 'none',
            padding: '9px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            opacity: pending ? 0.7 : 1,
          }}>
            {pending
              ? (mode === 'create' ? 'Creating…' : 'Inviting…')
              : (mode === 'create' ? 'Create user' : 'Send invite')}
          </button>
        </div>

        {msg && (
          <div style={{
            padding: 10, borderRadius: 4, fontSize: 13,
            background: msg.kind === 'success' ? '#e6efe2' : '#faf0ee',
            color: msg.kind === 'success' ? '#4a6b3f' : '#a53a2c',
          }}>{msg.text}</div>
        )}
      </form>
    </div>
  );
}
