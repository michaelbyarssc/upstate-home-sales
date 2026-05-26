import { cookies } from 'next/headers';
import { createClient } from '@uhs/db/server';
import { ACTIVE_ORG_COOKIE } from '@uhs/db';
import { findAdapter, runImport, type ProgressEvent } from '../../../../../lib/catalog-importer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 300s matches the existing /api/cron/gmb-sync route — the highest the
// project's plan currently allows. Big imports may exceed this; if so,
// the dealer can split by series/region (paste a more specific URL).
export const maxDuration = 300;

type Body = { url?: string; only?: string[]; update?: boolean };

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(JSON.stringify({ error: 'bad_request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const url = String(body.url ?? '').trim();
  if (!url) {
    return new Response(JSON.stringify({ error: 'bad_request', detail: 'missing url' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    new URL(url);
  } catch {
    return new Response(JSON.stringify({ error: 'bad_request', detail: 'not a URL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const adapter = findAdapter(url);
  if (!adapter) {
    return new Response(JSON.stringify({ error: 'no_adapter', url }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  if (!orgId) {
    return new Response(JSON.stringify({ error: 'no_active_org' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Resolve org name + manufacturer through the user's session (RLS-respecting).
  const [{ data: org }, { data: mfr }] = await Promise.all([
    supabase.from('orgs').select('id, name').eq('id', orgId).maybeSingle(),
    supabase.from('manufacturers').select('id, name').eq('slug', adapter.manufacturerSlug).maybeSingle(),
  ]);
  if (!org) {
    return new Response(JSON.stringify({ error: 'org_not_visible' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!mfr) {
    return new Response(JSON.stringify({ error: 'manufacturer_missing', slug: adapter.manufacturerSlug }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: ProgressEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));
      };
      try {
        await runImport({
          sb: supabase,
          adapter,
          url,
          org: { id: org.id as string, name: org.name as string },
          manufacturer: { id: mfr.id as string, name: mfr.name as string },
          update: body.update === true,
          only: body.only?.length ? body.only : undefined,
          onProgress: emit,
        });
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'fatal', detail }) + '\n'));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-store, no-transform',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
