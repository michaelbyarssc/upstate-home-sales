import { headers } from 'next/headers';
import Link from 'next/link';
import { createServiceClient } from '@uhs/db/service';

export const metadata = { title: 'Confirm SMS updates · Upstate Home Center' };
export const dynamic = 'force-dynamic';

type Params = { token: string };

export default async function SmsOptInPage({ params }: { params: Promise<Params> }) {
  const { token } = await params;
  const svc = createServiceClient();

  const { data: lead } = await svc
    .from('leads')
    .select('id, contact_name, org_id, sms_consent, orgs(name)')
    .eq('sms_opt_in_token', token)
    .maybeSingle();

  if (!lead) {
    return (
      <Wrap>
        <h1 style={{ font: '600 22px/1.2 var(--f-body)', marginBottom: 8 }}>Link not recognized</h1>
        <p style={{ color: 'var(--c-ink-soft)' }}>
          This confirmation link is invalid or already expired. If you still want to receive text
          updates, ask your salesperson to resend the link.
        </p>
        <BackHome />
      </Wrap>
    );
  }

  const orgRel = (lead as unknown as { orgs: { name: string } | { name: string }[] | null }).orgs;
  const orgName =
    (Array.isArray(orgRel) ? orgRel[0]?.name : orgRel?.name) ?? 'Upstate Home Center';
  const firstName = (lead.contact_name ?? '').split(' ')[0] || 'there';

  // If already consented, just confirm — don't re-stamp.
  if (lead.sms_consent) {
    return (
      <Wrap>
        <h1 style={{ font: '600 22px/1.2 var(--f-body)', marginBottom: 8 }}>You&rsquo;re all set</h1>
        <p style={{ color: 'var(--c-ink-soft)' }}>
          Thanks {firstName} — you&rsquo;re already opted in to text updates from {orgName}. Reply
          STOP to any message to opt out at any time.
        </p>
        <BackHome />
      </Wrap>
    );
  }

  // Stamp consent
  const hdrs = headers();
  const ip =
    hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    hdrs.get('x-real-ip') ??
    null;
  const now = new Date().toISOString();

  await svc
    .from('leads')
    .update({
      sms_consent: true,
      sms_consent_at: now,
      sms_consent_ip: ip,
      sms_consent_method: 'email_link',
    })
    .eq('id', lead.id);

  await svc.from('lead_messages').insert({
    lead_id: lead.id,
    org_id: lead.org_id,
    kind: 'system',
    channel: null,
    body: `SMS consent confirmed via email link${ip ? ` (IP: ${ip})` : ''}`,
  });

  return (
    <Wrap>
      <h1 style={{ font: '600 22px/1.2 var(--f-body)', marginBottom: 8 }}>You&rsquo;re opted in</h1>
      <p style={{ color: 'var(--c-ink-soft)' }}>
        Thanks {firstName} — we&rsquo;ll send you the occasional text about your home purchase
        (delivery timing, milestones, document requests). Reply STOP to any message to opt out at
        any time. Message and data rates may apply.
      </p>
      <BackHome />
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(20px, 6vw, 60px)',
        background: 'var(--c-bg)',
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: '100%',
          background: '#fff',
          border: '1px solid var(--c-line)',
          borderRadius: 'var(--r-3)',
          padding: 'clamp(24px, 5vw, 40px)',
        }}
      >
        {children}
      </div>
    </main>
  );
}

function BackHome() {
  return (
    <p style={{ marginTop: 20 }}>
      <Link href="/" style={{ color: 'var(--c-accent)' }}>
        ← Back to upstatehomecenter.com
      </Link>
    </p>
  );
}
