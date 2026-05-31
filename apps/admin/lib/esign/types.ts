/**
 * Provider-agnostic e-signature interface.
 *
 * The rest of the app talks to this interface only — never to SignWell (or any
 * vendor) directly — so the vendor stays swappable (SignWell ⇄ BoldSign ⇄ …)
 * behind a single factory (./index.ts). The hard, legally-sensitive signing
 * ceremony lives at the vendor; we own templates, data mapping, and storage,
 * and we always pull the completed signed PDF + audit trail back into our own
 * Supabase so we remain the system of record.
 */

import type { DocSignerRole } from '@uhs/db';

/** Our normalized envelope/document status (mapped from each vendor's status). */
export type EsignEnvelopeStatus =
  | 'draft'
  | 'sent'
  | 'partially_signed'
  | 'completed'
  | 'declined'
  | 'voided'
  | 'unknown';

/** Normalized webhook event after the adapter verifies + parses the vendor payload. */
export type EsignWebhookEvent = {
  /** Normalized event name. */
  type: 'completed' | 'signed' | 'viewed' | 'declined' | 'voided' | 'other';
  /** The vendor's envelope/document id. */
  envelopeId: string;
  /** Which signer acted, when known (for per-signer 'signed' events). */
  signer?: { role?: DocSignerRole; name?: string; email?: string } | null;
  /** Raw vendor event type string, for logging/diagnostics. */
  rawType: string;
};

export type EsignSignerDetail = {
  placeholderName: string | null;
  name: string;
  email: string | null;
  signedAt: string | null;
  completed: boolean;
};

export type EsignEnvelopeDetails = {
  status: EsignEnvelopeStatus;
  /** Signed flattened PDF URL (includes SignWell's audit page); null until complete. */
  completedPdfUrl: string | null;
  signers: EsignSignerDetail[];
};

export type EsignRecipientInput = {
  role: DocSignerRole;
  /** The vendor template placeholder this recipient fills (e.g. SignWell "Customer #1"). */
  placeholderName: string;
  name: string;
  email?: string | null;
};

export type EsignCreateArgs = {
  providerTemplateId: string;
  recipients: EsignRecipientInput[];
  /** Map of vendor field api_id → string value to prefill (already formatted for display). */
  prefill: Record<string, string>;
  /** true = embedded (in-person tablet) signing; false = vendor emails the signer. */
  inPerson: boolean;
  /** Keep everything in the vendor's test mode (no real signatures / charges). */
  testMode?: boolean;
  /** Where the embedded signer is redirected after finishing (our /sign kiosk return). */
  redirectUrl?: string | null;
  /** Optional human label for the document in the vendor dashboard. */
  name?: string | null;
};

export type EsignCreatedRecipient = {
  role: DocSignerRole;
  /** The vendor's recipient id (used to fetch a fresh embedded signing URL). */
  recipientId: string;
  /** Present immediately for embedded signing; null for emailed recipients. */
  embeddedUrl?: string | null;
};

export type EsignCreateResult = {
  /** The vendor's envelope/document id — stored on document_instances.provider_envelope_id. */
  envelopeId: string;
  recipients: EsignCreatedRecipient[];
};

/** A vendor template as shown in the registry "Register template" picker. */
export type EsignTemplateSummary = {
  id: string;
  name: string;
  /** Vendor status, e.g. SignWell "Draft" | "Available". */
  status: string;
};

/** One field/placeholder defined on a vendor template (for the field-mapping UI). */
export type EsignTemplateField = {
  /** The vendor field api_id (what we prefill / map). */
  apiId: string;
  /** Field type, e.g. 'signature' | 'text' | 'date' | 'checkbox'. */
  type: string;
  /** Which signer placeholder owns this field, if any (e.g. SignWell "Customer #1"). */
  placeholderName: string | null;
  page: number;
};

export interface EsignProvider {
  /** List the vendor's templates (for the registry "Register template" picker). */
  listTemplates(): Promise<EsignTemplateSummary[]>;

  /** Fetch a template's fields + placeholders (for the field-mapping UI). */
  getTemplateFields(templateId: string): Promise<{
    status: string;
    placeholders: string[];
    fields: EsignTemplateField[];
  }>;

  /** Create + send a document from a vendor template, prefilling our mapped fields. */
  createEnvelopeFromTemplate(a: EsignCreateArgs): Promise<EsignCreateResult>;

  /** Fetch a fresh embedded signing URL for one recipient (URLs can expire). */
  getEmbeddedSigningUrl(envelopeId: string, recipientId: string, redirectUrl: string): Promise<string>;

  /** Download the completed, sealed PDF (SignWell appends the audit trail as its final page). */
  downloadSignedPdf(envelopeId: string): Promise<Uint8Array>;

  /** Optional: download a separate audit-trail PDF, when the vendor exposes one. */
  downloadAuditTrail?(envelopeId: string): Promise<Uint8Array | null>;

  /** Void/cancel an envelope (best-effort; not all vendors support it). */
  voidEnvelope(envelopeId: string, reason: string): Promise<void>;

  /** Poll an envelope's normalized status (used by the reconciliation cron). */
  getStatus(envelopeId: string): Promise<EsignEnvelopeStatus>;

  /** Full envelope detail for store-back: status, completed-PDF URL, per-signer info. */
  getEnvelopeDetails(envelopeId: string): Promise<EsignEnvelopeDetails>;

  /** Verify a webhook's signature and return a normalized event, or null if invalid. */
  verifyAndParseWebhook(rawBody: string, headers: Headers): EsignWebhookEvent | null;
}
