import { NextResponse } from 'next/server';
import { storeBackIfCompleted } from '../../../../lib/documents/store-back';

/**
 * SignWell event callback. Set this URL as the Workspace "Event Callback URL"
 * in SignWell → Settings → API.
 *
 * Security model: we do NOT trust the payload. The webhook only tells us WHICH
 * document changed; storeBackIfCompleted then re-fetches the authoritative status
 * + signed PDF from SignWell with our API key. The reconciliation cron is the
 * backstop if a delivery is ever missed. Always returns 200 so the provider
 * doesn't hammer retries on transient errors.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function pick(obj: unknown, ...path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur && typeof cur === 'object' && k in cur) cur = (cur as Record<string, unknown>)[k];
    else return undefined;
  }
  return cur;
}

function extractDocId(payload: unknown): string | null {
  const candidates = [
    pick(payload, 'data', 'object', 'id'),
    pick(payload, 'data', 'id'),
    pick(payload, 'event', 'related_document_id'),
    pick(payload, 'object', 'id'),
    pick(payload, 'id'),
  ];
  const found = candidates.find((c) => typeof c === 'string' && c.length > 0);
  return typeof found === 'string' ? found : null;
}

export async function POST(req: Request) {
  let raw = '';
  try {
    raw = await req.text();
  } catch {
    /* ignore */
  }
  let payload: unknown = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    /* not JSON */
  }

  const eventType = (pick(payload, 'event', 'type') ?? pick(payload, 'type') ?? 'unknown') as string;
  const docId = extractDocId(payload);

  if (!docId) {
    console.warn('[esign-webhook] no document id in payload; event=', eventType);
    return NextResponse.json({ ok: true, note: 'no document id' });
  }

  try {
    const res = await storeBackIfCompleted(docId);
    return NextResponse.json({ ok: true, event: eventType, ...res });
  } catch (e) {
    console.error('[esign-webhook] store-back error:', e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' });
  }
}

// Some providers ping the URL with GET to validate it.
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'esign-webhook' });
}
