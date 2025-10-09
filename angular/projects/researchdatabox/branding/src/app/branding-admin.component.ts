import { AfterViewInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
declare var bootstrap: any;
import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfigService, LoggerService, TranslationService, BaseComponent } from '@researchdatabox/portal-ng-common';
import { BrandingAdminService } from './branding-admin.service';
import { BrandingPreviewComponent } from './branding-preview.component';
import { I18NextPipe } from 'angular-i18next';

/**
 * Represents a single colour/styling variable with its metadata
 */
interface ColourVariable {
  key: string;
  label: string;
  default: string;
  help: string;
}

/**
 * Represents a group of related colour/styling variables
 */
interface ColourGroup {
  name: string;
  help: string;
  variables: ColourVariable[];
}

/**
 * Represents the branding configuration structure
 */
interface BrandingConfig {
  variables?: Record<string, string>;
  version?: string; // Version for optimistic concurrency control
  [key: string]: any; // Allow additional properties from server response
}

@Component({
  selector: 'branding-admin-root',
  templateUrl: './branding-admin.component.html',
  styleUrls: ['./branding-admin.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, BrandingPreviewComponent, I18NextPipe],
  providers: [BrandingAdminService]
})
export class BrandingAdminComponent extends BaseComponent {
  previewUrl?: SafeResourceUrl;
  previewCssUrl?: string;
  previewBaseCssUrl?: string;
  logoUrl?: string;
  
  // Track component initialization state without casting
  private componentReady: boolean = false;




  appName = 'branding';

  // current config state
  draftConfig: Record<string, string> = {};
  publishedConfig: BrandingConfig = {};
  previewToken?: string;
  savingDraft = false;
  publishing = false;
  generatingPreview = false;
  logoUploading = false;
  message?: string;
  error?: string;
  showJsonView = false;

  // Variables sourced exclusively from assets/styles/custom-variables.scss
  // Keys align exactly with SCSS variable names (without the leading $)
  colourGroups: ColourGroup[] = [];

  fontVariables = [
    { key: 'branding-font-family', label: 'Main Font Family', default: '' },
    { key: 'branding-main-menu-font-family', label: 'Menu Font Family', default: '' },
    { key: 'branding-footer-font-family', label: 'Footer Font Family', default: '' },
    { key: 'branding-main-content-heading-font-family', label: 'Heading Font Family', default: '' }
  ];

  sizeVariables = [
    { key: 'input-btn-font-size', label: 'Button Font Size', default: '1rem', placeholder: '1rem', unit: '' },
    { key: 'input-btn-padding-y', label: 'Button Vertical Padding', default: '0.5rem', placeholder: '0.5rem', unit: '' },
    { key: 'input-btn-padding-x', label: 'Button Horizontal Padding', default: '1rem', placeholder: '1rem', unit: '' }
  ];

  fontOptions = [
    { value: 'Arial, sans-serif', label: 'Arial' },
    { value: 'Helvetica, Arial, sans-serif', label: 'Helvetica' },
    { value: '"Times New Roman", serif', label: 'Times New Roman' },
    { value: 'Georgia, serif', label: 'Georgia' },
    { value: '"Courier New", monospace', label: 'Courier New' },
    { value: 'Verdana, sans-serif', label: 'Verdana' },
    { value: '"Trebuchet MS", sans-serif', label: 'Trebuchet MS' },
    { value: '"Arial Black", sans-serif', label: 'Arial Black' },
    { value: 'Impact, sans-serif', label: 'Impact' },
    { value: '"Lucida Console", monospace', label: 'Lucida Console' },
    { value: '"Open Sans", sans-serif', label: 'Open Sans' },
    { value: '"Roboto", sans-serif', label: 'Roboto' },
    { value: '"Lato", sans-serif', label: 'Lato' },
    { value: '"Montserrat", sans-serif', label: 'Montserrat' },
    { value: '"Source Sans Pro", sans-serif', label: 'Source Sans Pro' }
  ];

  constructor(
    @Inject(LoggerService) private logger: LoggerService,
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(TranslationService) private i18n: TranslationService,
    private brandingService: BrandingAdminService,
    private sanitizer: DomSanitizer
  ) {
    super();
    this.initDependencies = [this.i18n, this.brandingService];
  }

  protected async initComponent(): Promise<void> {
    await this.loadConfig();
    this.initializeColourGroups();
    // Set logo URL
    const base = this.brandingService.getBrandingAndPortalUrl();
    this.logoUrl = `${base}/images/logo`;
    // Initialize Bootstrap tooltips for all elements with data-bs-toggle="tooltip"
    setTimeout(() => {
      const tooltipTriggerList = Array.from(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
      tooltipTriggerList.forEach((el: any) => {
        if (!el._tooltipInstance) {
          el._tooltipInstance = new bootstrap.Tooltip(el, { html: true });
        }
      });
    }, 0);
    // Mark component as ready
    this.componentReady = true;
  }

  async loadConfig() {
    try {
      const response = await this.brandingService.loadConfig();
      this.publishedConfig = response?.branding || {};
      // Initialize draft with current variables or empty object
      this.draftConfig = { ...(this.publishedConfig.variables || {}) };
    } catch (e: any) {
      this.error = `Failed to load config: ${e?.message || e}`;
      this.logger.error(this.error);
    }
  }

  private initializeColourGroups() {
    // Variables sourced exclusively from assets/styles/custom-variables.scss
    // Keys align exactly with SCSS variable names (without the leading $)
    this.colourGroups = [
      {
        name: this.i18n.t('branding-header-name'),
        help: this.i18n.t('branding-header-help'),
        variables: [
          { key: 'header-branding-text-color', label: this.i18n.t('branding-header-text-color-label'), default: '#333', help: this.i18n.t('branding-header-text-color-help') },
          { key: 'header-branding-link-color', label: this.i18n.t('branding-header-link-color-label'), default: '#222', help: this.i18n.t('branding-header-link-color-help') },
          { key: 'header-branding-background-color', label: this.i18n.t('branding-header-background-color-label'), default: '#f4f4f4', help: this.i18n.t('branding-header-background-color-help') }
        ]
      },
      {
        name: this.i18n.t('branding-site-branding-name'),
        help: this.i18n.t('branding-site-branding-help'),
        variables: [
          { key: 'site-branding-area-background-color', label: this.i18n.t('branding-site-branding-background-color-label'), default: '#b1101a', help: this.i18n.t('branding-site-branding-background-color-help') }
        ]
      },
      {
        name: this.i18n.t('branding-menu-name'),
        help: this.i18n.t('branding-menu-help'),
        variables: [
          { key: 'main-menu-branding-background-color', label: this.i18n.t('branding-main-menu-background-color-label'), default: '#500005', help: this.i18n.t('branding-main-menu-background-color-help') },
          { key: 'main-menu-active-item-color', label: this.i18n.t('branding-main-menu-active-item-color-label'), default: '#ffffff', help: this.i18n.t('branding-main-menu-active-item-color-help') },
          { key: 'main-menu-active-item-color-hover', label: this.i18n.t('branding-main-menu-active-item-color-hover-label'), default: '#888', help: this.i18n.t('branding-main-menu-active-item-color-hover-help') },
          { key: 'main-menu-active-item-background-color', label: this.i18n.t('branding-main-menu-active-item-background-color-label'), default: '#b1101a', help: this.i18n.t('branding-main-menu-active-item-background-color-help') },
          { key: 'main-menu-active-item-background-color-hover', label: this.i18n.t('branding-main-menu-active-item-background-color-hover-label'), default: '#ffffff', help: this.i18n.t('branding-main-menu-active-item-background-color-hover-help') },
          { key: 'main-menu-inactive-item-color', label: this.i18n.t('branding-main-menu-inactive-item-color-label'), default: '#ffffff', help: this.i18n.t('branding-main-menu-inactive-item-color-help') },
          { key: 'main-menu-inactive-item-color-hover', label: this.i18n.t('branding-main-menu-inactive-item-color-hover-label'), default: '#888', help: this.i18n.t('branding-main-menu-inactive-item-color-hover-help') },
          { key: 'main-menu-inactive-item-background-color', label: this.i18n.t('branding-main-menu-inactive-item-background-color-label'), default: '#500005', help: this.i18n.t('branding-main-menu-inactive-item-background-color-help') },
          { key: 'main-menu-inactive-item-background-color-hover', label: this.i18n.t('branding-main-menu-inactive-item-background-color-hover-label'), default: '#ffffff', help: this.i18n.t('branding-main-menu-inactive-item-background-color-hover-help') },
          
          { key: 'main-menu-active-dropdown-item-color', label: this.i18n.t('branding-main-menu-active-dropdown-item-color-label'), default: '#ffffff', help: this.i18n.t('branding-main-menu-active-dropdown-item-color-help') },
          { key: 'main-menu-active-dropdown-item-color-hover', label: this.i18n.t('branding-main-menu-active-dropdown-item-color-hover-label'), default: '#888', help: this.i18n.t('branding-main-menu-active-dropdown-item-color-hover-help') },
          { key: 'main-menu-active-dropdown-item-background-color', label: this.i18n.t('branding-main-menu-active-dropdown-item-background-color-label'), default: '#b1101a', help: this.i18n.t('branding-main-menu-active-dropdown-item-background-color-help') },
          { key: 'main-menu-active-dropdown-item-background-color-hover', label: this.i18n.t('branding-main-menu-active-dropdown-item-background-color-hover-label'), default: '#ffffff', help: this.i18n.t('branding-main-menu-active-dropdown-item-background-color-hover-help') },

          { key: 'main-menu-inactive-dropdown-item-color', label: this.i18n.t('branding-main-menu-inactive-dropdown-item-color-label'), default: '#a9a9a9', help: this.i18n.t('branding-main-menu-inactive-dropdown-item-color-help') },
          { key: 'main-menu-inactive-dropdown-item-color-hover', label: this.i18n.t('branding-main-menu-inactive-dropdown-item-color-hover-label'), default: '#888', help: this.i18n.t('branding-main-menu-inactive-dropdown-item-color-hover-help') },
          { key: 'main-menu-inactive-dropdown-item-background-color', label: this.i18n.t('branding-main-menu-inactive-dropdown-item-background-color-label'), default: '#222', help: this.i18n.t('branding-main-menu-inactive-dropdown-item-background-color-help') }
        ]
      },
      {
        name: this.i18n.t('branding-content-name'),
        help: this.i18n.t('branding-content-help'),
        variables: [
          { key: 'body-text-color', label: this.i18n.t('branding-body-text-color-label'), default: '#333', help: this.i18n.t('branding-body-text-color-help') },
          { key: 'body-background-color', label: this.i18n.t('branding-body-background-color-label'), default: '#ffffff', help: this.i18n.t('branding-body-background-color-help') }
        ]
      },
      {
        name: this.i18n.t('branding-links-name'),
        help: this.i18n.t('branding-links-help'),
        variables: [
          { key: 'anchor-color', label: this.i18n.t('branding-anchor-color-label'), default: '#337ab7', help: this.i18n.t('branding-anchor-color-help') },
          { key: 'anchor-color-hover', label: this.i18n.t('branding-anchor-color-hover-label'), default: '#23527c', help: this.i18n.t('branding-anchor-color-hover-help') },
          { key: 'anchor-color-focus', label: this.i18n.t('branding-anchor-color-focus-label'), default: '#23527c', help: this.i18n.t('branding-anchor-color-focus-help') }
        ]
      },
      {
        name: this.i18n.t('branding-panels-name'),
        help: this.i18n.t('branding-panels-help'),
        variables: [
          { key: 'panel-branding-background-color', label: this.i18n.t('branding-panel-background-color-label'), default: '#b1101a', help: this.i18n.t('branding-panel-background-color-help') },
          { key: 'panel-branding-color', label: this.i18n.t('branding-panel-text-color-label'), default: '#ffffff', help: this.i18n.t('branding-panel-text-color-help') },
          { key: 'panel-branding-border-color', label: this.i18n.t('branding-panel-border-color-label'), default: '#ddd', help: this.i18n.t('branding-panel-border-color-help') }
        ]
      },
      {
        name: this.i18n.t('branding-footer-name'),
        help: this.i18n.t('branding-footer-help'),
        variables: [
          { key: 'footer-bottom-area-branding-background-color', label: this.i18n.t('branding-footer-background-color-label'), default: '#000', help: this.i18n.t('branding-footer-background-color-help') },
          { key: 'footer-bottom-area-branding-color', label: this.i18n.t('branding-footer-text-color-label'), default: '#ffffff', help: this.i18n.t('branding-footer-text-color-help') }
        ]
      },
      {
        name: this.i18n.t('branding-bootstrap-contextual-name'),
        help: this.i18n.t('branding-bootstrap-contextual-help'),
        variables: [
          { key: 'primary', label: this.i18n.t('branding-primary-label'), default: '#0d6efd', help: this.i18n.t('branding-primary-help') },
          { key: 'secondary', label: this.i18n.t('branding-secondary-label'), default: '#6c757d', help: this.i18n.t('branding-secondary-help') },
          { key: 'success', label: this.i18n.t('branding-success-label'), default: '#198754', help: this.i18n.t('branding-success-help') },
          { key: 'info', label: this.i18n.t('branding-info-label'), default: '#0dcaf0', help: this.i18n.t('branding-info-help') },
          { key: 'warning', label: this.i18n.t('branding-warning-label'), default: '#ffc107', help: this.i18n.t('branding-warning-help') },
          { key: 'danger', label: this.i18n.t('branding-danger-label'), default: '#dc3545', help: this.i18n.t('branding-danger-help') },
          { key: 'light', label: this.i18n.t('branding-light-label'), default: '#f8f9fa', help: this.i18n.t('branding-light-help') },
          { key: 'dark', label: this.i18n.t('branding-dark-label'), default: '#212529', help: this.i18n.t('branding-dark-help') }
        ]
      }
    ];
  }

  async saveDraft() {
    this.savingDraft = true; this.message = this.error = undefined;
    try {
      const res: any = await this.brandingService.saveDraft(this.draftConfig);
        this.previewCssUrl = undefined;
        this.previewBaseCssUrl = undefined;
      // Update published config if response contains branding data
      if (res?.branding) {
        this.publishedConfig = res.branding;
      }
    } catch (e: any) {
      // Prefer server-provided message (e.error.message) when available to surface
      // validation details like 'contrast-violation'. Fallback to generic error.
      const serverMsg = e?.error?.message || e?.error?.error;
      const msg = serverMsg || e?.message || e;
      this.error = `Failed to save draft: ${msg}`;
      this.logger.error(this.error);
    } finally { this.savingDraft = false; }
  }

  async createPreview() {
    this.generatingPreview = true; this.message = this.error = undefined;
    try {
  const res: any = await this.brandingService.createPreview();
      this.previewToken = res?.token || res?.previewToken;
      if (this.previewToken) {
        // Existing full-page preview URL (no longer used in iframe)
        this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(`/default/rdmp/researcher/home?previewToken=${this.previewToken}`);
        // New CSS preview URL for Shadow DOM preview component
        const base = this.brandingService.getBrandingAndPortalUrl();
        this.previewBaseCssUrl = `${base}/styles/style.min.css`;
        this.previewCssUrl = `${base}/preview/${this.previewToken}.css`;
      } else {
        this.previewUrl = undefined;
        this.previewCssUrl = undefined;
        this.previewBaseCssUrl = undefined;
      }
      this.message = 'Preview generated';
    } catch (e: any) {
      this.error = `Failed to generate preview: ${e?.message || e}`;
      this.logger.error(this.error);
    } finally { this.generatingPreview = false; }
  }

  async publish() {
    this.publishing = true; this.message = this.error = undefined;
    try {
      const res: any = await this.brandingService.publish(this.draftConfig, this.publishedConfig.version);
      this.message = 'Branding published';
      // Reload the full configuration after publish
      await this.loadConfig();
    } catch (e: any) {
      this.error = `Failed to publish: ${e?.message || e}`;
      this.logger.error(this.error);
    } finally { this.publishing = false; }
  }

  async uploadLogo(event: any) {
    const file: File | undefined = event?.target?.files?.[0];
    if (!file) { return; }
    this.logoUploading = true; this.message = this.error = undefined;
    try {
      const formData = new FormData();
      formData.append('logo', file);
      await this.brandingService.uploadLogo(formData);
      this.message = 'Logo uploaded';
    } catch (e: any) {
      this.error = `Failed to upload logo: ${e?.message || e}`;
      this.logger.error(this.error);
    } finally { this.logoUploading = false; }
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      this.message = 'Preview token copied to clipboard';
    }).catch(() => {
      this.error = 'Failed to copy to clipboard';
    });
  }

  updateVariable(key: string, event: any) {
    const value = event.target.value;
    if (value) {
      this.draftConfig[key] = value;
    } else {
      delete this.draftConfig[key];
    }
  }

  resetToDefaults() {
    this.draftConfig = {};
    this.message = 'All variables reset to defaults';
  }

  updateFromJson(event: any) {
    try {
      const jsonValue = event.target.value;
      if (jsonValue.trim()) {
        this.draftConfig = JSON.parse(jsonValue);
      } else {
        this.draftConfig = {};
      }
      this.error = undefined;
    } catch (e: any) {
      this.error = 'Invalid JSON format';
    }
  }

  resetDraft() {
    this.draftConfig = { ...(this.publishedConfig.variables || {}) };
    this.message = 'Draft reset to published config';
  }

  // Expose readiness to template
  get initialized() { return this.componentReady; }
}
