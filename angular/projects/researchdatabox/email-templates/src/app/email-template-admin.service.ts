import { Injectable, Inject } from '@angular/core';
import { HttpClient, HttpContext, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClientService, ConfigService, UtilityService } from '@researchdatabox/portal-ng-common';
import { Observable, firstValueFrom } from 'rxjs';
import type {
  EmailContextSchemaResponse,
  EmailSchemaTargetsResponse,
  EmailAdminCatalogueEntry,
  EmailAdminCatalogueResponse,
  EmailAdminContent,
  EmailAdminDiagnostic,
  EmailAdminDiscardResponse,
  EmailAdminDraftResponse,
  EmailAdminEditorState,
  EmailAdminErrorResponse,
  EmailAdminHistory,
  EmailAdminHistoryResponse,
  EmailAdminMutationResponse,
  EmailAdminPreview,
  EmailAdminRecordContextResponse,
  EmailAdminRecordSearch,
  EmailAdminToken,
  EmailAdminValidationResponse,
} from '@researchdatabox/sails-ng-common';
import type { SchemaSelection } from './schema-selection';
import { EmailTemplateApiError, type EmailPreviewWorkspace } from './email-templates.model';

/**
 * Email Template Admin Service
 *
 * Thin transport over `/:branding/:portal/app/email-templates`. The brand is
 * always taken from the route by the server; nothing here sends a brand ID.
 * Every failure is normalised to {@link EmailTemplateApiError}.
 */
@Injectable()
export class EmailTemplateAdminService extends HttpClientService {
  /** Per-app, per-template UI state; never sent as template configuration. */
  readonly previewWorkspaces = new Map<string, EmailPreviewWorkspace>();
  readonly schemaSelections = new Map<string, SchemaSelection>();
  readonly heldEdits = new Map<string, { content: EmailAdminContent; conflict: EmailTemplateApiError | null }>();

  public schemaTargets(): Promise<EmailSchemaTargetsResponse> {
    return this.get<EmailSchemaTargetsResponse>(`${this.base}/schema-targets`);
  }

  public contextSchema(recordType?: string, stage?: string, templateId?: string): Promise<EmailContextSchemaResponse> {
    let params = new HttpParams();
    if (recordType) params = params.set('recordType', recordType);
    if (templateId) params = params.set('templateId', templateId);
    if (stage) params = params.set('stage', stage);
    return this.get<EmailContextSchemaResponse>(`${this.base}/context-schema`, params);
  }

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

  /** Route brand name, for display only. */
  public get brandName(): string {
    return String(this.config?.branding ?? '');
  }

  private get base(): string {
    return `${this.brandingAndPortalUrl}/app/email-templates`;
  }

  private template(templateId: string, suffix = ''): string {
    return `${this.base}/templates/${encodeURIComponent(templateId)}${suffix}`;
  }

  /** JSON body-observation options with a static type (the base presets are `any`). */
  private jsonOpts(): { responseType: 'json'; observe: 'body'; context: HttpContext } {
    return { ...this.reqOptsJsonBodyOnly, context: this.httpContext };
  }

  private normaliseError(error: unknown): EmailTemplateApiError {
    if (error instanceof HttpErrorResponse) {
      const body = error.error as Partial<EmailAdminErrorResponse> | string | null;
      if (body && typeof body === 'object' && body.error && typeof body.error.code === 'string') {
        return new EmailTemplateApiError(
          error.status,
          body.error.code,
          Array.isArray(body.diagnostics) ? body.diagnostics : [],
          body.current
        );
      }
      // CSRF failures are a bare string (or empty in production); treat as access denial.
      return new EmailTemplateApiError(error.status, error.status === 403 ? 'FORBIDDEN' : 'UNAVAILABLE');
    }
    return new EmailTemplateApiError(0, 'UNAVAILABLE');
  }

  private async send<T>(request: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (error) {
      throw this.normaliseError(error);
    }
  }

  private get<T>(url: string, params?: HttpParams): Promise<T> {
    return this.send(this.http.get<T>(url, { ...this.jsonOpts(), params }));
  }

  private post<T>(url: string, body: unknown): Promise<T> {
    return this.send(this.http.post<T>(url, body, this.jsonOpts()));
  }

  public async catalogue(): Promise<EmailAdminCatalogueEntry[]> {
    const response = await this.get<EmailAdminCatalogueResponse>(`${this.base}/catalogue`);
    return response.templates;
  }

  public editorState(templateId: string): Promise<EmailAdminEditorState> {
    return this.get<EmailAdminEditorState>(this.template(templateId));
  }

  public saveDraft(
    templateId: string,
    content: EmailAdminContent,
    expectedDraftRevision: number | null
  ): Promise<EmailAdminDraftResponse> {
    return this.send(
      this.http.put<EmailAdminDraftResponse>(
        this.template(templateId, '/draft'),
        { content, expectedDraftRevision },
        this.jsonOpts()
      )
    );
  }

  public discardDraft(templateId: string, expectedDraftRevision: number): Promise<EmailAdminDiscardResponse> {
    return this.send(
      this.http.delete<EmailAdminDiscardResponse>(this.template(templateId, '/draft'), {
        ...this.jsonOpts(),
        body: { expectedDraftRevision },
      })
    );
  }

  public draftFromDefault(templateId: string, expectedDraftRevision: number | null): Promise<EmailAdminDraftResponse> {
    return this.post<EmailAdminDraftResponse>(this.template(templateId, '/draft/from-default'), {
      expectedDraftRevision,
    });
  }

  /**
   * Validate editor content. A 400 carrying diagnostics is an expected
   * outcome, so it resolves with those diagnostics instead of throwing.
   */
  public async validate(
    templateId: string,
    content: EmailAdminContent,
    selection?: SchemaSelection | null
  ): Promise<EmailAdminDiagnostic[]> {
    try {
      const response = await this.post<EmailAdminValidationResponse>(this.template(templateId, '/validate'), {
        content,
        ...(selection ?? {}),
      });
      return response.diagnostics;
    } catch (error) {
      if (error instanceof EmailTemplateApiError && error.status === 400 && error.diagnostics.length) {
        return error.diagnostics;
      }
      throw error;
    }
  }

  /** Render a preview. `context` is the JSON text from the editor, sent as a string. */
  public preview(
    templateId: string,
    content: EmailAdminContent,
    context: string,
    source?: 'default' | 'override'
  ): Promise<EmailAdminPreview> {
    return this.post<EmailAdminPreview>(this.template(templateId, '/preview'), {
      content,
      context,
      ...(source ? { source } : {}),
    });
  }

  public searchRecords(query: string, page = 1): Promise<EmailAdminRecordSearch> {
    const params = new HttpParams().set('q', query).set('page', String(page));
    return this.get<EmailAdminRecordSearch>(`${this.base}/preview-records`, params);
  }

  public async recordContext(oid: string, templateId: string): Promise<Record<string, unknown>> {
    const params = new HttpParams().set('templateId', templateId);
    const response = await this.get<EmailAdminRecordContextResponse>(
      `${this.base}/preview-records/${encodeURIComponent(oid)}/context`,
      params
    );
    return response.context;
  }

  public publish(
    templateId: string,
    expectedDraftRevision: number,
    expectedLiveToken: EmailAdminToken | null
  ): Promise<EmailAdminMutationResponse> {
    return this.post<EmailAdminMutationResponse>(this.template(templateId, '/publish'), {
      expectedDraftRevision,
      expectedLiveToken,
    });
  }

  public reset(templateId: string, expectedLiveToken: EmailAdminToken): Promise<EmailAdminMutationResponse> {
    return this.post<EmailAdminMutationResponse>(this.template(templateId, '/reset'), { expectedLiveToken });
  }

  public async history(templateId: string): Promise<EmailAdminHistory[]> {
    const response = await this.get<EmailAdminHistoryResponse>(this.template(templateId, '/history'));
    return response.versions;
  }

  public historyVersion(templateId: string, version: number): Promise<EmailAdminHistory> {
    return this.get<EmailAdminHistory>(this.template(templateId, `/history/${version}`));
  }

  public restore(
    templateId: string,
    version: number,
    expectedDraftRevision: number | null
  ): Promise<EmailAdminDraftResponse> {
    return this.post<EmailAdminDraftResponse>(this.template(templateId, `/history/${version}/restore`), {
      expectedDraftRevision,
    });
  }
}
