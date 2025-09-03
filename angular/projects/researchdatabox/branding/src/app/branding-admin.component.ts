import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfigService, LoggerService, TranslationService, BaseComponent } from '@researchdatabox/portal-ng-common';
import { BrandingAdminService } from './branding-admin.service';

@Component({
  selector: 'branding-admin-root',
  templateUrl: './branding-admin.component.html',
  styleUrls: ['./branding-admin.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [BrandingAdminService]
})
export class BrandingAdminComponent extends BaseComponent {
  appName = 'branding';

  // current config state
  draftConfig: any = {};
  publishedConfig: any = {};
  previewToken?: string;
  savingDraft = false;
  publishing = false;
  generatingPreview = false;
  logoUploading = false;
  message?: string;
  error?: string;
  showJsonView = false;

  // Variable definitions for form fields
  colorVariables = [
    { key: 'site-branding-area-background', label: 'Site Branding Background', default: '#ffffff' },
    { key: 'site-branding-area-heading-color', label: 'Site Branding Heading', default: '#333333' },
    { key: 'panel-branding-background-color', label: 'Panel Background', default: '#f8f9fa' },
    { key: 'panel-branding-color', label: 'Panel Text', default: '#212529' },
    { key: 'panel-branding-border-color', label: 'Panel Border', default: '#dee2e6' },
    { key: 'main-menu-branding-background-color', label: 'Main Menu Background', default: '#007bff' },
    { key: 'header-branding-link-color', label: 'Header Link', default: '#ffffff' },
    { key: 'header-branding-background-color', label: 'Header Background', default: '#343a40' },
    { key: 'logo-link-color-branding', label: 'Logo Link', default: '#ffffff' },
    { key: 'main-menu-active-item-color', label: 'Active Menu Text', default: '#ffffff' },
    { key: 'main-menu-active-item-background-color', label: 'Active Menu Background', default: '#0056b3' },
    { key: 'main-menu-inactive-item-color', label: 'Inactive Menu Text', default: '#ffffff' },
    { key: 'main-menu-inactive-item-color-hover', label: 'Menu Text Hover', default: '#ffffff' },
    { key: 'main-menu-inactive-item-background-color-hover', label: 'Menu Background Hover', default: '#0056b3' },
    { key: 'main-menu-inactive-item-background-color', label: 'Inactive Menu Background', default: 'transparent' },
    { key: 'main-menu-inactive-dropdown-item-color', label: 'Dropdown Text', default: '#212529' },
    { key: 'main-menu-inactive-dropdown-item-color-hover', label: 'Dropdown Text Hover', default: '#16181b' },
    { key: 'main-menu-active-dropdown-item-color', label: 'Active Dropdown Text', default: '#ffffff' },
    { key: 'main-menu-active-dropdown-item-color-hover', label: 'Active Dropdown Text Hover', default: '#ffffff' },
    { key: 'main-menu-active-dropdown-item-background-color-hover', label: 'Active Dropdown Background Hover', default: '#0056b3' },
    { key: 'main-menu-selected-item-color', label: 'Selected Menu Text', default: '#ffffff' },
    { key: 'main-menu-selected-item-background-color', label: 'Selected Menu Background', default: '#0056b3' },
    { key: 'footer-bottom-area-branding-background-color', label: 'Footer Background', default: '#343a40' },
    { key: 'footer-bottom-area-branding-color', label: 'Footer Text', default: '#ffffff' },
    { key: 'main-content-heading-text-branding-color', label: 'Content Heading', default: '#333333' },
    { key: 'anchor-color', label: 'Link Color', default: '#007bff' },
    { key: 'anchor-color-hover', label: 'Link Hover', default: '#0056b3' },
    { key: 'anchor-color-focus', label: 'Link Focus', default: '#0056b3' },
    { key: 'primary-color', label: 'Primary Color', default: '#007bff' },
    { key: 'primary-text-color', label: 'Primary Text', default: '#ffffff' },
    { key: 'secondary-color', label: 'Secondary Color', default: '#6c757d' },
    { key: 'secondary-text-color', label: 'Secondary Text', default: '#ffffff' },
    { key: 'accent-color', label: 'Accent Color', default: '#28a745' },
    { key: 'accent-text-color', label: 'Accent Text', default: '#ffffff' },
    { key: 'surface-color', label: 'Surface Color', default: '#ffffff' },
    { key: 'body-text-color', label: 'Body Text', default: '#212529' },
    { key: 'heading-text-color', label: 'Heading Text', default: '#333333' }
  ];

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
    private brandingService: BrandingAdminService
  ) {
    super();
    this.initDependencies = [this.i18n, this.brandingService];
  }

  protected async initComponent(): Promise<void> {
    await this.loadConfig();
    // mark component ready via BaseComponent's internal flag
    (this as any).isReady = true;
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

  async saveDraft() {
    this.savingDraft = true; this.message = this.error = undefined;
    try {
      const res: any = await this.brandingService.saveDraft(this.draftConfig);
      this.message = 'Draft saved';
      this.logger.debug(`Draft saved ${JSON.stringify(res)}`);
      // Update published config if response contains branding data
      if (res?.branding) {
        this.publishedConfig = res.branding;
      }
    } catch (e: any) {
      this.error = `Failed to save draft: ${e?.message || e}`;
      this.logger.error(this.error);
    } finally { this.savingDraft = false; }
  }

  async createPreview() {
    this.generatingPreview = true; this.message = this.error = undefined;
    try {
      const res: any = await this.brandingService.createPreview(this.draftConfig);
      this.previewToken = res?.token || res?.previewToken;
      this.message = 'Preview generated';
    } catch (e: any) {
      this.error = `Failed to generate preview: ${e?.message || e}`;
      this.logger.error(this.error);
    } finally { this.generatingPreview = false; }
  }

  async publish() {
    this.publishing = true; this.message = this.error = undefined;
    try {
      const res: any = await this.brandingService.publish(this.draftConfig);
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
  get initialized() { return (this as any).isReady; }
}
