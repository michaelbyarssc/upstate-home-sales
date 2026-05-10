'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE, type IntegrationKind, type OrgIntegration } from '@uhs/db';

/** Save the plain (non-secret) config for an integration. Used for GA4
 *  measurement IDs, Meta Pixel IDs, GTM container IDs — nothing secret. */
export async function saveIntegrationConfig(args: {
  kind: IntegrationKind;
  config: Record<string, unknown>;
}): Promise<OrgIntegration> {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  if (!orgId) throw new Error('No active org');

  const { data, error } = await supabase
    .from('org_integrations')
    .upsert(
      {
        org_id: orgId,
        kind: args.kind,
        config: args.config,
        status: 'connected',
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,kind' },
    )
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Save failed');
  revalidatePath('/marketing/integrations');
  return data as OrgIntegration;
}

export async function disconnectIntegration(kind: IntegrationKind): Promise<void> {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  if (!orgId) throw new Error('No active org');
  const { error } = await supabase
    .from('org_integrations')
    .update({ status: 'disconnected', credentials_enc: null })
    .eq('org_id', orgId)
    .eq('kind', kind);
  if (error) throw new Error(error.message);
  revalidatePath('/marketing/integrations');
}
