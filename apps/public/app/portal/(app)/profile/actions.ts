'use server';

import { createClient } from '@uhs/db/server';
import { createServiceClient } from '@uhs/db/service';
import { revalidatePath } from 'next/cache';

/**
 * Flips `sms_consent` on every lead the current buyer is linked to via
 * `buyer_lead_links` (status='active'). Records audit timestamp + method
 * for TCPA paper trail. Called when the buyer toggles "Text me too" in
 * /portal/profile.
 *
 * Uses the service client to bypass the leads RLS (buyers can't directly
 * update leads — only org members can).
 */
export async function setPortalSmsConsent(
  consent: boolean,
): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { data: links } = await sb
    .from('buyer_lead_links')
    .select('lead_id, org_id')
    .eq('buyer_id', user.id)
    .eq('status', 'active');

  if (!links || links.length === 0) {
    return { ok: true, updated: 0 };
  }

  const svc = createServiceClient();
  const now = new Date().toISOString();
  const update = consent
    ? {
        sms_consent: true,
        sms_consent_at: now,
        sms_consent_method: 'portal' as const,
      }
    : {
        sms_consent: false,
      };

  let updated = 0;
  for (const link of links) {
    const { error } = await svc.from('leads').update(update).eq('id', link.lead_id);
    if (error) continue;
    updated += 1;

    await svc.from('lead_messages').insert({
      lead_id: link.lead_id,
      org_id: link.org_id,
      kind: 'system',
      channel: null,
      body: consent
        ? 'Buyer enabled SMS consent via portal profile'
        : 'Buyer revoked SMS consent via portal profile',
    });
  }

  revalidatePath('/portal/profile');
  return { ok: true, updated };
}
