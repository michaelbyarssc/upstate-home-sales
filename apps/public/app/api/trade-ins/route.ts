import { NextResponse } from 'next/server';
import { createServiceClient } from '@uhs/db/service';

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const contact_name = String(body.contact_name ?? '').trim();
  const email = String(body.email ?? '').trim();
  if (!contact_name || !email) {
    return NextResponse.json({ message: 'Name and email are required' }, { status: 400 });
  }

  const sb = createServiceClient();
  const { data: org } = await sb
    .from('orgs')
    .select('id')
    .eq('status', 'active')
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (!org) return NextResponse.json({ message: 'No active org' }, { status: 500 });

  const consent = body.sms_consent === true;
  const consentText = consent
    ? 'I agree to receive text messages about my trade-in. Reply STOP to opt out.'
    : null;

  const { data, error } = await sb
    .from('trade_ins')
    .insert({
      org_id: org.id,
      contact_name,
      email,
      phone: String(body.phone ?? '').trim() || null,
      year: numOrNull(body.year),
      make: strOrNull(body.make),
      model: strOrNull(body.model),
      size_w: numOrNull(body.size_w),
      size_l: numOrNull(body.size_l),
      condition_notes: strOrNull(body.condition_notes),
      sms_consent: consent,
      sms_consent_at: consent ? new Date().toISOString() : null,
      sms_consent_text: consentText,
      status: 'submitted',
    })
    .select('id')
    .single();
  if (error || !data) return NextResponse.json({ message: error?.message ?? 'Insert failed' }, { status: 500 });

  return NextResponse.json({ ok: true, trade_in_id: data.id });
}

function strOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s === '' ? null : s;
}
function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
