import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfigService, LoggerService, TranslationService, BaseComponent } from '@researchdatabox/portal-ng-common';
import { BrandingAdminService } from './branding-admin.service';

@Component({
  selector: 'branding-admin-root',
  templateUrl: './branding-admin.component.html',
  styleUrls: ['./branding-admin.component.scss'],
  standalone: true,
  imports: [CommonModule],
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
      this.publishedConfig = await this.brandingService.loadConfig();
      this.draftConfig = { ...this.publishedConfig };
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
    } catch (e: any) {
      this.error = `Failed to save draft: ${e?.message || e}`;
      this.logger.error(this.error);
    } finally { this.savingDraft = false; }
  }

  async createPreview() {
    this.generatingPreview = true; this.message = this.error = undefined;
    try {
      const res: any = await this.brandingService.createPreview(this.draftConfig);
      this.previewToken = res?.token;
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
      this.publishedConfig = res?.config || this.draftConfig;
      this.message = 'Branding published';
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

  resetDraft() {
    this.draftConfig = { ...this.publishedConfig };
    this.message = 'Draft reset to published config';
  }

  // Expose readiness to template
  get initialized() { return (this as any).isReady; }
}
