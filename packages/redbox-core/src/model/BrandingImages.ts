/** Immutable objects on the primary brand-asset disk. Live routes still read logo/favicon. */
export interface BrandingImage {
  storageKey?: string;
  gridFsId?: string;
  sha256?: string;
  contentType?: string;
  updatedAt?: string;
  [key: string]: unknown;
}
export interface BrandingImages {
  logo: BrandingImage | null;
  favicon: BrandingImage | null;
}
