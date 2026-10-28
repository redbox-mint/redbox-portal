import { Component, ElementRef, HostListener, Inject } from '@angular/core';
import { BaseComponent, I18NextPipe, LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import { CatalogueComponent } from './catalogue.component';
import { EditorComponent } from './editor.component';
import { EmailTemplateAdminService } from './email-template-admin.service';
import { RAW_INTERPOLATION, type EmailPreviewRecord } from './email-templates.model';

const TEMPLATE_HASH = /^#\/templates\/(.+)$/;

/**
 * Email templates Admin app. The catalogue and the editor share one page;
 * the open template lives in the URL hash (`#/templates/<id>`) so it can be
 * bookmarked and the browser Back button returns to the catalogue.
 */
@Component({
  selector: 'email-templates-root',
  standalone: true,
  imports: [I18NextPipe, CatalogueComponent, EditorComponent],
  providers: [EmailTemplateAdminService],
  template: `
    @if (ready) {
      <div class="et-app">
        @if (templateId) {
          <email-templates-editor
            [templateId]="templateId"
            [brandName]="brandName"
            [initialRecord]="previewRecord"
            (recordChange)="previewRecord = $event"
            (back)="openCatalogue()"
          ></email-templates-editor>
        } @else {
          <div class="card panel-style panel-default et-card">
            <div class="card-header et-card-header">
              <h1 class="card-title et-card-title">
                <i class="fa-regular fa-envelope me-2" aria-hidden="true"></i>{{ 'email-templates-heading' | i18next }}
              </h1>
              @if (brandName) {
                <span class="et-brand">{{
                  'email-templates-brand' | i18next: { brand: brandName, interpolation: raw }
                }}</span>
              }
            </div>
            <div class="card-body et-card-body">
              <email-templates-catalogue (openTemplate)="openTemplate($event)"></email-templates-catalogue>
            </div>
          </div>
        }
      </div>
    }
  `,
  styleUrls: ['./email-templates.shared.scss'],
  styles: [
    `
      .et-app {
        /* The portal uses a 10px root; keep this app at its native 16px text size. */
        font-size: 16px;
        padding: 0 15px 16px;
      }
      .et-brand {
        padding: 2px 10px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.18);
        color: inherit;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
      }
    `,
  ],
})
export class EmailTemplatesComponent extends BaseComponent {
  readonly raw = RAW_INTERPOLATION;
  templateId: string | null = null;
  brandName = '';
  previewRecord: EmailPreviewRecord | null = null;
  ready = false;

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
    this.readHash();
    this.ready = true;
    this.logger.debug('Email templates app initialised');
  }

  @HostListener('window:hashchange')
  @HostListener('window:popstate')
  readHash(): void {
    const match = TEMPLATE_HASH.exec(window.location.hash);
    let templateId: string | null = null;
    if (match) {
      try {
        templateId = decodeURIComponent(match[1]);
      } catch {
        templateId = null;
      }
    }
    this.templateId = templateId;
  }

  openTemplate(templateId: string): void {
    window.location.hash = `#/templates/${encodeURIComponent(templateId)}`;
    this.templateId = templateId;
    window.scrollTo({ top: 0 });
  }

  openCatalogue(): void {
    if (window.location.hash) {
      history.pushState(null, '', window.location.pathname + window.location.search);
    }
    this.templateId = null;
  }
}
