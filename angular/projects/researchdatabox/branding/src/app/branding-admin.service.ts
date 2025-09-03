import { Injectable, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClientService, ConfigService, UtilityService } from '@researchdatabox/portal-ng-common';
import { firstValueFrom, map } from 'rxjs';

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
    const result$ = this.http.get(url, { ...this.reqOptsJsonBodyOnly, context: this.httpContext }).pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  /**
   * Save draft branding configuration
   */
  public async saveDraft(config: any): Promise<any> {
    const url = `${this.brandingAndPortalUrl}/app/branding/draft`;
    const result$ = this.http.post(url, { variables: config }, { ...this.reqOptsJsonBodyOnly, context: this.httpContext }).pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  /**
   * Create preview of branding configuration
   */
  public async createPreview(config: any): Promise<any> {
    const url = `${this.brandingAndPortalUrl}/app/branding/preview`;
    const result$ = this.http.post(url, {}, { ...this.reqOptsJsonBodyOnly, context: this.httpContext }).pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  /**
   * Publish branding configuration
   */
  public async publish(config: any): Promise<any> {
    const url = `${this.brandingAndPortalUrl}/app/branding/publish`;
    // TODO: Add version tracking for optimistic concurrency control
    const result$ = this.http.post(url, {}, { ...this.reqOptsJsonBodyOnly, context: this.httpContext }).pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  /**
   * Upload logo file
   */
  public async uploadLogo(formData: FormData): Promise<any> {
    const url = `${this.brandingAndPortalUrl}/app/branding/logo`;
    const result$ = this.http.post(url, formData, { context: this.httpContext }).pipe(map(res => res));
    return await firstValueFrom(result$);
  }
}
