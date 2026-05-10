'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE } from '@uhs/db';

export async function saveAiSettings(args: {
  ai_chat_enabled: boolean;
  ai_daily_token_cap: number;
  faq_markdown: string | null;
}): Promise<void> {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  if (!orgId) throw new Error('No active org');
  const cap = Math.max(0, Math.round(args.ai_daily_token_cap));
  const { error } = await supabase
    .from('orgs')
    .update({
      ai_chat_enabled: args.ai_chat_enabled,
      ai_daily_token_cap: cap,
      faq_markdown: args.faq_markdown?.trim() || null,
    })
    .eq('id', orgId);
  if (error) throw new Error(error.message);
  revalidatePath('/settings');
  revalidatePath('/settings/ai');
}
