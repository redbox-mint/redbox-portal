import { AfterViewInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
declare var bootstrap: any;
import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfigService, LoggerService, TranslationService, BaseComponent } from '@researchdatabox/portal-ng-common';
import { BrandingAdminService } from './branding-admin.service';
import { BrandingPreviewComponent } from './branding-preview.component';

@Component({
  selector: 'branding-admin-root',
  templateUrl: './branding-admin.component.html',
  styleUrls: ['./branding-admin.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, BrandingPreviewComponent],
  providers: [BrandingAdminService]
})
export class BrandingAdminComponent extends BaseComponent {
  previewUrl?: SafeResourceUrl;
  previewCssUrl?: string;
  previewBaseCssUrl?: string;




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

  // Variables sourced exclusively from assets/styles/custom-variables.scss
  // Keys align exactly with SCSS variable names (without the leading $)
  colourGroups = [
    {
      name: 'Site Branding',
      help: 'Set the main background colour for the site branding area.',
      variables: [
        { key: 'site-branding-area-background-color', label: 'Site Branding Background', default: '#b1101a', help: 'Background colour for the main site branding area (top of the page).' }
      ]
    },
    {
      name: 'Header & Logo',
      help: 'Customise the header colours for your portal.',
      variables: [
        { key: 'header-branding-link-color', label: 'Header Link', default: '#222', help: 'Colour for links in the header area.' },
        { key: 'header-branding-background-color', label: 'Header Background', default: '#f4f4f4', help: 'Background colour for the header area.' },
        { key: 'header-branding-text-color', label: 'Header Text', default: '#333', help: 'Text colour for the header area.' }
      ]
    },
    {
      name: 'Menu',
      help: 'Adjust the appearance of the main menu and dropdowns, including active and inactive states.',
      variables: [
        { key: 'main-menu-branding-background-color', label: 'Main Menu Background', default: '#500005', help: 'Background colour for the main menu bar.' },
        { key: 'main-menu-inactive-item-color', label: 'Inactive Menu Text', default: '#fff', help: 'Text colour for inactive menu items.' },
        { key: 'main-menu-inactive-item-color-hover', label: 'Menu Text Hover', default: '#888', help: 'Text colour for menu items on hover.' },
        { key: 'main-menu-inactive-item-background-color', label: 'Inactive Menu Background', default: '#500005', help: 'Background colour for inactive menu items.' },
        { key: 'main-menu-inactive-item-background-color-hover', label: 'Menu Background Hover', default: '#fff', help: 'Background colour for menu items on hover.' },
        { key: 'main-menu-active-item-color', label: 'Active Menu Text', default: '#fff', help: 'Text colour for the active menu item.' },
        { key: 'main-menu-active-item-color-hover', label: 'Active Menu Text Hover', default: '#888', help: 'Text colour for the active menu item on hover.' },
        { key: 'main-menu-active-item-background-color', label: 'Active Menu Background', default: '#b1101a', help: 'Background colour for the active menu item.' },
        { key: 'main-menu-active-item-background-color-hover', label: 'Active Menu Background Hover', default: '#fff', help: 'Background colour for the active menu item on hover.' },
        { key: 'main-menu-inactive-dropdown-item-color', label: 'Dropdown Text', default: '#a9a9a9', help: 'Text colour for dropdown menu items.' },
        { key: 'main-menu-inactive-dropdown-item-color-hover', label: 'Dropdown Text Hover', default: '#888', help: 'Text colour for dropdown menu items on hover.' },
        { key: 'main-menu-inactive-dropdown-item-background-color', label: 'Dropdown Background (Inactive)', default: '#500005', help: 'Background colour for inactive dropdown items.' },
        { key: 'main-menu-active-dropdown-item-color', label: 'Active Dropdown Text', default: '#fff', help: 'Text colour for active dropdown menu items.' },
        { key: 'main-menu-active-dropdown-item-color-hover', label: 'Active Dropdown Text Hover', default: '#888', help: 'Text colour for active dropdown items on hover.' },
        { key: 'main-menu-active-dropdown-item-background-color', label: 'Active Dropdown Background', default: '#b1101a', help: 'Background colour for active dropdown menu items.' },
        { key: 'main-menu-active-dropdown-item-background-color-hover', label: 'Active Dropdown Background Hover', default: '#fff', help: 'Background colour for active dropdown items on hover.' }
      ]
    },
    {
      name: 'Content',
      help: 'Control the colours for body text and backgrounds.',
      variables: [
        { key: 'body-text-color', label: 'Body Text', default: '#333', help: 'Colour for main body text.' },
        { key: 'body-background-color', label: 'Body Background', default: '#fff', help: 'Background colour for the page body.' }
      ]
    },
    {
      name: 'Links',
      help: 'Set the default, hover, and focus colours for hyperlinks.',
      variables: [
        { key: 'anchor-color', label: 'Link Colour', default: '#337ab7', help: 'Default colour for hyperlinks.' },
        { key: 'anchor-color-hover', label: 'Link Hover', default: '#23527c', help: 'Colour for hyperlinks on hover.' },
        { key: 'anchor-color-focus', label: 'Link Focus', default: '#23527c', help: 'Colour for hyperlinks on focus.' }
      ]
    },
    {
      name: 'Panels',
      help: 'Change the background, text, and border colours for panel components.',
      variables: [
        { key: 'panel-branding-background-color', label: 'Panel Background', default: '#b1101a', help: 'Background colour for panel components.' },
        { key: 'panel-branding-color', label: 'Panel Text', default: '#fff', help: 'Text colour for panel components.' },
        { key: 'panel-branding-border-color', label: 'Panel Border', default: '#ddd', help: 'Border colour for panel components.' }
      ]
    },
    {
      name: 'Footer',
      help: 'Configure the footer background and text colours.',
      variables: [
        { key: 'footer-bottom-area-branding-background-color', label: 'Footer Background', default: '#000', help: 'Background colour for the footer area.' },
        { key: 'footer-bottom-area-branding-color', label: 'Footer Text', default: '#fff', help: 'Text colour for the footer area.' }
      ]
    },
    {
      name: 'Bootstrap Contextual',
      help: 'Override Bootstrap contextual theme colours used by utilities and components.',
      variables: [
        { key: 'primary', label: 'Primary', default: '#0d6efd', help: 'Bootstrap primary colour.' },
        { key: 'secondary', label: 'Secondary', default: '#6c757d', help: 'Bootstrap secondary colour.' },
        { key: 'success', label: 'Success', default: '#198754', help: 'Bootstrap success colour.' },
        { key: 'info', label: 'Info', default: '#0dcaf0', help: 'Bootstrap info colour.' },
        { key: 'warning', label: 'Warning', default: '#ffc107', help: 'Bootstrap warning colour.' },
        { key: 'danger', label: 'Danger', default: '#dc3545', help: 'Bootstrap danger colour.' },
        { key: 'light', label: 'Light', default: '#f8f9fa', help: 'Bootstrap light colour.' },
        { key: 'dark', label: 'Dark', default: '#212529', help: 'Bootstrap dark colour.' }
      ]
    }
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
    private brandingService: BrandingAdminService,
    private sanitizer: DomSanitizer
  ) {
    super();
    this.initDependencies = [this.i18n, this.brandingService];
  }

  protected async initComponent(): Promise<void> {
    await this.loadConfig();
    // mark component ready via BaseComponent's internal flag
    (this as any).isReady = true;
    // Initialize Bootstrap tooltips for all elements with data-bs-toggle="tooltip"
    setTimeout(() => {
      const tooltipTriggerList = Array.from(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
      tooltipTriggerList.forEach((el: any) => {
        if (!el._tooltipInstance) {
          el._tooltipInstance = new bootstrap.Tooltip(el, { html: true });
        }
      });
    }, 0);
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
      if (this.previewToken) {
        // Existing full-page preview URL (no longer used in iframe)
        this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(`/default/rdmp/researcher/home?previewToken=${this.previewToken}`);
        // New CSS preview URL for Shadow DOM preview component
        const base = this.brandingService.getBrandingAndPortalUrl();
        this.previewBaseCssUrl = `${base}/styles/style.min.css`;
        this.previewCssUrl = `${base}/preview/${this.previewToken}.css`;
      } else {
        this.previewUrl = undefined;
        this.previewCssUrl = undefined as any;
        this.previewBaseCssUrl = undefined as any;
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
