import { Injectable, Inject } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClientService, ConfigService, UtilityService, RB_HTTP_INTERCEPTOR_AUTH_CSRF, RB_HTTP_INTERCEPTOR_SKIP_JSON_CONTENT_TYPE } from '@researchdatabox/portal-ng-common';
import { firstValueFrom } from 'rxjs';

/**
 * Branding Admin Service
 * 
 * Handles all AJAX calls for branding configuration management.
 * Extends HttpClientService to get proper initialization and CSRF handling.
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

  /**
   * Load current branding configuration
   */
  public async loadConfig(): Promise<any> {
    const url = `${this.brandingAndPortalUrl}/app/branding/config`;
    const result$ = this.http.get(url, { ...this.reqOptsJsonBodyOnly, context: this.httpContext });
    return await firstValueFrom(result$);
  }

  /**
   * Save draft branding configuration
   */
  public async saveDraft(config: any): Promise<any> {
    const url = `${this.brandingAndPortalUrl}/app/branding/draft`;
    const result$ = this.http.post(url, { variables: config }, { ...this.reqOptsJsonBodyOnly, context: this.httpContext });
    return await firstValueFrom(result$);
  }

  /**
   * Create preview of branding configuration
   */
  public async createPreview(): Promise<any> {
    const url = `${this.brandingAndPortalUrl}/app/branding/preview`;
    const result$ = this.http.post(url, {}, { ...this.reqOptsJsonBodyOnly, context: this.httpContext });
    return await firstValueFrom(result$);
  }

  /**
   * Publish branding configuration
   * @param config The branding variables to publish
   * @param version Optional version for optimistic concurrency control
   */
  public async publish(config: any, version?: string): Promise<any> {
    const url = `${this.brandingAndPortalUrl}/app/branding/publish`;
    const body: any = { variables: config };
    if (version) {
      body.version = version;
    }
    const result$ = this.http.post(url, body, { ...this.reqOptsJsonBodyOnly, context: this.httpContext });
    return await firstValueFrom(result$);
  }

  /**
   * Upload logo file
   */
  public async uploadLogo(formData: FormData): Promise<any> {
    const url = `${this.brandingAndPortalUrl}/app/branding/logo`;
    
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
