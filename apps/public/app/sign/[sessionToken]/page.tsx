import { createServiceClient } from '@uhs/db/service';
import type { DocSignerRole, SigningSessionRecipient } from '@uhs/db';
import { SignKiosk } from './sign-kiosk';
import './sign.css';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<DocSignerRole, string> = {
  buyer: 'Buyer',
  co_buyer: 'Co-buyer',
  seller: 'Seller',
  witness: 'Witness',
};

export default async function SignPage({ params }: { params: { sessionToken: string } }) {
  const svc = createServiceClient();

  const { data: session } = await svc
    .from('signing_sessions')
    .select(
      'id, status, signer_roles, current_role_idx, recipient_map_jsonb, expires_at, instance_id, org_id',
    )
    .eq('session_token', params.sessionToken)
    .maybeSingle();

  if (!session) {
    return <Shell title="Link not found" body="This signing link is invalid or has been removed." />;
  }
  if (session.expires_at && new Date(session.expires_at) < new Date()) {
    return <Shell title="Link expired" body="Ask your salesperson for a fresh signing link." />;
  }

  const [{ data: instance }, { data: org }] = await Promise.all([
    svc.from('document_instances').select('doc_number, status, template_id').eq('id', session.instance_id).maybeSingle(),
    svc.from('orgs').select('name, brand_color').eq('id', session.org_id).maybeSingle(),
  ]);
  const { data: template } = instance?.template_id
    ? await svc.from('document_templates').select('name').eq('id', instance.template_id).maybeSingle()
    : { data: null };

  const roles = (session.signer_roles ?? []) as DocSignerRole[];
  const idx = session.current_role_idx ?? 0;
  const allDone = session.status === 'completed' || idx >= roles.length;

  if (allDone) {
    return (
      <Shell
        title="Signing complete ✓"
        body="Thank you. Your salesperson will take it from here."
        brandColor={org?.brand_color ?? null}
      />
    );
  }

  const currentRole = roles[idx];
  if (!currentRole) {
    return (
      <Shell
        title="Signing complete ✓"
        body="Thank you. Your salesperson will take it from here."
        brandColor={org?.brand_color ?? null}
      />
    );
  }
  const recipientMap = (session.recipient_map_jsonb ?? {}) as Partial<
    Record<DocSignerRole, SigningSessionRecipient>
  >;
  const embeddedUrl = recipientMap[currentRole]?.embeddedUrl ?? null;

  if (!embeddedUrl) {
    return (
      <Shell
        title="Signing unavailable"
        body="This document isn’t ready to sign yet. Please ask your salesperson."
        brandColor={org?.brand_color ?? null}
      />
    );
  }

  return (
    <SignKiosk
      sessionToken={params.sessionToken}
      embeddedUrl={embeddedUrl}
      currentRoleLabel={ROLE_LABEL[currentRole]}
      stepNumber={idx + 1}
      totalSteps={roles.length}
      orgName={org?.name ?? 'Upstate Home Center'}
      brandColor={org?.brand_color ?? null}
      docTitle={template?.name ?? `Document #${instance?.doc_number ?? ''}`}
    />
  );
}

function Shell({
  title,
  body,
  brandColor,
}: {
  title: string;
  body: string;
  brandColor?: string | null;
}) {
  return (
    <main className="sign-shell">
      <div className="sign-card">
        <div className="sign-mark" style={brandColor ? { background: brandColor } : undefined}>
          U
        </div>
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
    </main>
  );
}
