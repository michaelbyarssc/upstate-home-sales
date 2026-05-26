// Shared types for catalog-importer adapters and the runner.

export type HomeType = 'single' | 'double' | 'modular';

export type ModelPhoto = {
  url: string;
  kind: 'exterior' | 'interior' | 'floorplan';
  sortOrder: number;
  alt?: string;
};

export type ModelRef = {
  name: string;
  detailUrl: string;
  // Adapter-defined extras (e.g. which product line a TruMH model came from).
  // Stored as JSON-serializable values so refs survive a network hop.
  [key: string]: unknown;
};

export type ModelData = {
  name: string;
  modelCode?: string;
  series?: string;
  type: HomeType;
  beds?: number;
  baths?: number;
  sqft?: number;
  widthFt?: number;
  lengthFt?: number;
  yearBuilt?: number;
  construction?: string;
  headline?: string;
  description?: string;
  sourceUrl: string;
  photos: ModelPhoto[];
};

export interface CatalogAdapter {
  slug: string;
  displayName: string;
  manufacturerSlug: string;
  crawlDelayMs: number;
  /** Return true if this adapter can handle the given URL (host/path match). */
  matches(url: string): boolean;
  /** Crawl the listing(s) implied by `url` and return refs for each model. */
  listModels(opts: { url: string }): Promise<ModelRef[]>;
  /** Fetch a model's detail page and return its full data. */
  fetchModel(ref: ModelRef): Promise<ModelData>;
}

export type ProgressEvent =
  | { type: 'start'; total: number }
  | { type: 'model'; name: string; action: 'created' | 'updated' | 'skipped' | 'error'; photos: number; totalPhotos: number; error?: string }
  | { type: 'summary'; created: number; updated: number; skipped: number; errors: number };
