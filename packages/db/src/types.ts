// Hand-rolled, narrowly-typed surface for the schema we need at the app layer.
// Replaced by `pnpm --filter @uhs/db gen:types` once the schema settles —
// that command writes types.generated.ts. Until then, this is the contract.

export type Role = 'owner' | 'manager' | 'sales' | 'service' | 'readonly';

export interface Org {
  id: string;
  slug: string;
  name: string;
  brand_color: string | null;
  logo_url: string | null;
  default_markup_pct: number;
  sms_consent_text: string;
  status: 'active' | 'suspended' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  user_id: string;
  org_id: string;
  role: Role;
  scoped_lots: string[] | null;
  status: 'active' | 'suspended' | 'pending';
  invited_by: string | null;
  invited_at: string | null;
  last_active_at: string | null;
  created_at: string;
}

export interface Lot {
  id: string;
  org_id: string;
  name: string;
  address: string | null;
  manager_id: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformAdmin {
  user_id: string;
  granted_by: string | null;
  granted_at: string;
  notes: string | null;
}

export interface OrgMembershipWithOrg extends OrgMember {
  orgs: Pick<Org, 'id' | 'slug' | 'name' | 'brand_color' | 'logo_url'>;
}
