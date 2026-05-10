'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient } from '@uhs/db/server';
import {
  ACTIVE_ORG_COOKIE,
  type ParcelGeoJson,
  type PropertyPlacement,
} from '@uhs/db';
import { lookupParcel } from '../../../../../lib/parcels';

/** Search Regrid (cached) for a parcel by address. Returns the lookup result
 *  for the client to render — does NOT create a placement row yet. */
export async function searchParcel(query: string) {
  const trimmed = query.trim();
  if (!trimmed) throw new Error('Search query is required');
  const result = await lookupParcel({ query: trimmed });
  if (!result) {
    throw new Error('No parcel found for that address. Try a more specific street address.');
  }
  return result;
}

export type SavePlacementArgs = {
  homeId: string;
  /** If editing an existing placement; null = create a new one. */
  placementId: string | null;
  searchQuery: string;
  parcelId: string | null;
  parcelGeojson: ParcelGeoJson;
  parcelLat: number;
  parcelLng: number;
  address: string | null;
  county: string | null;
  /** Footprint dimensions; usually copied from homes.{width_ft, length_ft}. */
  footprintWFt: number;
  footprintLFt: number;
  /** Anchor = home center. */
  anchorLat: number;
  anchorLng: number;
  orientationDeg: number;
  label: string | null;
  notes: string | null;
};

/** Create or update a placement row. Returns the saved row + share URL. */
export async function savePlacement(args: SavePlacementArgs): Promise<{ placement: PropertyPlacement; shareUrl: string }> {
  const supabase = createClient();
  const orgId = cookies().get(ACTIVE_ORG_COOKIE)?.value;
  if (!orgId) throw new Error('No active org selected');

  if (args.footprintWFt <= 0 || args.footprintLFt <= 0) {
    throw new Error('Footprint width and length must be positive');
  }

  const payload = {
    org_id: orgId,
    home_id: args.homeId,
    search_query: args.searchQuery,
    parcel_id: args.parcelId,
    parcel_geojson: args.parcelGeojson,
    parcel_lat: args.parcelLat,
    parcel_lng: args.parcelLng,
    footprint_w_ft: Math.round(args.footprintWFt),
    footprint_l_ft: Math.round(args.footprintLFt),
    anchor_lat: args.anchorLat,
    anchor_lng: args.anchorLng,
    orientation_deg: ((Math.round(args.orientationDeg) % 360) + 360) % 360,
    address: args.address,
    county: args.county,
    label: args.label,
    notes: args.notes,
  };

  let saved: PropertyPlacement;
  if (args.placementId) {
    const { data, error } = await supabase
      .from('property_placements')
      .update(payload)
      .eq('id', args.placementId)
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'Update failed');
    saved = data as PropertyPlacement;
  } else {
    const { data, error } = await supabase
      .from('property_placements')
      .insert(payload)
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'Insert failed');
    saved = data as PropertyPlacement;
  }

  revalidatePath(`/inventory/${args.homeId}/place`);
  revalidatePath(`/inventory/${args.homeId}`);

  const publicBase = process.env.NEXT_PUBLIC_PUBLIC_URL ?? 'https://upstatehomecenter.com';
  return {
    placement: saved,
    shareUrl: `${publicBase}/place/${saved.share_token}`,
  };
}

export async function deletePlacement(placementId: string, homeId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from('property_placements')
    .delete()
    .eq('id', placementId);
  if (error) throw new Error(error.message);
  revalidatePath(`/inventory/${homeId}/place`);
  revalidatePath(`/inventory/${homeId}`);
}

/** Regenerate share_token (invalidates the old share URL). */
export async function regenerateShareToken(placementId: string, homeId: string): Promise<string> {
  const supabase = createClient();
  // Generate a new token client-side then update; matches the migration's default style.
  const newToken = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, '');
  const { error } = await supabase
    .from('property_placements')
    .update({ share_token: newToken })
    .eq('id', placementId);
  if (error) throw new Error(error.message);
  revalidatePath(`/inventory/${homeId}/place`);
  return newToken;
}
