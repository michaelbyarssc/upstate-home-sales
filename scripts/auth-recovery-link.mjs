/**
 * Generate a Supabase password-recovery link for an email and print it.
 * Usage:  cd apps/admin && node --env-file=../../.env.local ../../scripts/auth-recovery-link.mjs <email>
 */
import { createClient } from '@supabase/supabase-js';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node auth-recovery-link.mjs <email>');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminBase = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3001';

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await sb.auth.admin.generateLink({
  type: 'recovery',
  email,
  options: { redirectTo: `${adminBase}/login` },
});

if (error) {
  console.error('generateLink failed:', error.message);
  process.exit(1);
}

const link = data?.properties?.action_link;
if (!link) {
  console.error('No action_link returned. Full data:', JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log('\nPassword-recovery link (open in browser to set a password):\n');
console.log(link);
console.log('\nThis link is single-use. Set a password, then log in normally.\n');
