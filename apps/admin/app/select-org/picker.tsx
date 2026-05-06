'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OrgMembershipWithOrg } from '@uhs/db';

export function OrgPickerList({
  memberships,
  next,
}: {
  memberships: OrgMembershipWithOrg[];
  next: string;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(orgId: string) {
    setPendingId(orgId);
    setError(null);
    const res = await fetch('/api/active-org', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orgId }),
    });
    if (!res.ok) {
      setError(await res.text());
      setPendingId(null);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="org-list">
      {memberships.map((m) => (
        <button
          key={m.org_id}
          className="org-row"
          onClick={() => pick(m.org_id)}
          disabled={pendingId !== null}
        >
          <div
            className="org-avatar"
            style={{ background: m.orgs.brand_color ?? 'var(--adm-accent)' }}
          >
            {m.orgs.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="org-meta">
            <div className="org-name">{m.orgs.name}</div>
            <div className="org-role">{m.role}</div>
          </div>
          <span className="org-go" aria-hidden>
            {pendingId === m.org_id ? '…' : '→'}
          </span>
        </button>
      ))}
      {error ? <div className="auth-error">{error}</div> : null}
    </div>
  );
}
