#!/usr/bin/env bash
# Import a county GeoJSON into the parcels table.
# Auto-chunks files over Node's ~512 MB readFileSync string limit.
#
# Usage: ./import-county.sh <county-name> [scdot-schema|york-schema|spartanburg-schema]
#   county-name: title-cased (e.g. "Anderson"); file expected at data/<lower>-sc-parcels.geojson
#   schema-flag: which field mappings to use (defaults to scdot-schema)

set -euo pipefail

county="$1"
schema="${2:-scdot-schema}"
state="${3:-SC}"
state_lc="$(echo "$state" | tr '[:upper:]' '[:lower:]')"
lower="$(echo "$county" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')"
if [ "$state_lc" = "nc" ]; then
  src="data/nc/${lower}-nc-parcels.geojson"
else
  src="data/${lower}-sc-parcels.geojson"
fi

if [ ! -f "$src" ]; then
  echo "missing $src" >&2; exit 1
fi

case "$schema" in
  scdot-schema)
    id_keys="TMS,OBJECTID"
    addr_keys="PHYS_ADDR,OWNER_ADDR"
    city_key="CITY"
    zip_key="ZIPCODE"
    source_tag="scdot-statewide-parcels-2024"
    ;;
  york-schema)
    id_keys="TAXMAPID,ParcelID,OBJECTID"
    addr_keys="PropertyAddress,MailAddr1"
    city_key="MailCity"
    zip_key="MailZip"
    source_tag="york-county-parcels-arcgis"
    ;;
  spartanburg-schema)
    id_keys="MAPNUMBER,OBJECTID"
    addr_keys="StreetAddress,PropertyLocation"
    city_key="City"
    zip_key="Zip"
    source_tag="spartanburg-county-cama-parcels"
    ;;
  nc-onemap-schema)
    id_keys="parno,altparno,objectid"
    addr_keys="siteadd,mailadd"
    city_key="scity"
    zip_key="szip"
    source_tag="nc-onemap-statewide-parcels"
    ;;
  *)
    echo "unknown schema: $schema" >&2; exit 2
    ;;
esac

run_import() {
  local file="$1"
  echo "  importing $file"
  NODE_OPTIONS="--max-old-space-size=8192" pnpm --filter @uhs/admin import-parcels \
    --file="$(pwd)/$file" \
    --county="$county" \
    --state="$state" \
    --source="$source_tag" \
    --id-keys="$id_keys" \
    --address-keys="$addr_keys" \
    --city-key="$city_key" \
    --zip-key="$zip_key" 2>&1 | tail -3
}

# stat -f works on macOS; -c on Linux. Try macOS first.
size_bytes=$(stat -f %z "$src" 2>/dev/null || stat -c %s "$src" 2>/dev/null)
size_mb=$(( size_bytes / 1024 / 1024 ))

echo "=== $county (${size_mb}MB) — schema=$schema ==="

if [ "$size_mb" -gt 450 ]; then
  echo "  file > 450MB, chunking via jq…"
  chunks_dir="data/chunks-${state_lc}-${lower}"
  rm -rf "$chunks_dir" && mkdir -p "$chunks_dir"
  jq -c '.features[]' "$src" > "$chunks_dir/features.jsonl"
  split -l 25000 "$chunks_dir/features.jsonl" "$chunks_dir/chunk_"
  for f in "$chunks_dir"/chunk_*; do
    (printf '{"type":"FeatureCollection","features":['; paste -sd, "$f"; printf ']}') > "${f}.geojson"
    rm "$f"
  done
  rm "$chunks_dir/features.jsonl"
  for chunk in "$chunks_dir"/chunk_*.geojson; do
    run_import "$chunk"
  done
else
  run_import "$src"
fi

echo "=== $county done ==="
