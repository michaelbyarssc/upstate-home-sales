import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import type { Lead, LeadMessage } from '@uhs/db';
import { LeadDetailClient } from './detail-client';
import '../leads.css';

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [{ data: lead }, { data: messages }, { data: members }] = await Promise.all([
    supabase
      .from('leads')
      .select('*, homes(name, stock_no, listed_price_cents)')
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('lead_messages')
      .select('*')
      .eq('lead_id', params.id)
      .order('sent_at'),
    supabase
      .from('org_members')
      .select('user_id, role')
      .eq('status', 'active')
      .in('role', ['owner', 'manager', 'sales']),
  ]);

  if (!lead) notFound();

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <Link href="/leads" style={{ color: 'var(--adm-ink-mute)', textDecoration: 'none', fontSize: 13 }}>
          ← Back to inbox
        </Link>
      </div>
      <LeadDetailClient
        lead={lead as Lead & { homes?: { name: string; stock_no: string; listed_price_cents: number } | null }}
        initialMessages={(messages ?? []) as LeadMessage[]}
        members={(members ?? []) as Array<{ user_id: string; role: string }>}
      />
    </>
  );
}
