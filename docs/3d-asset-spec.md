# 3D Asset Spec — UHS Design Studio (Phase C)

This document is the contract between the UHS engineering build and the
3D artists / vendor / manufacturer-license partner producing GLB assets
for the Design Studio.

---

## File format

- **Container:** `.glb` (GLTF binary)
- **Compression:** Draco mesh compression preferred; KTX2 for textures
- **Max size:** 200 MB per model (enforced at upload by the storage bucket
  `model-3d-assets`)
- **Coordinate system:** glTF default (Y-up, +Z forward)
- **Units:** meters (1 unit = 1 m)

## Naming convention

Each home model exports a single GLB. Inside, meshes that map to
customizable "option slots" must be named with the corresponding slot name
from `model_options.slot_name`. The asset's `material_manifest` jsonb
column records the mesh-name → slot mapping.

### Required slot names (v1 launch catalog)

| Slot name           | What it is                                  | Material kind |
| ------------------- | ------------------------------------------- | ------------- |
| `siding_main`       | Primary exterior wall siding                | color / texture |
| `siding_accent`     | Accent siding (gables, cottages)            | color / texture |
| `trim_main`         | Window/door trim, fascia, rakeboards        | color         |
| `roof_main`         | Roof shingles                               | color / texture |
| `shutters`          | Window shutters (when present)              | color         |
| `front_door`        | Front door material                         | color / texture |
| `kitchen_cabinet`   | Kitchen upper + lower cabinet boxes         | color / texture |
| `kitchen_counter`   | Kitchen countertop                          | texture       |
| `kitchen_floor`     | Kitchen flooring                            | texture       |
| `bath_master_floor` | Master bath flooring                        | texture       |
| `bath_master_vanity`| Master bath vanity                          | color / texture |

Slots that aren't applicable for a given model can be omitted from the
manifest — the configurator only shows options whose slot exists in the
manifest of the model's currently-published GLB.

### Best practices

1. **One material per slot.** Each slot mesh should use a single
   `MeshStandardMaterial` with one base color (or texture). This lets the
   renderer swap material color cheaply via `material.color.set(...)`.
2. **Separate meshes for separate finishes.** Don't bake siding + trim
   into the same mesh — the renderer can't split them.
3. **Reasonable polycount.** Aim for < 250k tris per home. Mobile clients
   will degrade gracefully but heavy meshes hurt time-to-interactive.
4. **No baked lighting in the GLB itself.** The renderer applies
   environmental lighting (`<Environment preset="sunset" />` from drei).
5. **Origin at ground level.** Y=0 should be the foundation footprint,
   not the geometric center.
6. **Don't export rigging or animation.** Static models only for v1.

---

## Material manifest example

```json
{
  "siding_main": "Body_Siding",
  "siding_accent": ["Gable_Left", "Gable_Right"],
  "trim_main": "Window_Trim",
  "roof_main": "Roof_Mesh",
  "kitchen_cabinet": "Kitchen_Cabinets_Lower",
  "kitchen_counter": "Kitchen_Counter_Top"
}
```

Single mesh names are strings; multi-mesh slots use string arrays.

---

## Upload flow (admin)

1. Export GLB from Blender / 3ds Max with the slot-named meshes.
2. In the admin: `/admin/catalog/<model-id>/3d-asset` (lands in a follow-up).
3. Upload the GLB to the `model-3d-assets` Supabase Storage bucket
   (200 MB max). Metadata is parsed from the file header.
4. Author the `material_manifest` JSON in the upload form (or paste from
   the artist deliverable).
5. Define each slot's option values + price deltas in
   `/admin/catalog/<model-id>/options`.

---

## Cost model (reminder)

- **Contract artists:** ~$1,500–$4,000 per model. 30–50 models for a
  credible launch catalog ⇒ $45k–$200k one-time.
- **Vendor (Threekit / 3D Cloud / ZakekiBuild):** $2k–$10k/mo + setup.
- **Manufacturer license:** Cheapest if Clayton/Cavco/Champion will
  share existing CAD/3D for marketing. Quality and naming may not
  match this spec — usually requires re-export.

The acquisition decision is independent of the engineering timeline; the
configurator works end-to-end with placeholder geometry today (Phase C
shipped 2026-05). Drop a real GLB into the bucket + populate the
manifest and option rows, and the renderer picks it up automatically.

---

## Renderer behavior

- `apps/public/app/inventory/[stock]/design/design-studio.tsx` is the
  React Three Fiber canvas. It:
  - Loads the latest GLB version from `model_3d_assets`
  - Walks the scene graph; for each mesh whose name matches a manifest
    entry, clones its material and applies the active option's overlay
  - Re-applies on every selection change, no scene reload
- When no GLB is available, falls back to a hand-built placeholder house
  with the same `siding_main` / `trim_main` / `roof_main` slot semantics.
  Useful for demos before the asset pipeline ships.
- Mobile: the canvas renders at native pixel ratio (capped at 2). On
  WEBGL_lose_context errors, a follow-up will swap in pre-rendered
  photo overlays (Phase C.4).
