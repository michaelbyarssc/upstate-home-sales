'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import type { ParcelGeoJson, PublicPropertyPlacement } from '@uhs/db';

const FT_PER_DEG_LAT = 364_000;
function ftPerDegLng(lat: number): number {
  return Math.cos((lat * Math.PI) / 180) * FT_PER_DEG_LAT;
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

function footprintCorners(
  centerLat: number,
  centerLng: number,
  widthFt: number,
  lengthFt: number,
  orientationDeg: number,
): google.maps.LatLngLiteral[] {
  const halfW = widthFt / 2;
  const halfL = lengthFt / 2;
  const cornersFt: Array<[number, number]> = [
    [-halfW, +halfL],
    [+halfW, +halfL],
    [+halfW, -halfL],
    [-halfW, -halfL],
  ];
  const sin = Math.sin((orientationDeg * Math.PI) / 180);
  const cos = Math.cos((orientationDeg * Math.PI) / 180);
  const ftPerLng = ftPerDegLng(centerLat);
  return cornersFt.map(([dx, dy]) => {
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    return {
      lat: centerLat + ry / FT_PER_DEG_LAT,
      lng: centerLng + rx / ftPerLng,
    };
  });
}

function setbackPolygon(
  parcel: ParcelGeoJson,
  setbackFt: number,
  centroidLat: number,
): google.maps.LatLngLiteral[][] {
  if (setbackFt <= 0) return [];
  const ftPerLng = ftPerDegLng(centroidLat);
  const rings: number[][][] =
    parcel.type === 'Polygon'
      ? (parcel.coordinates as number[][][])
      : (parcel.coordinates as number[][][][])[0] ?? [];
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
    out.push(
      ring.map((pt) => {
        const lng = pt[0] ?? 0;
        const lat = pt[1] ?? 0;
        const dLngFt = (lng - cx) * ftPerLng;
        const dLatFt = (lat - cy) * FT_PER_DEG_LAT;
        const len = Math.hypot(dLngFt, dLatFt);
        if (len === 0) return { lat, lng };
        const inset = Math.min(setbackFt, len - 1);
        const factor = (len - inset) / len;
        return { lat: cy + (lat - cy) * factor, lng: cx + (lng - cx) * factor };
      }),
    );
  }
  return out;
}

/** Local Gradient raster tile URL (blueprint style, 512px). Returns null
 *  when no key is configured so the overlay simply isn't added. */
function localGradientTileUrl(key: string | null): string | null {
  if (!key) return null;
  return `https://frontend-jypnlxgeua-uc.a.run.app/styles/blueprint/512/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`;
}

export function PlacementViewer({
  placement,
  googleMapsApiKey,
  localGradientTileKey,
}: {
  placement: PublicPropertyPlacement;
  googleMapsApiKey: string | null;
  localGradientTileKey: string | null;
}) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!googleMapsApiKey || !mapDivRef.current) return;
    let cancelled = false;
    const loader = new Loader({ apiKey: googleMapsApiKey, version: 'weekly' });
    loader
      .load()
      .then(() => {
        if (cancelled || !mapDivRef.current) return;
        const map = new google.maps.Map(mapDivRef.current, {
          center: { lat: placement.parcel_lat, lng: placement.parcel_lng },
          zoom: 19,
          mapTypeId: google.maps.MapTypeId.HYBRID,
          tilt: 0,
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: false,
          fullscreenControl: true,
          streetViewControl: false,
          gestureHandling: 'cooperative',
        });

        // Parcel-boundary tile overlay (Local Gradient blueprint style).
        const tileBaseUrl = localGradientTileUrl(localGradientTileKey);
        if (tileBaseUrl) {
          map.overlayMapTypes.push(
            new google.maps.ImageMapType({
              name: 'Parcel boundaries',
              tileSize: new google.maps.Size(512, 512),
              opacity: 0.55,
              maxZoom: 22,
              minZoom: 12,
              getTileUrl: (coord, zoom) =>
                tileBaseUrl
                  .replace('{z}', String(zoom))
                  .replace('{x}', String(coord.x))
                  .replace('{y}', String(coord.y)),
            }),
          );
        }

        // Parcel polygon.
        const parcelRings = geojsonToLatLngs(placement.parcel_geojson);
        const parcelPoly = new google.maps.Polygon({
          paths: parcelRings,
          strokeColor: '#B9532A',
          strokeOpacity: 0.9,
          strokeWeight: 2,
          fillColor: '#B9532A',
          fillOpacity: 0.06,
          clickable: false,
          map,
        });

        // Setback no-build zone (donut: outer parcel + inner shrunk).
        const setbackFt = Math.max(
          placement.setback_front_ft,
          placement.setback_side_ft,
          placement.setback_rear_ft,
        );
        if (setbackFt > 0) {
          const inset = setbackPolygon(placement.parcel_geojson, setbackFt, placement.parcel_lat);
          if (inset.length > 0) {
            new google.maps.Polygon({
              paths: [...parcelRings, ...inset],
              strokeColor: '#B45A3D',
              strokeOpacity: 0.4,
              strokeWeight: 1,
              fillColor: '#D04A1F',
              fillOpacity: 0.18,
              clickable: false,
              map,
            });
          }
        }

        // Footprint (read-only).
        const corners = footprintCorners(
          placement.anchor_lat,
          placement.anchor_lng,
          placement.footprint_w_ft,
          placement.footprint_l_ft,
          placement.orientation_deg,
        );
        new google.maps.Polygon({
          paths: corners,
          strokeColor: '#1F4E36',
          strokeOpacity: 1,
          strokeWeight: 2,
          fillColor: '#2E7B53',
          fillOpacity: 0.6,
          clickable: false,
          map,
          zIndex: 10,
        });

        // Fit bounds.
        const b = new google.maps.LatLngBounds();
        parcelRings.flat().forEach((p) => b.extend(p));
        corners.forEach((p) => b.extend(p));
        map.fitBounds(b, 30);

        // Suppress the void warning — parcelPoly is referenced for side effect only.
        void parcelPoly;
      })
      .catch((err) => {
        console.error('Google Maps load failed', err);
        setLoadError('Map failed to load. Refresh to try again.');
      });
    return () => {
      cancelled = true;
    };
  }, [googleMapsApiKey, localGradientTileKey, placement]);

  if (!googleMapsApiKey) {
    return (
      <div className="placement-share-map placement-share-map--placeholder">
        Map unavailable — Google Maps API key not configured.
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div ref={mapDivRef} className="placement-share-map" />
      {loadError && (
        <div style={{
          position: 'absolute', top: 12, left: 12, right: 12,
          padding: 10, background: '#faf0ee', color: '#a53a2c',
          borderRadius: 4, fontSize: 13,
        }}>
          {loadError}
        </div>
      )}
    </div>
  );
}
