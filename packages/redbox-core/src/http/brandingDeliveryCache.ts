/** Application-local delivery cache. Administration can invalidate it before
 * native page/asset conversion, without constructing the Express delivery layer. */
export class BrandingDeliveryCache {
  readonly cssResponseCache = new Map<string, { css: string; etag: string; createdAt: number }>();
  readonly fontResponseCache = new Map<string, Buffer>();
  fontResponseCacheBytes = 0;
  invalidate(): void {
    this.cssResponseCache.clear();
    this.fontResponseCache.clear();
    this.fontResponseCacheBytes = 0;
  }
}
