'use server';

import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@uhs/db/service';
import type { DocSignerRole } from '@uhs/db';

/**
 * Advance the in-person signing session to the next signer (or complete it).
 * Anon-callable from the kiosk; gated only by the unguessable session token.
 * Real document completion (the sealed PDF) is confirmed by the SignWell webhook
 * in Phase 4 — this only drives which signer's pad the kiosk shows next.
 */
export async function advanceSigner(args: { sessionToken: string }): Promise<{ ok: boolean }> {
  const svc = createServiceClient();
  const { data: s } = await svc
    .from('signing_sessions')
    .select('id, signer_roles, current_role_idx, status')
    .eq('session_token', args.sessionToken)
    .maybeSingle();
  if (!s) return { ok: false };

  const roles = (s.signer_roles ?? []) as DocSignerRole[];
  const nextIdx = (s.current_role_idx ?? 0) + 1;
  const now = new Date().toISOString();

  if (nextIdx >= roles.length) {
    await svc
      .from('signing_sessions')
      .update({ status: 'completed', current_role_idx: nextIdx, completed_at: now })
      .eq('id', s.id);
  } else {
    await svc
      .from('signing_sessions')
      .update({ status: 'in_progress', current_role_idx: nextIdx, started_at: s.status === 'pending' ? now : undefined })
      .eq('id', s.id);
  }

  revalidatePath(`/sign/${args.sessionToken}`);
  return { ok: true };
}
