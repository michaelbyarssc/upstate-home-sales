'use client';

import { useState, useTransition } from 'react';
import type { Lot, Role } from '@uhs/db';
import { inviteUser } from './actions';

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

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgId) return;
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    const form = e.currentTarget;
    startTransition(async () => {
      try {
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
      } catch (e) {
        setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Invite failed' });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} style={{
      background: '#fff', border: '1px solid var(--adm-line)', borderRadius: 8, padding: 18,
      display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 12, alignItems: 'end',
    }}>
      <div>
        <label className="label">Email</label>
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
      <button type="submit" disabled={pending} style={{
        background: 'var(--adm-accent)', color: '#fff', border: 'none',
        padding: '9px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
        opacity: pending ? 0.7 : 1,
      }}>
        {pending ? 'Inviting…' : 'Send invite'}
      </button>
      {msg && (
        <div style={{
          gridColumn: '1 / -1',
          padding: 10, borderRadius: 4, fontSize: 13,
          background: msg.kind === 'success' ? '#e6efe2' : '#faf0ee',
          color: msg.kind === 'success' ? '#4a6b3f' : '#a53a2c',
        }}>{msg.text}</div>
      )}
    </form>
  );
}
