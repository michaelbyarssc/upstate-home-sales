'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@uhs/db/browser';

type Toast = {
  id: string;
  href: string;
  title: string;
  body: string;
};

/**
 * Global realtime listener for the admin shell. Subscribes to:
 *   - INSERT on leads        → "New lead: <name>"
 *   - INSERT on lead_messages where kind='inbound' → "Reply on <lead>"
 * Toasts auto-dismiss after 8s. Updates the document title with an unread
 * count when the tab is hidden.
 */
export function RealtimeToasts({ orgId }: { orgId: string }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const unreadRef = useRef(0);
  const titleRef = useRef<string>('');
  const pathname = usePathname();

  useEffect(() => {
    if (typeof document !== 'undefined' && !titleRef.current) {
      titleRef.current = document.title;
    }
  }, []);

  function bump() {
    unreadRef.current += 1;
    if (typeof document !== 'undefined' && document.hidden && titleRef.current) {
      document.title = `(${unreadRef.current}) ${titleRef.current}`;
    }
  }

  useEffect(() => {
    const onVis = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        unreadRef.current = 0;
        if (titleRef.current) document.title = titleRef.current;
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`shell-${orgId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = payload.new as { id: string; contact_name: string; source: string };
          // Skip toast if you're already on the leads pages — the inbox
          // already renders this row in realtime.
          if (pathname?.startsWith('/leads')) return;
          push({
            id: `lead-${row.id}`,
            href: `/leads/${row.id}`,
            title: `New ${row.source.replace('_', ' ')} lead`,
            body: row.contact_name,
          });
          bump();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lead_messages', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const m = payload.new as {
            id: string; lead_id: string; kind: string; channel: string | null; body: string;
          };
          if (m.kind !== 'inbound') return;
          if (pathname === `/leads/${m.lead_id}`) return; // already viewing
          push({
            id: `msg-${m.id}`,
            href: `/leads/${m.lead_id}`,
            title: `Inbound ${m.channel ?? 'reply'}`,
            body: m.body.slice(0, 120),
          });
          bump();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, pathname]);

  function push(t: Toast) {
    setToasts((prev) => {
      // de-dupe by id
      if (prev.find((x) => x.id === t.id)) return prev;
      return [...prev, t].slice(-5);
    });
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== t.id));
    }, 8000);
  }

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }

  if (toasts.length === 0) return null;

  return (
    <div className="rt-toasts" role="region" aria-live="polite" aria-label="Notifications">
      {toasts.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          className="rt-toast"
          onClick={() => dismiss(t.id)}
        >
          <div className="rt-toast-title">{t.title}</div>
          <div className="rt-toast-body">{t.body}</div>
          <button
            type="button"
            className="rt-toast-x"
            aria-label="Dismiss"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dismiss(t.id);
            }}
          >
            ×
          </button>
        </Link>
      ))}
    </div>
  );
}
