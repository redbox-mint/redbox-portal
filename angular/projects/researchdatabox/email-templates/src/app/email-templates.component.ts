import { Component, ElementRef, HostListener, Inject, ViewChild } from '@angular/core';
import { BaseComponent, LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
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
  imports: [CatalogueComponent, EditorComponent],
  providers: [EmailTemplateAdminService],
  template: `
    @if (ready) {
      <div class="et-app">
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
      .et-app {
        /* The portal uses a 10px root, so sizes in this app are in px. */
        padding: 0 15px 16px;
      }
    `,
  ],
})
export class EmailTemplatesComponent extends BaseComponent {
  templateId: string | null = null;
  brandName = '';
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
