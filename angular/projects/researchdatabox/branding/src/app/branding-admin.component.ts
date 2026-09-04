import { AfterViewInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
declare var bootstrap: any;
import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseComponent, I18NextPipe, LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import { BrandingAdminService } from './branding-admin.service';
import {
  BRANDING_TYPEFACE_SLOTS,
  BrandingAdminState,
  BrandingMutationError,
  BrandingTypefaceSlot,
  BrandingVersionEntry,
} from './branding-admin.model';
import { BrandingPreviewComponent } from './branding-preview.component';

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

interface TypefaceSlotCard {
  slot: BrandingTypefaceSlot;
  label: string;
  required: boolean;
  hint: string;
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
  previewKind?: 'draft' | 'version';
  logoUrl?: string;
  faviconUrl?: string;

  // Track component initialization state without casting
  private componentReady: boolean = false;

  appName = 'branding';

  /** Canonical server state; every mutation response replaces it wholesale. */
  state: BrandingAdminState | null = null;
  // Editable colour copy of the draft (filtered to known keys).
  draftConfig: Record<string, string> = {};
  /** Unsaved local sample text for the preview; never sent to the server. */
  sampleText = '';
  /** Stale-write conflict flag with reload UX (local sample text is preserved). */
  conflict = false;
  /** Two-step restore confirmation target (retained version row ID). */
  pendingRestoreId: string | null = null;
  /** In-flight mutation keys (slot or action) to disable only affected controls. */
  inFlight = new Set<string>();

  message?: string;
  error?: string;
  // Variables sourced exclusively from assets/styles/custom-variables.scss
  // Keys align exactly with SCSS variable names (without the leading $)
  colourGroups: ColourGroup[] = [];

  readonly typefaceSlots: TypefaceSlotCard[] = [
    { slot: 'regular', label: 'Regular', required: true, hint: 'Required to publish a custom typeface' },
    { slot: 'bold', label: 'Bold', required: false, hint: 'Optional; browsers may synthesise it' },
    { slot: 'italic', label: 'Italic', required: false, hint: 'Optional; browsers may synthesise it' },
    { slot: 'boldItalic', label: 'Bold Italic', required: false, hint: 'Optional; browsers may synthesise it' },
  ];

  constructor(
    @Inject(LoggerService) private logger: LoggerService,
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
    this.faviconUrl = `${base}/images/favicon`;
    // Initialize Bootstrap tooltips for all elements with data-bs-toggle="tooltip"
    // (guarded: bootstrap JS is present in the portal layout, not in unit tests)
    setTimeout(() => {
      const globalBootstrap = (typeof bootstrap !== 'undefined' ? bootstrap : undefined) as
        | { Tooltip?: new (el: Element, opts?: Record<string, unknown>) => unknown }
        | undefined;
      if (!globalBootstrap?.Tooltip) {
        return;
      }
      const tooltipTriggerList = Array.from(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
      tooltipTriggerList.forEach((el: any) => {
        if (!el._tooltipInstance) {
          el._tooltipInstance = new globalBootstrap.Tooltip!(el, { html: true });
        }
      });
    }, 0);
    // Mark component as ready
    this.componentReady = true;
  }

  private getAllowedDraftKeys(): Set<string> {
    if (this.colourGroups.length === 0) {
      this.initializeColourGroups();
    }
    return new Set(this.colourGroups.flatMap(group => group.variables.map(variable => variable.key)));
  }

  private filterDraftVariables(variables?: Record<string, string>): Record<string, string> {
    const allowedDraftKeys = this.getAllowedDraftKeys();
    return Object.fromEntries(
      Object.entries(variables || {}).filter(([key, value]) => allowedDraftKeys.has(key) && typeof value === 'string')
    );
  }

  get draftRevision(): number {
    return this.state?.draft.revision ?? 0;
  }

  get activeVersion(): number {
    return this.state?.active.version ?? 0;
  }

  get draftTypefaceMode(): 'default' | 'custom' {
    return this.state?.draft.typeface.mode ?? 'default';
  }

  get customIncomplete(): boolean {
    const faces = this.state?.draft.typeface.faces;
    return this.draftTypefaceMode === 'custom' && !faces?.regular;
  }

  get versions(): BrandingVersionEntry[] {
    return this.state?.versions ?? [];
  }

  isBusy(key: string): boolean {
    return this.inFlight.has(key);
  }

  faceFor(slot: BrandingTypefaceSlot) {
    return this.state?.draft.typeface.faces?.[slot];
  }

  private replaceState(state: BrandingAdminState): void {
    this.state = state;
    this.draftConfig = this.filterDraftVariables(state.draft.variables);
    this.conflict = false;
    this.pendingRestoreId = null;
  }

  private handleMutationError(error: any, action: string): void {
    const mutation = error as Partial<BrandingMutationError>;
    if (mutation?.kind === 'conflict') {
      this.conflict = true;
      this.message = undefined;
      this.error = 'Another administrator changed the shared draft. Reload to get the latest state; your sample text is kept.';
    } else if (mutation?.kind === 'limit') {
      this.error = `Upload too large: ${mutation.message || 'the configured typeface size limit was exceeded'}`;
    } else {
      const serverMessage = error?.error?.message || error?.message || error;
      this.error = `Failed to ${action}: ${serverMessage}`;
    }
    this.logger.error(this.error);
  }

  private async runMutation<T>(key: string, action: string, work: () => Promise<T>): Promise<T | undefined> {
    if (this.inFlight.has(key)) {
      return undefined;
    }
    this.inFlight.add(key);
    this.message = this.error = undefined;
    try {
      return await work();
    } catch (error: any) {
      this.handleMutationError(error, action);
      return undefined;
    } finally {
      this.inFlight.delete(key);
    }
  }

  async loadConfig() {
    try {
      const state = await this.brandingService.loadConfig();
      this.replaceState(state);
    } catch (e: any) {
      this.error = `Failed to load config: ${e?.message || e}`;
      this.logger.error(this.error);
    }
  }

  /** Reload canonical state after a conflict without losing local sample text. */
  async reloadState() {
    this.conflict = false;
    this.message = this.error = undefined;
    await this.loadConfig();
  }

  private initializeColourGroups() {
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
          { key: 'site-branding-area-background-color', label: this.i18n.t('branding-site-branding-background-color-label'), default: '#b1101a', help: this.i18n.t('branding-site-branding-background-color-help') },
          { key: 'logo-heading-text-color', label: this.i18n.t('branding-logo-heading-text-color-label'), default: '#ffffff', help: this.i18n.t('branding-logo-heading-text-color-help') }
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
    const state = await this.runMutation('save-draft', 'save draft', () =>
      this.brandingService.saveColourDraft(this.draftConfig, this.draftRevision)
    );
    if (state) {
      this.replaceState(state);
      this.clearPreview();
      this.message = 'Draft saved';
    }
  }

  async createPreview() {
    const preview = await this.runMutation('preview', 'generate preview', () =>
      this.brandingService.createPreview(this.draftRevision)
    );
    if (preview) {
      this.previewKind = 'draft';
      const base = this.brandingService.getBrandingAndPortalUrl();
      this.previewBaseCssUrl = `${base}/styles/style.min.css`;
      this.previewCssUrl = `${base}/preview/${preview.token}.css`;
      this.message = 'Preview generated';
    }
  }

  async previewVersionEntry(version: BrandingVersionEntry) {
    const preview = await this.runMutation(`preview-${version.id}`, 'preview version', () =>
      this.brandingService.previewVersion(version.id)
    );
    if (preview) {
      this.previewKind = 'version';
      const base = this.brandingService.getBrandingAndPortalUrl();
      this.previewBaseCssUrl = `${base}/styles/style.min.css`;
      this.previewCssUrl = `${base}/preview/${preview.token}.css`;
      this.message = `Previewing version ${version.version}`;
    }
  }

  async publish() {
    const state = await this.runMutation('publish', 'publish', () =>
      this.brandingService.publish(this.activeVersion, this.draftRevision)
    );
    if (state) {
      this.replaceState(state);
      this.clearPreview();
      this.message = state.idempotent ? 'Already published: no changes' : 'Branding published';
    }
  }

  async uploadFace(slot: BrandingTypefaceSlot, event: any) {
    const file: File | undefined = event?.target?.files?.[0];
    if (!file) {
      return;
    }
    // Reset the input so the same file can be chosen again.
    if (event?.target) {
      event.target.value = '';
    }
    const state = await this.runMutation(`face-${slot}`, 'upload typeface face', () =>
      this.brandingService.uploadFace(slot, file, file.name, this.draftRevision)
    );
    if (state) {
      this.replaceState(state);
      this.clearPreview();
      this.message = `${slot} face uploaded`;
    }
  }

  async removeFace(slot: BrandingTypefaceSlot) {
    const state = await this.runMutation(`face-${slot}`, 'remove typeface face', () =>
      this.brandingService.removeFace(slot, this.draftRevision)
    );
    if (state) {
      this.replaceState(state);
      this.clearPreview();
      this.message = `${slot} face removed`;
    }
  }

  async useDefaultTypography() {
    const state = await this.runMutation('use-default', 'switch to Default Typography', () =>
      this.brandingService.useDefaultTypography(this.draftRevision)
    );
    if (state) {
      this.replaceState(state);
      this.clearPreview();
      this.message = 'Draft set to Default Typography (publish to apply)';
    }
  }

  async revertTypefaceDraft() {
    const state = await this.runMutation('revert-typeface', 'revert typeface draft', () =>
      this.brandingService.revertTypefaceDraft(this.draftRevision)
    );
    if (state) {
      this.replaceState(state);
      this.clearPreview();
      this.message = 'Typeface draft reverted to the active typeface';
    }
  }

  confirmRestore(versionId: string) {
    this.pendingRestoreId = versionId;
  }

  cancelRestore() {
    this.pendingRestoreId = null;
  }

  /** A draft mutation invalidates any displayed preview: its CSS is bound to an older draft revision. */
  private clearPreview(): void {
    this.previewCssUrl = undefined;
    this.previewBaseCssUrl = undefined;
    this.previewKind = undefined;
  }

  async restoreVersion(version: BrandingVersionEntry) {
    const restored = await this.runMutation(`restore-${version.id}`, 'restore version', () =>
      this.brandingService.restore(version.id, this.activeVersion, this.draftRevision)
    );
    if (restored) {
      this.replaceState(restored);
      this.clearPreview();
      this.message = `Version ${version.version} restored as the new active version`;
    }
  }

  async uploadLogo(event: any) {
    const file: File | undefined = event?.target?.files?.[0];
    if (!file) {
      return;
    }
    await this.runMutation('logo', 'upload logo', async () => {
      const formData = new FormData();
      formData.append('logo', file);
      await this.brandingService.uploadLogo(formData);
      this.message = 'Logo uploaded';
    });
  }

  async uploadFavicon(event: any) {
    const file: File | undefined = event?.target?.files?.[0];
    if (!file) {
      return;
    }
    await this.runMutation('favicon', 'upload favicon', async () => {
      const formData = new FormData();
      formData.append('favicon', file);
      await this.brandingService.uploadFavicon(formData);
      this.message = 'Favicon uploaded';
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

  resetDraft() {
    if (!this.state) {
      return;
    }
    this.draftConfig = this.filterDraftVariables(this.state.draft.variables);
    this.message = 'Draft reset to saved values';
  }

  typefaceSummary(typeface: BrandingAdminState['draft']['typeface']): string {
    if (typeface.mode !== 'custom') {
      return 'Default Typography';
    }
    const present = BRANDING_TYPEFACE_SLOTS.filter(slot => typeface.faces?.[slot]);
    return present.length > 0 ? `Custom (${present.join(', ')})` : 'Custom (incomplete)';
  }

  // Expose readiness to template
  get initialized() { return this.componentReady; }
}
