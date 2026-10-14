import { Injectable, Inject } from '@angular/core';
import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClientService, ConfigService, UtilityService, RB_HTTP_INTERCEPTOR_AUTH_CSRF, RB_HTTP_INTERCEPTOR_SKIP_JSON_CONTENT_TYPE } from '@researchdatabox/portal-ng-common';
import { firstValueFrom } from 'rxjs';
import {
  BrandingAdminState,
  BrandingMutationError,
  BrandingPreview,
  BrandingTypefaceSlot,
  BrandingVersionEntry,
} from './branding-admin.model';

/**
 * Branding Admin Service
 *
 * Thin transport over the AJAX branding lifecycle (design.md section 10).
 * Every method sends optimistic-concurrency counters taken from the caller's
 * canonical {@link BrandingAdminState} and returns the complete server state
 * for wholesale replacement. Draft preview sample text stays in the component
 * and never enters this service. The deprecated rollback route is never called.
 */
@Injectable()
export class BrandingAdminService extends HttpClientService {

  constructor(
    @Inject(HttpClient) http: HttpClient,
    @Inject(APP_BASE_HREF) rootContext: string,
    @Inject(UtilityService) utilService: UtilityService,
    @Inject(ConfigService) configService: ConfigService
  ) {
    super(http, rootContext, utilService, configService);
  }

  /**
   * Expose the brand+portal base path (e.g., /<brand>/<portal>) for building asset URLs.
   */
  public getBrandingAndPortalUrl(): string {
    return this.brandingAndPortalUrl;
  }

  public override async waitForInit(): Promise<any> {
    await super.waitForInit();
    this.enableCsrfHeader();
    return this;
  }

  private get base(): string {
    return `${this.brandingAndPortalUrl}/app/branding`;
  }

  /** JSON body-observation options with a static type (the base presets are `any`). */
  private jsonOpts(): { responseType: 'json'; observe: 'body'; context: HttpContext } {
    return { ...this.reqOptsJsonBodyOnly, context: this.httpContext };
  }

  private normaliseError(error: unknown): never {
    if (error instanceof HttpErrorResponse) {
      const body = error.error as { message?: string } | undefined;
      const message = typeof body?.message === 'string' && body.message ? body.message : error.message;
      if (error.status === 409) {
        throw { kind: 'conflict', status: 409, message } satisfies BrandingMutationError;
      }
      if (error.status === 413) {
        throw { kind: 'limit', status: 413, message } satisfies BrandingMutationError;
      }
    }
    throw error;
  }

  private async postState<T>(url: string, body: unknown): Promise<T> {
    try {
      const result$ = this.http.post<T>(url, body, this.jsonOpts());
      return await firstValueFrom(result$);
    } catch (error) {
      this.normaliseError(error);
    }
  }

  /** Load the canonical Admin state. */
  public async loadConfig(): Promise<BrandingAdminState> {
    const result$ = this.http.get<BrandingAdminState>(`${this.base}/config`, this.jsonOpts());
    return await firstValueFrom(result$);
  }

  /** Replace the validated colour draft; counters come from canonical state. */
  public async saveColourDraft(variables: Record<string, string>, expectedDraftRevision: number): Promise<BrandingAdminState> {
    return this.postState<BrandingAdminState>(`${this.base}/draft`, { variables, expectedDraftRevision });
  }

  /**
   * Save draft branding configuration (legacy shape kept for compatibility).
   * Prefer {@link saveColourDraft} with an explicit revision for new code.
   */
  public async saveDraft(config: unknown, expectedDraftRevision?: number): Promise<BrandingAdminState> {
    return this.postState<BrandingAdminState>(`${this.base}/draft`, {
      variables: this.toVariablesRecord(
        config && typeof config === 'object' && 'variables' in config
          ? (config as { variables?: unknown }).variables
          : config
      ),
      expectedDraftRevision,
    });
  }

  /** Copy only string-valued entries so the colour draft keeps its record type. */
  private toVariablesRecord(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object') {
      return {};
    }
    const variables: Record<string, string> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === 'string') {
        variables[key] = entry;
      }
    }
    return variables;
  }

  /** Upload or replace one draft face (multipart `face` plus revision field). */
  public async uploadFace(slot: BrandingTypefaceSlot, file: File | Blob, filename: string, expectedDraftRevision: number): Promise<BrandingAdminState> {
    const formData = new FormData();
    formData.append('face', file, filename);
    formData.append('expectedDraftRevision', String(expectedDraftRevision));
    const fileUploadContext = new HttpContext();
    fileUploadContext.set(RB_HTTP_INTERCEPTOR_AUTH_CSRF, this.config.csrfToken);
    fileUploadContext.set(RB_HTTP_INTERCEPTOR_SKIP_JSON_CONTENT_TYPE, true);
    try {
      const result$ = this.http.put<BrandingAdminState>(`${this.base}/draft/typeface/faces/${slot}`, formData, {
        context: fileUploadContext,
      });
      return await firstValueFrom(result$);
    } catch (error) {
      this.normaliseError(error);
    }
  }

  /** Remove one draft face. */
  public async removeFace(slot: BrandingTypefaceSlot, expectedDraftRevision: number): Promise<BrandingAdminState> {
    try {
      const result$ = this.http.delete<BrandingAdminState>(`${this.base}/draft/typeface/faces/${slot}`, {
        ...this.jsonOpts(),
        body: { expectedDraftRevision },
      });
      return await firstValueFrom(result$);
    } catch (error) {
      this.normaliseError(error);
    }
  }

  /** Set the draft typeface to Default Typography. */
  public async useDefaultTypography(expectedDraftRevision: number): Promise<BrandingAdminState> {
    return this.postState<BrandingAdminState>(`${this.base}/draft/typeface/use-default`, { expectedDraftRevision });
  }

  /** Copy the active typeface into the draft only. */
  public async revertTypefaceDraft(expectedDraftRevision: number): Promise<BrandingAdminState> {
    return this.postState<BrandingAdminState>(`${this.base}/draft/typeface/revert`, { expectedDraftRevision });
  }

  /** Create a single-use CSS preview for the exact draft revision. */
  public async createPreview(expectedDraftRevision?: number): Promise<BrandingPreview> {
    return this.postState<BrandingPreview>(`${this.base}/preview`, { expectedDraftRevision });
  }

  /** List newest retained versions. */
  public async listVersions(): Promise<BrandingVersionEntry[]> {
    const result$ = this.http.get<BrandingVersionEntry[]>(`${this.base}/versions`, this.jsonOpts());
    return await firstValueFrom(result$);
  }

  /** Preview a retained version without mutating the draft. */
  public async previewVersion(versionId: string): Promise<BrandingPreview> {
    return this.postState<BrandingPreview>(`${this.base}/versions/${versionId}/preview`, {});
  }

  /** Publish the draft using both expected counters. */
  public async publish(expectedVersion: number, expectedDraftRevision: number): Promise<BrandingAdminState> {
    return this.postState<BrandingAdminState>(`${this.base}/publish`, { expectedVersion, expectedDraftRevision });
  }

  /** Immediately restore a retained version as a new version. */
  public async restore(versionId: string, expectedVersion: number, expectedDraftRevision: number): Promise<BrandingAdminState> {
    return this.postState<BrandingAdminState>(`${this.base}/restore/${versionId}`, { expectedVersion, expectedDraftRevision });
  }

  /**
   * Upload logo file
   */
  public async uploadLogo(formData: FormData): Promise<unknown> {
    const url = `${this.base}/logo`;

    // Create HttpContext for FormData uploads - include CSRF but skip JSON content-type
    const fileUploadContext = new HttpContext();
    fileUploadContext.set(RB_HTTP_INTERCEPTOR_AUTH_CSRF, this.config.csrfToken);
    fileUploadContext.set(RB_HTTP_INTERCEPTOR_SKIP_JSON_CONTENT_TYPE, true);

    const uploadOptions = {
      context: fileUploadContext
    };

    const result$ = this.http.post(url, formData, uploadOptions);
    return await firstValueFrom(result$);
  }

  /**
   * Upload favicon file
   */
  public async uploadFavicon(formData: FormData): Promise<unknown> {
    const url = `${this.base}/favicon`;

    // Create HttpContext for FormData uploads - include CSRF but skip JSON content-type
    const fileUploadContext = new HttpContext();
    fileUploadContext.set(RB_HTTP_INTERCEPTOR_AUTH_CSRF, this.config.csrfToken);
    fileUploadContext.set(RB_HTTP_INTERCEPTOR_SKIP_JSON_CONTENT_TYPE, true);

    const uploadOptions = {
      context: fileUploadContext
    };

    const result$ = this.http.post(url, formData, uploadOptions);
    return await firstValueFrom(result$);
  }
}
