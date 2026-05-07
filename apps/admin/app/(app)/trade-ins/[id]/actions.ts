'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@uhs/db/server';
import type { TradeIn } from '@uhs/db';

export async function updateTradeIn(
  id: string,
  fields: { status?: TradeIn['status']; offer_cents?: number | null },
) {
  const supabase = createClient();
  const update: Record<string, unknown> = {};
  if (fields.status) update.status = fields.status;
  if ('offer_cents' in fields) update.offer_cents = fields.offer_cents;
  if (fields.status === 'reviewed' || fields.status === 'offered') {
    update.reviewed_at = new Date().toISOString();
  }

  const { error } = await supabase.from('trade_ins').update(update).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/trade-ins');
  revalidatePath(`/trade-ins/${id}`);
}
