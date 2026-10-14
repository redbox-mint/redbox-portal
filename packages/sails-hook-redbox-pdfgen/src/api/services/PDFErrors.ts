export class MissingTokenError extends Error {
  readonly _tag = 'MissingTokenError';

  constructor(readonly oid: string) {
    super(`API token is not configured for ${oid}`);
  }
}

export class BrowserError extends Error {
  readonly _tag = 'BrowserError';

  constructor(readonly oid: string, readonly url: string, readonly cause: unknown) {
    super(`Browser error while generating PDF for ${oid}`);
  }
}

export class PDFRenderError extends Error {
  readonly _tag = 'PDFRenderError';

  constructor(readonly oid: string, readonly cause: unknown) {
    super(`PDF rendering error for ${oid}`);
  }
}

export class DatastreamSaveError extends Error {
  readonly _tag = 'DatastreamSaveError';

  constructor(readonly oid: string, readonly cause: unknown) {
    super(`Datastream save error for ${oid}`);
  }
}

export class InvalidReadinessOptionError extends Error {
  readonly _tag = 'InvalidReadinessOptionError';

  constructor(readonly oid: string, readonly strategy: string, readonly option: string) {
    super(`Missing ${option} for readiness strategy ${strategy}`);
  }
}

export class MissingBrandError extends Error {
  readonly _tag = 'MissingBrandError';

  constructor(readonly oid: string, readonly brandId: unknown) {
    super(`Unable to resolve brand ${String(brandId)} for ${oid}`);
  }
}

export type PDFError =
  | MissingTokenError
  | BrowserError
  | PDFRenderError
  | DatastreamSaveError
  | InvalidReadinessOptionError
  | MissingBrandError;
