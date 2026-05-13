'use client';

import { useState } from 'react';
import { NewLeadModal } from './new-lead-modal';

type HomeOption = { id: string; name: string; stock_no: string };

export function NewLeadButton({ orgId, homes }: { orgId: string; homes: HomeOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: 'var(--adm-accent)', color: '#fff',
          border: 'none', padding: '8px 16px', borderRadius: 6,
          fontWeight: 500, fontSize: 13, cursor: 'pointer',
        }}
      >
        + New Lead
      </button>
      {open && <NewLeadModal orgId={orgId} homes={homes} onClose={() => setOpen(false)} />}
    </>
  );
}
