'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@uhs/db/browser';
import type { LeadStage } from '@uhs/db';

type Row = {
  id: string;
  contact_name: string;
  email: string | null;
  phone: string | null;
  stage: LeadStage;
  source: string;
  is_hot: boolean;
  assignee_id: string | null;
  home_id: string | null;
  created_at: string;
  homes?: { name: string; stock_no: string } | null;
};

type Props = { initialRows: Row[]; stage: string };

const STAGE_BADGE: Record<LeadStage, string> = {
  new: 'bd-info',
  in_progress: 'bd-warn',
  quoted: 'bd-soft',
  won: 'bd-success',
  lost: 'bd-soft',
};

export function LeadsRealtime({ initialRows, stage }: Props) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [pulse, setPulse] = useState(0); // re-render trigger for the "X new" toast

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('leads-inbox')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads' },
        (payload) => {
          const row = payload.new as unknown as Row;
          setRows((prev) => {
            if (prev.find((r) => r.id === row.id)) return prev;
            return [row, ...prev];
          });
          setPulse((p) => p + 1);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leads' },
        (payload) => {
          const updated = payload.new as unknown as Row;
          setRows((prev) =>
            prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Filter client-side by the current tab so realtime adds respect the view.
  const visible = rows.filter((r) => {
    if (stage === 'open') return r.stage === 'new' || r.stage === 'in_progress' || r.stage === 'quoted';
    return r.stage === stage;
  });

  if (visible.length === 0) {
    return (
      <div className="leads-empty">
        <p>No leads in this view.</p>
        {pulse > 0 && <p style={{ marginTop: 8 }}>{pulse} new since you arrived — switch tabs to see them.</p>}
      </div>
    );
  }

  return (
    <div className="leads-rows">
      {visible.map((r) => {
        const ago = relTime(new Date(r.created_at));
        return (
          <Link key={r.id} href={`/leads/${r.id}`} className="lead-row">
            <div className="top">
              <div className="name">
                {r.is_hot && <span style={{ color: '#a53a2c', marginRight: 4 }}>🔥</span>}
                {r.contact_name}
              </div>
              <span className="when">{ago}</span>
            </div>
            <div className="home">
              {r.homes?.name
                ? `${r.homes.name} · ${r.homes.stock_no}`
                : 'General inquiry'}
            </div>
            <div className="meta">
              <span className={`bd ${STAGE_BADGE[r.stage] ?? 'bd-soft'}`}>{r.stage.replace('_', ' ')}</span>
              <span className="bd bd-soft">{r.source.replace('_', ' ')}</span>
              {!r.assignee_id && <span className="bd bd-warn">unassigned</span>}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function relTime(d: Date) {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d`;
  return d.toLocaleDateString();
}
