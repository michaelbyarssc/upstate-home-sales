'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import type { Home, OrgSetbackRules, ParcelGeoJson, PropertyPlacement } from '@uhs/db';
import {
  searchParcel,
  savePlacement,
  deletePlacement,
  regenerateShareToken,
} from './actions';

type Props = {
  home: Home;
  existing: PropertyPlacement | null;
  setbacks: OrgSetbackRules;
  googleMapsApiKey: string | null;
  publicBaseUrl: string;
};

type FootprintState = {
  centerLat: number;
  centerLng: number;
  /** in degrees, 0 = home long-axis points north */
  orientationDeg: number;
  widthFt: number;
  lengthFt: number;
};

/** Local-projection helpers: convert feet → degrees of lat/lng at a given latitude.
 *  Good enough for a 30-200 ft footprint where the local curvature error is < 1ft. */
const FT_PER_DEG_LAT = 364_000; // ~3637 km / deg → 364k ft / deg

function ftPerDegLng(lat: number): number {
  // 1° lng in feet = cos(lat) × FT_PER_DEG_LAT.
  return Math.cos((lat * Math.PI) / 180) * FT_PER_DEG_LAT;
}

/** Build a 4-corner footprint polygon from a center, rotation, and size. */
function footprintCorners(f: FootprintState): google.maps.LatLngLiteral[] {
  const halfW = f.widthFt / 2;
  const halfL = f.lengthFt / 2;
  // Corner offsets in feet, before rotation. The "length" axis is the home's
  // long axis (points north when orientation=0); width is the short axis.
  const cornersFt: Array<[number, number]> = [
    [-halfW, +halfL],
    [+halfW, +halfL],
    [+halfW, -halfL],
    [-halfW, -halfL],
  ];
  const sin = Math.sin((f.orientationDeg * Math.PI) / 180);
  const cos = Math.cos((f.orientationDeg * Math.PI) / 180);
  const ftPerLng = ftPerDegLng(f.centerLat);
  return cornersFt.map(([dx, dy]) => {
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    return {
      lat: f.centerLat + ry / FT_PER_DEG_LAT,
      lng: f.centerLng + rx / ftPerLng,
    };
  });
}

/** Build a setback "no-build" zone by inset-buffering the parcel polygon
 *  inward by the larger of the front/side/rear distances. We use the max
 *  of the three for v1 (proper directional setbacks need parcel orientation,
 *  which Regrid doesn't always give us) — that's the conservative choice. */
function setbackPolygon(
  parcel: ParcelGeoJson,
  setbackFt: number,
  centroidLat: number,
): google.maps.LatLngLiteral[][] {
  if (setbackFt <= 0) return [];
  const ftPerLng = ftPerDegLng(centroidLat);
  const insetLat = setbackFt / FT_PER_DEG_LAT;
  const insetLng = setbackFt / ftPerLng;

  const rings: number[][][] =
    parcel.type === 'Polygon'
      ? (parcel.coordinates as number[][][])
      : (parcel.coordinates as number[][][][])[0] ?? [];

  // Naive shrink: pull each vertex toward the centroid by the inset distance.
  // Works visually for compact rectangular parcels (most SC residential lots).
  const out: google.maps.LatLngLiteral[][] = [];
  for (const ring of rings) {
    if (ring.length < 4) continue;
    let cx = 0;
    let cy = 0;
    for (const pt of ring) {
      cx += pt[0] ?? 0;
      cy += pt[1] ?? 0;
    }
    cx /= ring.length;
    cy /= ring.length;
    const shrunk: google.maps.LatLngLiteral[] = ring.map((pt) => {
      const lng = pt[0] ?? 0;
      const lat = pt[1] ?? 0;
      const dx = lng - cx;
      const dy = lat - cy;
      // Vector length in degrees, but normalize using lat/lng-respective scales.
      const dLngFt = dx * ftPerLng;
      const dLatFt = dy * FT_PER_DEG_LAT;
      const len = Math.hypot(dLngFt, dLatFt);
      if (len === 0) return { lat, lng };
      const inset = Math.min(setbackFt, len - 1); // never collapse past the centroid
      const factor = (len - inset) / len;
      return {
        lat: cy + dy * factor,
        lng: cx + dx * factor,
      };
    });
    out.push(shrunk);
  }
  return out;
}

function geojsonToLatLngs(g: ParcelGeoJson): google.maps.LatLngLiteral[][] {
  const rings: number[][][] =
    g.type === 'Polygon'
      ? (g.coordinates as number[][][])
      : (g.coordinates as number[][][][])[0] ?? [];
  return rings.map((ring) =>
    ring.map((pt) => ({ lat: pt[1] ?? 0, lng: pt[0] ?? 0 })),
  );
}

export function PlacementEditor({ home, existing, setbacks, googleMapsApiKey, publicBaseUrl }: Props) {
  const [searchInput, setSearchInput] = useState('');
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Parcel + footprint state.
  const [parcel, setParcel] = useState<{
    parcelId: string | null;
    geojson: ParcelGeoJson;
    centerLat: number;
    centerLng: number;
    address: string | null;
    county: string | null;
    isMock: boolean;
    searchQuery: string;
  } | null>(
    existing
      ? {
          parcelId: existing.parcel_id,
          geojson: existing.parcel_geojson,
          centerLat: existing.parcel_lat,
          centerLng: existing.parcel_lng,
          address: existing.address,
          county: existing.county,
          isMock: false,
          searchQuery: existing.search_query,
        }
      : null,
  );

  const [footprint, setFootprint] = useState<FootprintState>(() => ({
    centerLat: existing?.anchor_lat ?? 33.9815,
    centerLng: existing?.anchor_lng ?? -81.2362,
    orientationDeg: existing?.orientation_deg ?? 0,
    widthFt: existing?.footprint_w_ft ?? home.width_ft ?? 28,
    lengthFt: existing?.footprint_l_ft ?? home.length_ft ?? 56,
  }));

  const [shareToken, setShareToken] = useState<string | null>(existing?.share_token ?? null);

  // Map refs.
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const parcelPolyRef = useRef<google.maps.Polygon | null>(null);
  const setbackPolyRef = useRef<google.maps.Polygon | null>(null);
  const footprintPolyRef = useRef<google.maps.Polygon | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // ─── Map initialization ────────────────────────────────────────────────
  useEffect(() => {
    if (!googleMapsApiKey || !mapDivRef.current) return;
    let cancelled = false;
    const loader = new Loader({ apiKey: googleMapsApiKey, version: 'weekly' });
    loader.load().then(() => {
      if (cancelled || !mapDivRef.current) return;
      const initialCenter = parcel
        ? { lat: parcel.centerLat, lng: parcel.centerLng }
        : { lat: 33.9815, lng: -81.2362 }; // Lexington, SC
      mapRef.current = new google.maps.Map(mapDivRef.current, {
        center: initialCenter,
        zoom: parcel ? 19 : 13,
        mapTypeId: google.maps.MapTypeId.HYBRID,
        tilt: 0,
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: true,
        fullscreenControl: true,
        streetViewControl: false,
      });
      setMapReady(true);
    }).catch((err) => {
      console.error('Google Maps load failed', err);
      setMsg({ kind: 'error', text: 'Google Maps failed to load. Check your API key.' });
    });
    return () => { cancelled = true; };
  }, [googleMapsApiKey, parcel]);

  // ─── Parcel polygon ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !parcel) return;
    parcelPolyRef.current?.setMap(null);
    const rings = geojsonToLatLngs(parcel.geojson);
    parcelPolyRef.current = new google.maps.Polygon({
      paths: rings,
      strokeColor: '#B9532A',
      strokeOpacity: 0.9,
      strokeWeight: 2,
      fillColor: '#B9532A',
      fillOpacity: 0.06,
      clickable: false,
      map: mapRef.current,
    });

    // Fit map to parcel.
    const b = new google.maps.LatLngBounds();
    rings.flat().forEach((p) => b.extend(p));
    mapRef.current.fitBounds(b, 40);

    return () => { parcelPolyRef.current?.setMap(null); };
  }, [mapReady, parcel]);

  // ─── Setback no-build zone ─────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !parcel) return;
    setbackPolyRef.current?.setMap(null);
    // Use the conservative-max for the shrink (front/side/rear). Buyers see
    // a single hatched zone rather than three directional bands.
    const setbackFt = Math.max(setbacks.front_ft, setbacks.side_ft, setbacks.rear_ft);
    if (setbackFt <= 0) return;
    const inset = setbackPolygon(parcel.geojson, setbackFt, parcel.centerLat);
    if (inset.length === 0) return;
    setbackPolyRef.current = new google.maps.Polygon({
      paths: [...geojsonToLatLngs(parcel.geojson), ...inset],
      strokeColor: '#B45A3D',
      strokeOpacity: 0.4,
      strokeWeight: 1,
      fillColor: '#D04A1F',
      fillOpacity: 0.18,
      clickable: false,
      map: mapRef.current,
    });
    return () => { setbackPolyRef.current?.setMap(null); };
  }, [mapReady, parcel, setbacks.front_ft, setbacks.side_ft, setbacks.rear_ft]);

  // ─── Draggable footprint ───────────────────────────────────────────────
  // We re-create the polygon whenever the dimensions/orientation change so the
  // shape is always in sync. Drag is handled via Polygon.draggable + dragend
  // listener (simpler than tracking corners individually).
  useEffect(() => {
    if (!mapReady || !mapRef.current || !parcel) return;
    footprintPolyRef.current?.setMap(null);
    const corners = footprintCorners(footprint);
    const poly = new google.maps.Polygon({
      paths: corners,
      strokeColor: '#1F4E36',
      strokeOpacity: 1,
      strokeWeight: 2,
      fillColor: '#2E7B53',
      fillOpacity: 0.6,
      draggable: true,
      clickable: true,
      map: mapRef.current,
      zIndex: 10,
    });

    poly.addListener('dragend', () => {
      // Compute new center from the dragged polygon's bounds centroid.
      const path = poly.getPath();
      let sLat = 0;
      let sLng = 0;
      for (let i = 0; i < path.getLength(); i++) {
        const pt = path.getAt(i);
        sLat += pt.lat();
        sLng += pt.lng();
      }
      const n = path.getLength();
      setFootprint((prev) => ({ ...prev, centerLat: sLat / n, centerLng: sLng / n }));
    });

    footprintPolyRef.current = poly;
    return () => { poly.setMap(null); };
    // We deliberately depend only on dimension/orientation changes (not the
    // full footprint object). Drag updates centerLat/centerLng via setState,
    // but rebuilding the polygon on every drag would wipe Maps' active drag
    // handlers and freeze the UI mid-gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, parcel, footprint.widthFt, footprint.lengthFt, footprint.orientationDeg]);

  // When the user types an address into the search box and submits.
  const onSearch = useCallback(async (q: string) => {
    setMsg(null);
    try {
      const res = await searchParcel(q);
      setParcel({
        parcelId: res.parcel_id,
        geojson: res.geojson,
        centerLat: res.centroid_lat,
        centerLng: res.centroid_lng,
        address: res.address,
        county: res.county,
        isMock: res.mock,
        searchQuery: q,
      });
      // Snap the footprint to the parcel centroid on first search.
      setFootprint((prev) => ({
        ...prev,
        centerLat: res.centroid_lat,
        centerLng: res.centroid_lng,
      }));
      if (res.mock) {
        setMsg({
          kind: 'success',
          text: 'Mock parcel returned (REGRID_API_TOKEN not set). Footprint placement still works.',
        });
      } else if (res.cached) {
        setMsg({ kind: 'success', text: 'Parcel loaded from cache.' });
      } else {
        setMsg({ kind: 'success', text: 'Parcel loaded.' });
      }
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Search failed' });
    }
  }, []);

  function onSave() {
    if (!parcel) {
      setMsg({ kind: 'error', text: 'Search for a parcel first.' });
      return;
    }
    setMsg(null);
    startTransition(async () => {
      try {
        const result = await savePlacement({
          homeId: home.id,
          placementId: existing?.id ?? null,
          searchQuery: parcel.searchQuery,
          parcelId: parcel.parcelId,
          parcelGeojson: parcel.geojson,
          parcelLat: parcel.centerLat,
          parcelLng: parcel.centerLng,
          address: parcel.address,
          county: parcel.county,
          footprintWFt: footprint.widthFt,
          footprintLFt: footprint.lengthFt,
          anchorLat: footprint.centerLat,
          anchorLng: footprint.centerLng,
          orientationDeg: footprint.orientationDeg,
          label: parcel.address ?? null,
          notes: null,
        });
        setShareToken(result.placement.share_token);
        setMsg({ kind: 'success', text: `Saved. Share URL: ${result.shareUrl}` });
      } catch (e) {
        setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Save failed' });
      }
    });
  }

  function onDelete() {
    if (!existing) return;
    if (!confirm('Delete this placement? The share link will stop working.')) return;
    startTransition(async () => {
      try {
        await deletePlacement(existing.id, home.id);
        setMsg({ kind: 'success', text: 'Deleted. Refresh to start over.' });
      } catch (e) {
        setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Delete failed' });
      }
    });
  }

  function onRegenerateToken() {
    if (!existing) return;
    if (!confirm('Generate a new share link? The old link will stop working.')) return;
    startTransition(async () => {
      try {
        const newTok = await regenerateShareToken(existing.id, home.id);
        setShareToken(newTok);
        setMsg({ kind: 'success', text: 'New share link generated.' });
      } catch (e) {
        setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Regenerate failed' });
      }
    });
  }

  const shareUrl = useMemo(() => (shareToken ? `${publicBaseUrl}/place/${shareToken}` : null), [shareToken, publicBaseUrl]);

  return (
    <div className="placement-grid">
      {/* Sidebar */}
      <aside className="placement-sidebar">
        <section className="card">
          <div className="card-head">
            <h3>Find parcel</h3>
            <div className="sub">Search the buyer&rsquo;s street address.</div>
          </div>
          <div className="card-body">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSearch(searchInput);
              }}
              style={{ display: 'flex', gap: 8 }}
            >
              <input
                className="input"
                placeholder="123 Main St, Lexington SC"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                type="submit"
                disabled={pending}
                style={{
                  background: 'var(--adm-accent)', color: '#fff',
                  border: 'none', padding: '0 14px', borderRadius: 6,
                  fontSize: 13, cursor: 'pointer',
                }}
              >
                Search
              </button>
            </form>
            {parcel && (
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--adm-ink-mute)' }}>
                <div><strong>Parcel:</strong> {parcel.parcelId ?? '—'}</div>
                <div><strong>County:</strong> {parcel.county ?? '—'}</div>
                <div><strong>Address:</strong> {parcel.address ?? '—'}</div>
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Footprint</h3>
            <div className="sub">{home.name} — {home.width_ft ?? '—'} × {home.length_ft ?? '—'} ft</div>
          </div>
          <div className="card-body">
            <div className="field-row">
              <div className="field">
                <label className="label">Width (ft)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={200}
                  value={footprint.widthFt}
                  onChange={(e) => setFootprint((p) => ({ ...p, widthFt: Number(e.target.value || 0) }))}
                />
              </div>
              <div className="field">
                <label className="label">Length (ft)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={200}
                  value={footprint.lengthFt}
                  onChange={(e) => setFootprint((p) => ({ ...p, lengthFt: Number(e.target.value || 0) }))}
                />
              </div>
            </div>
            <div className="field">
              <label className="label">Orientation: {footprint.orientationDeg}°</label>
              <input
                type="range"
                min={0}
                max={359}
                value={footprint.orientationDeg}
                onChange={(e) => setFootprint((p) => ({ ...p, orientationDeg: Number(e.target.value) }))}
                style={{ width: '100%' }}
              />
              <div className="help">0° = long axis points north. Drag the home on the map to reposition.</div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Setbacks</h3>
            <div className="sub">From org settings.</div>
          </div>
          <div className="card-body">
            <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--adm-ink-mute)' }}>
              Front {setbacks.front_ft}ft · Side {setbacks.side_ft}ft · Rear {setbacks.rear_ft}ft
              {setbacks.road_easement_ft > 0 && (
                <> · Road easement {setbacks.road_easement_ft}ft</>
              )}
              <div style={{ marginTop: 6 }}>
                <a href="/settings" style={{ color: 'var(--adm-accent)', fontSize: 12 }}>Change in settings →</a>
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              type="button"
              onClick={onSave}
              disabled={pending || !parcel}
              style={{
                background: 'var(--adm-accent)', color: '#fff',
                border: 'none', padding: '10px 14px', borderRadius: 6,
                fontSize: 13, fontWeight: 500, cursor: pending ? 'wait' : 'pointer',
                opacity: !parcel ? 0.4 : 1,
              }}
            >
              {pending ? 'Saving…' : existing ? 'Update placement' : 'Save placement'}
            </button>

            {shareUrl && (
              <div style={{
                padding: 10, background: '#F4F0EA', border: '1px solid #DCD2C2',
                borderRadius: 6, fontSize: 12,
              }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>Share link</div>
                <div style={{ wordBreak: 'break-all', fontFamily: 'var(--f-mono, monospace)' }}>
                  {shareUrl}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(shareUrl)}
                    style={{
                      background: '#fff', border: '1px solid #C5B79F',
                      padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    Copy
                  </button>
                  {existing && (
                    <button
                      type="button"
                      onClick={onRegenerateToken}
                      disabled={pending}
                      style={{
                        background: '#fff', border: '1px solid #C5B79F',
                        padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                      }}
                    >
                      Regenerate
                    </button>
                  )}
                </div>
              </div>
            )}

            {existing && (
              <button
                type="button"
                onClick={onDelete}
                disabled={pending}
                style={{
                  background: 'transparent', color: '#a53a2c',
                  border: '1px solid #a53a2c', padding: '8px 14px',
                  borderRadius: 6, fontSize: 12, cursor: 'pointer',
                }}
              >
                Delete placement
              </button>
            )}

            {msg && (
              <div style={{
                padding: 10, borderRadius: 4, fontSize: 12,
                background: msg.kind === 'success' ? '#e6efe2' : '#faf0ee',
                color: msg.kind === 'success' ? '#4a6b3f' : '#a53a2c',
                wordBreak: 'break-word',
              }}>{msg.text}</div>
            )}
          </div>
        </section>
      </aside>

      {/* Map */}
      <main className="placement-map-wrap">
        {googleMapsApiKey ? (
          <div ref={mapDivRef} className="placement-map" />
        ) : (
          <div className="placement-map" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#FAF4EB', color: '#7A5F0E', textAlign: 'center', padding: 24,
          }}>
            Google Maps key not set.<br />Add <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to your env.
          </div>
        )}
      </main>
    </div>
  );
}
