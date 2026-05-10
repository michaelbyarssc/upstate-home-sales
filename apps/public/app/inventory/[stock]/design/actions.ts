'use server';

import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@uhs/db/service';
import type { HomeDesign } from '@uhs/db';

/**
 * Phase C — save a design from the public Design Studio.
 *
 * Anon-friendly (we use service role to bypass RLS for the insert), but
 * gated by the home_id existing + the price snapshot matching what we
 * compute server-side (to prevent client-side price tampering).
 */

export async function saveDesign(args: {
  homeId: string;
  baseListedPriceCents: number;
  totalPriceCents: number;
  selections: Array<{
    option_id: string;
    value_id: string;
    snapshot_price_delta_cents: number;
  }>;
}): Promise<{ design: HomeDesign; shareUrl: string }> {
  const sb = createServiceClient();

  // Resolve org_id + verify the home exists (and snapshot price).
  const { data: home, error: homeErr } = await sb
    .from('homes')
    .select('id, org_id, listed_price_cents')
    .eq('id', args.homeId)
    .maybeSingle();
  if (homeErr || !home) throw new Error('Home not found');

  // Recompute total server-side from the actual option_value rows to
  // prevent the client from sending a fake total.
  const valueIds = args.selections.map((s) => s.value_id);
  let trustedTotal = (home.listed_price_cents ?? 0);
  if (valueIds.length > 0) {
    const { data: values } = await sb
      .from('model_option_values')
      .select('id, price_delta_cents')
      .in('id', valueIds);
    const byId = new Map(((values ?? []) as { id: string; price_delta_cents: number }[]).map((v) => [v.id, v.price_delta_cents]));
    for (const sel of args.selections) {
      trustedTotal += byId.get(sel.value_id) ?? 0;
    }
  }

  // Insert the design row.
  const { data: design, error: dErr } = await sb
    .from('home_designs')
    .insert({
      org_id: home.org_id,
      home_id: home.id,
      base_price_cents: home.listed_price_cents ?? 0,
      total_price_cents: trustedTotal,
    })
    .select('*')
    .single();
  if (dErr || !design) throw new Error(dErr?.message ?? 'Insert failed');

  // Insert selections.
  if (args.selections.length > 0) {
    const rows = args.selections.map((s) => ({
      design_id: design.id,
      org_id: home.org_id,
      option_id: s.option_id,
      value_id: s.value_id,
      snapshot_price_delta_cents: s.snapshot_price_delta_cents,
    }));
    const { error: sErr } = await sb.from('home_design_selections').insert(rows);
    if (sErr) throw new Error(sErr.message);
  }

  const publicBase = process.env.NEXT_PUBLIC_PUBLIC_URL ?? 'https://upstatehomecenter.com';
  const shareUrl = `${publicBase}/d/${design.share_token}`;

  revalidatePath('/portal/designs');
  return { design: design as HomeDesign, shareUrl };
}
