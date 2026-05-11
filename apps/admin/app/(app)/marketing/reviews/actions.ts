'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@uhs/db/server';

/**
 * PR 2.1 — Reply to a GMB review. Persists the reply locally so the cron at
 * /api/cron/gmb-sync (Phase 3.1) can push it to Google Business Profile on
 * its next pass. Until the GMB OAuth flow lands, this just updates the local
 * record so the dealer can draft + retract replies without touching Google.
 */
export async function replyToReview(args: {
  reviewId: string;
  replyText: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = args.replyText.trim();
  if (!text) return { ok: false, error: 'Reply cannot be empty.' };
  if (text.length > 4000) return { ok: false, error: 'Reply must be under 4,000 characters.' };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('gmb_reviews')
    .update({
      reply_text: text,
      replied_at: new Date().toISOString(),
      replied_by: user?.id ?? null,
    })
    .eq('id', args.reviewId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/marketing/reviews');
  return { ok: true };
}

export async function clearReply(args: {
  reviewId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('gmb_reviews')
    .update({ reply_text: null, replied_at: null, replied_by: null })
    .eq('id', args.reviewId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/marketing/reviews');
  return { ok: true };
}
