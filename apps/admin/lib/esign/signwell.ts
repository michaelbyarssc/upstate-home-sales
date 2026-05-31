/**
 * SignWell implementation of EsignProvider (REST via fetch — no SDK needed).
 *
 * Auth: `X-Api-Key: <SIGNWELL_API_KEY>` (the key is the base64 of "access:<token>",
 * used verbatim — confirmed against the live API).
 * Base: https://www.signwell.com/api/v1
 *
 * A few response/field details are marked TODO(verify) — they're confirmed via a
 * real round-trip once the dealer finishes their template in SignWell. The shapes
 * below match SignWell's documented API and the create-from-template error contract
 * we already exercised.
 */

import crypto from 'node:crypto';
import type {
  EsignProvider,
  EsignCreateArgs,
  EsignCreateResult,
  EsignEnvelopeStatus,
  EsignWebhookEvent,
} from './types';
import type { DocSignerRole } from '@uhs/db';

const BASE = 'https://www.signwell.com/api/v1';

type Json = Record<string, unknown>;

export class SignWellProvider implements EsignProvider {
  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error('SignWellProvider: missing SIGNWELL_API_KEY');
  }

  private async req(path: string, init?: RequestInit & { raw?: boolean }): Promise<Response> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'X-Api-Key': this.apiKey,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`SignWell ${init?.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 500)}`);
    }
    return res;
  }

  private async json(path: string, init?: RequestInit): Promise<Json> {
    return (await this.req(path, init)).json() as Promise<Json>;
  }

  async createEnvelopeFromTemplate(a: EsignCreateArgs): Promise<EsignCreateResult> {
    // Assign a stable vendor recipient id per role so we can map the response back.
    const recipients = a.recipients.map((r, i) => ({
      id: String(i + 1),
      role: r.role,
      placeholder_name: r.placeholderName,
      name: r.name,
      email: r.email ?? `noreply+${r.role}@upstatehomecenter.com`,
    }));

    const body: Json = {
      test_mode: a.testMode ?? false,
      draft: false,
      embedded_signing: a.inPerson,
      template_ids: [a.providerTemplateId],
      name: a.name ?? undefined,
      recipients: recipients.map(({ id, placeholder_name, name, email }) => ({
        id,
        placeholder_name,
        name,
        email,
      })),
      // Prefilled auto-fill fields. TODO(verify): SignWell uses `fields` for
      // create-from-template prefill keyed by api_id; confirm vs `template_fields`.
      fields: Object.entries(a.prefill).map(([api_id, value]) => ({ api_id, value })),
      ...(a.redirectUrl ? { embedded_signing_redirect_url: a.redirectUrl } : {}),
    };

    const doc = await this.json('/document_templates/documents/', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const envelopeId = String(doc.id);
    const respRecipients = (doc.recipients as Json[] | undefined) ?? [];

    return {
      envelopeId,
      recipients: recipients.map((r) => {
        const match = respRecipients.find((x) => String(x.id) === r.id);
        return {
          role: r.role,
          recipientId: r.id,
          // TODO(verify): exact field name for the embedded URL (embedded_signing_url).
          embeddedUrl: (match?.embedded_signing_url as string | undefined) ?? null,
        };
      }),
    };
  }

  async getEmbeddedSigningUrl(envelopeId: string, recipientId: string): Promise<string> {
    const doc = await this.json(`/documents/${envelopeId}/`);
    const recipients = (doc.recipients as Json[] | undefined) ?? [];
    const match = recipients.find((x) => String(x.id) === String(recipientId));
    const url = match?.embedded_signing_url as string | undefined;
    if (!url) throw new Error(`SignWell: no embedded signing URL for recipient ${recipientId}`);
    return url;
  }

  async downloadSignedPdf(envelopeId: string): Promise<Uint8Array> {
    // SignWell appends the audit trail as the final page of the completed PDF.
    const res = await this.req(`/documents/${envelopeId}/completed_pdf/?audit_page=true`, {
      headers: { Accept: 'application/pdf' },
    });
    return new Uint8Array(await res.arrayBuffer());
  }

  async downloadAuditTrail(): Promise<Uint8Array | null> {
    // SignWell embeds the audit trail in the completed PDF (see downloadSignedPdf),
    // so there's no separate file to fetch.
    return null;
  }

  async voidEnvelope(envelopeId: string): Promise<void> {
    // SignWell has no "void"; deleting the document removes it. Best-effort.
    await this.req(`/documents/${envelopeId}/`, { method: 'DELETE' }).catch(() => undefined);
  }

  async getStatus(envelopeId: string): Promise<EsignEnvelopeStatus> {
    const doc = await this.json(`/documents/${envelopeId}/`);
    return mapStatus(String(doc.status ?? ''));
  }

  verifyAndParseWebhook(rawBody: string, headers: Headers): EsignWebhookEvent | null {
    // SignWell signs webhooks with an HMAC-SHA256 hash computed over the payload
    // using the account API key as the secret. TODO(verify): confirm the exact
    // signed-content + header name against a real delivery before going live.
    const provided = headers.get('x-signwell-signature') ?? headers.get('signwell-signature') ?? '';
    let payload: Json;
    try {
      payload = JSON.parse(rawBody) as Json;
    } catch {
      return null;
    }
    if (provided) {
      const expected = crypto.createHmac('sha256', this.apiKey).update(rawBody).digest('hex');
      if (!timingSafeEqual(provided, expected)) {
        // Some SignWell setups put the hash in the body instead of a header.
        const bodyHash = (payload.hash as string | undefined) ?? '';
        if (!bodyHash || !timingSafeEqual(bodyHash, expected)) return null;
      }
    }
    const event = (payload.event as Json | undefined) ?? payload;
    const rawType = String(event.type ?? '');
    const related = (event.related_signer as Json | undefined) ?? null;
    return {
      type: normalizeEventType(rawType),
      envelopeId: String(event.related_document_id ?? (payload.data as Json | undefined)?.id ?? payload.id ?? ''),
      signer: related
        ? { name: related.name as string | undefined, email: related.email as string | undefined }
        : null,
      rawType,
    };
  }
}

function mapStatus(s: string): EsignEnvelopeStatus {
  switch (s.toLowerCase()) {
    case 'draft':
      return 'draft';
    case 'sent':
    case 'pending':
      return 'sent';
    case 'partially_completed':
    case 'partially completed':
      return 'partially_signed';
    case 'completed':
      return 'completed';
    case 'declined':
      return 'declined';
    case 'expired':
    case 'canceled':
    case 'cancelled':
    case 'deleted':
      return 'voided';
    default:
      return 'unknown';
  }
}

function normalizeEventType(t: string): EsignWebhookEvent['type'] {
  const x = t.toLowerCase();
  if (x.includes('completed')) return 'completed';
  if (x.includes('signed')) return 'signed';
  if (x.includes('viewed') || x.includes('opened')) return 'viewed';
  if (x.includes('declined')) return 'declined';
  if (x.includes('canceled') || x.includes('cancelled') || x.includes('deleted')) return 'voided';
  return 'other';
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Re-export for callers that want the concrete type.
export type { DocSignerRole };
