import { Component, ElementRef, HostListener, Inject, ViewChild } from '@angular/core';
import { BaseComponent, I18NextPipe, LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import { CatalogueComponent } from './catalogue.component';
import { EditorComponent } from './editor.component';
import { EmailTemplateAdminService } from './email-template-admin.service';
import { type EmailPreviewRecord } from './email-templates.model';

const TEMPLATE_HASH = /^#\/templates\/(.+)$/;

/**
 * Email templates Admin app. The catalogue and the editor share one page;
 * the open template lives in the URL hash (`#/templates/<id>`) so it can be
 * bookmarked and the browser Back button returns to the catalogue.
 */
@Component({
  selector: 'email-templates-root',
  standalone: true,
  imports: [CatalogueComponent, EditorComponent, I18NextPipe],
  providers: [EmailTemplateAdminService],
  template: `
    @if (ready) {
      <div class="et-app">
        <nav class="rb-admin-crumbs" [attr.aria-label]="'email-templates-breadcrumb-label' | i18next"><ol>
          <li><a [href]="adminUrl">{{ 'menu-admin' | i18next }}</a></li>
          <li>{{ 'admin-nav-site' | i18next }}</li>
          @if (templateId) {
            <li><button type="button" class="et-crumb" (click)="openCatalogue()">{{ 'email-templates-heading' | i18next }}</button></li>
            <li><span aria-current="page" class="rb-admin-code-wrap">{{ templateId }}</span></li>
          } @else {
            <li><span aria-current="page">{{ 'email-templates-heading' | i18next }}</span></li>
          }
        </ol></nav>
        @if (templateId) {
          @for (id of [templateId]; track id) {
          <email-templates-editor
            [templateId]="id"
            [brandName]="brandName"
            [initialRecord]="previewRecord"
            (recordChange)="previewRecord = $event"
            (back)="openCatalogue()"
          ></email-templates-editor>
          }
        } @else {
          <email-templates-catalogue
            [returnFocus]="catalogueFocus"
            (openTemplate)="openTemplate($event)"
          ></email-templates-catalogue>
        }
      </div>
    }
  `,
  styles: [
    `
      :host { display: block; min-width: 0; }
      .et-crumb { border: 0; padding: 0; background: transparent; color: inherit; font: inherit; }
      .et-crumb:hover { text-decoration: underline; }
    `,
  ],
})
export class EmailTemplatesComponent extends BaseComponent {
  templateId: string | null = null;
  brandName = '';
  adminUrl = '';
  previewRecord: EmailPreviewRecord | null = null;
  ready = false;
  @ViewChild(EditorComponent) editor?: EditorComponent;
  @ViewChild(CatalogueComponent) catalogue?: CatalogueComponent;
  catalogueFocus: { templateId: string; action: string } | null = null;
  private openingActions = new Map<string, string>();
  private navigationSeq = 0;

  constructor(
    @Inject(LoggerService) private logger: LoggerService,
    @Inject(TranslationService) private i18n: TranslationService,
    private api: EmailTemplateAdminService,
    private host: ElementRef<HTMLElement>
  ) {
    super();
    this.initDependencies = [this.i18n, this.api];
  }

  protected async initComponent(): Promise<void> {
    this.brandName = this.host.nativeElement.getAttribute('data-brand') || this.api.brandName;
    this.adminUrl = `${this.api.brandingAndPortalUrl}/admin`;
    await this.readHash();
    this.ready = true;
    this.logger.debug('Email templates app initialised');
  }

  @HostListener('window:hashchange')
  @HostListener('window:popstate')
  async readHash(): Promise<void> {
    const match = TEMPLATE_HASH.exec(window.location.hash);
    let templateId: string | null = null;
    if (match) {
      try {
        templateId = decodeURIComponent(match[1]);
      } catch {
        templateId = null;
      }
    }
    await this.navigate(templateId);
  }

  private async navigate(templateId: string | null): Promise<boolean> {
    const seq = ++this.navigationSeq;
    if (templateId === this.templateId) return true;
    const allowed = !this.editor || await this.editor.prepareToLeave();
    if (seq !== this.navigationSeq) return false;
    if (!allowed) {
      history.replaceState(null, '', window.location.pathname + window.location.search +
        (this.templateId ? `#/templates/${encodeURIComponent(this.templateId)}` : ''));
      return false;
    }
    if (!templateId && this.templateId)
      this.catalogueFocus = { templateId: this.templateId, action: this.openingActions.get(this.templateId) ?? 'open' };
    this.templateId = templateId;
    return true;
  }

  async openTemplate(templateId: string): Promise<void> {
    if (this.catalogue) this.openingActions.set(templateId, this.catalogue.openingAction);
    if (await this.navigate(templateId)) {
      window.location.hash = `#/templates/${encodeURIComponent(templateId)}`;
      window.scrollTo({ top: 0 });
    }
  }

  async openCatalogue(): Promise<void> {
    if (await this.navigate(null)) {
      if (window.location.hash) history.pushState(null, '', window.location.pathname + window.location.search);
    }
  }
}
