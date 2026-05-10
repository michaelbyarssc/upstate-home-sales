import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE, type Org } from '@uhs/db';
import { AiSettingsForm } from './ai-settings-form';

export const dynamic = 'force-dynamic';

export default async function AiSettingsPage() {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value ?? null;
  if (!orgId) return <div className="placeholder"><strong>No active org.</strong> <Link href="/select-org">Pick one</Link>.</div>;
  const { data: org } = await supabase.from('orgs').select('*').eq('id', orgId).maybeSingle();
  if (!org) return <div className="placeholder">Org not found.</div>;
  return (
    <>
      <div className="page-header">
        <Link href="/settings" style={{ fontSize: 12, color: 'var(--adm-ink-mute)', textDecoration: 'none' }}>
          ← Settings
        </Link>
        <h1 style={{ marginTop: 6 }}>AI</h1>
        <p style={{ color: 'var(--adm-ink-mute)', fontSize: 13, marginTop: 4 }}>
          Toggle the public chatbot, set a daily token cap (cost guardrail), edit the FAQ that informs the bot.
        </p>
      </div>
      <AiSettingsForm initial={org as Org} />
    </>
  );
}
