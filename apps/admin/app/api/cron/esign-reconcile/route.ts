import { NextResponse } from 'next/server';
import { createServiceClient } from '@uhs/db/service';
import { storeBackIfCompleted } from '../../../../lib/documents/store-back';

/**
 * Reconciliation cron — the store-back guarantee. Finds document instances still
 * out for signature and re-checks them with the provider, storing back any that
 * have completed. Catches anything a missed/late webhook didn't.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`; we also accept
 * `?secret=`. Refuses if CRON_SECRET is unset.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get('secret') === secret;
}

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const svc = createServiceClient();
  // Give the webhook first crack: only reconcile instances older than a minute.
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const { data: pending } = await svc
    .from('document_instances')
    .select('provider_envelope_id')
    .in('status', ['sent', 'partially_signed'])
    .not('provider_envelope_id', 'is', null)
    .lt('created_at', cutoff)
    .limit(50);

  const rows = (pending ?? []) as Array<{ provider_envelope_id: string }>;
  let stored = 0;
  const results: Array<{ envelope: string; stored: boolean; reason?: string }> = [];
  for (const row of rows) {
    try {
      const r = await storeBackIfCompleted(row.provider_envelope_id);
      if (r.stored) stored++;
      results.push({ envelope: row.provider_envelope_id, ...r });
    } catch (e) {
      results.push({
        envelope: row.provider_envelope_id,
        stored: false,
        reason: e instanceof Error ? e.message : 'error',
      });
    }
  }

  return NextResponse.json({ ok: true, checked: rows.length, stored, results });
}
