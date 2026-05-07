/**
 * Directly set a Supabase user's password via the admin API. Bypasses the
 * email/recovery flow entirely. Useful for the initial password on accounts
 * created by magic-link invite when the recovery flow can't establish a
 * session in the browser (e.g. redirect URL not allow-listed yet).
 *
 * Usage (run from inside apps/admin so @supabase/supabase-js resolves):
 *   cd apps/admin
 *   cp ../../scripts/auth-set-password.mjs ./_setpw.mjs
 *   node --env-file=../../.env.local ./_setpw.mjs <email>
 *   rm _setpw.mjs
 *
 * The script prompts for the password on stdin (hidden) so it's not stored
 * in shell history. Password is sent directly to Supabase over HTTPS.
 */
import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';

function promptPassword(label) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    // Mute echo so the password isn't visible.
    const origWrite = stdout.write.bind(stdout);
    let muted = false;
    stdout.write = (chunk, encoding, cb) => {
      if (muted && typeof chunk === 'string' && chunk !== label) return true;
      return origWrite(chunk, encoding, cb);
    };
    rl.question(label, (answer) => {
      stdout.write = origWrite;
      origWrite('\n');
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node auth-set-password.mjs <email>');
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Find user id by paginating through admin.listUsers (no direct lookup-by-email
  // in older SDKs). Match case-insensitively.
  let userId = null;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error('listUsers failed:', error.message);
      process.exit(1);
    }
    const found = data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) { userId = found.id; break; }
    if (!data?.users?.length || data.users.length < 200) break;
  }
  if (!userId) {
    console.error(`No user found for email: ${email}`);
    process.exit(1);
  }

  const pw = await promptPassword('New password (min 8 chars, hidden): ');
  if (!pw || pw.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }
  const pw2 = await promptPassword('Confirm password: ');
  if (pw !== pw2) {
    console.error('Passwords do not match.');
    process.exit(1);
  }

  const { error: updErr } = await sb.auth.admin.updateUserById(userId, {
    password: pw,
    email_confirm: true,
  });
  if (updErr) {
    console.error('Password update failed:', updErr.message);
    process.exit(1);
  }

  console.log(`\n✓ Password set for ${email}. You can now sign in normally.`);
}

main();
