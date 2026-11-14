import { Component, ElementRef, Inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { BaseComponent, TranslationService } from '@researchdatabox/portal-ng-common';
import { McpConnectApiService, McpSetupStatus, McpConnection } from './mcp-connect-api.service';
import { harnesses, harnessGuide, mcpServerName, HarnessId } from './harness-guides';

@Component({
  selector: 'mcp-connect',
  templateUrl: './mcp-connect.component.html',
  styleUrls: ['./mcp-connect.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class McpConnectComponent extends BaseComponent {
  readonly harnesses = harnesses;
  readonly groups = ['local', 'cloud', 'other'] as const;
  readonly checks = ['configuration', 'reporting', 'account', 'records'] as const;
  readonly wikiUrl = 'https://github.com/redbox-mint/redbox-portal/wiki/AI-Reporting-and-MCP';
  // The portal layout sets <base href>, so bare "#id" links resolve against the site root.
  private readonly pagePath = window.location.pathname + window.location.search;
  selectedHarness: HarnessId = 'claude-code';
  selectedRecordType = '';
  status?: McpSetupStatus;
  refreshing = false;
  refreshError = false;
  copyMessage = '';
  copyStates: Record<string, 'copied' | 'failed'> = {};
  private cachedGuide?: { connection: McpConnection; id: HarnessId; guide: ReturnType<typeof harnessGuide> };
  private copyTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private copyRevision = new Map<string, number>();
  earlyHeader: {
    title: string;
    description: string;
    adminLabel: string;
    adminUrl: string;
    section?: string;
    breadcrumbLabel: string;
  };

  constructor(
    @Inject(ElementRef) element: ElementRef<HTMLElement>,
    @Inject(McpConnectApiService) private api: McpConnectApiService,
    @Inject(TranslationService) private translations: TranslationService,
    @Inject(ChangeDetectorRef) private cdr: ChangeDetectorRef
  ) {
    super();
    this.earlyHeader = JSON.parse(element.nativeElement.getAttribute('data-header') || '{}');
    this.initDependencies = [api, translations];
    try {
      const stored = localStorage.getItem('redbox.mcp.assistant');
      if (harnesses.some(harness => harness.id === stored)) this.selectedHarness = stored as HarnessId;
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
  }

  protected async initComponent(): Promise<void> {
    this.applyStatus(await this.api.status());
  }

  private applyStatus(status: McpSetupStatus): void {
    this.status = status;
    if (!status.recordTypes.includes(this.selectedRecordType)) this.selectedRecordType = status.recordTypes[0] ?? '';
    this.cdr.markForCheck();
  }

  public get guide() {
    const connection = this.status?.connection;
    if (!connection) return undefined;
    if (this.cachedGuide?.connection !== connection || this.cachedGuide?.id !== this.selectedHarness)
      this.cachedGuide = {
        connection,
        id: this.selectedHarness,
        guide: harnessGuide(this.selectedHarness, connection),
      };
    return this.cachedGuide.guide;
  }
  public get harnessName(): string {
    return this.translations.t(this.harnesses.find(harness => harness.id === this.selectedHarness)!.nameKey);
  }
  public get cloud(): boolean {
    return this.harnesses.find(harness => harness.id === this.selectedHarness)?.group === 'cloud';
  }
  public get verificationPrompt(): string {
    return this.translations.t('mcp-schema-verification-prompt', '', {
      recordType: this.selectedRecordType,
      recordTypeLabel: this.recordTypeLabel(this.selectedRecordType),
      serverName: this.serverName,
    });
  }
  public recordTypeLabel(recordType: string): string {
    const label = this.status?.recordTypeLabels?.[recordType];
    if (label && label !== recordType) return this.translations.t(label);
    // Existing record-type names can also be supplied by the brand's translations.
    return this.translations.t(`${recordType}-name-plural`, this.translations.t(`${recordType}-name`, recordType));
  }
  public get previewHeadingKey(): string {
    return this.status?.state === 'oidc-required'
      ? 'mcp-after-sign-in'
      : this.status?.state === 'no-reporting-access'
        ? 'mcp-after-access'
        : 'mcp-after-setup';
  }
  public get blockerHelpKey(): string {
    return this.status?.state === 'oidc-required'
      ? 'mcp-sign-in-help'
      : this.status?.state === 'no-reporting-access'
        ? 'mcp-reporting-access-help'
        : this.status?.isAdmin
          ? 'mcp-admin-setup-help'
          : 'mcp-pending-setup-help';
  }
  public problemText(problem: string, affects = false): string {
    // Array validation issues include an index; explain them using their setting path.
    const path = problem.replace(/\.\d+(?=\.|$)/g, '');
    const fallback = affects
      ? problem.startsWith('mcpSetup')
        ? 'mcp-client-setup'
        : 'mcp-server-setup'
      : 'mcp-invalid-setting';
    return this.translations.t(`mcp-problem${affects ? '-affects' : ''}-${path}`, this.translations.t(fallback));
  }
  public anchor(id: string): string {
    return `${this.pagePath}#${id}`;
  }
  public get serverName(): string {
    const brand = this.status?.connection?.brand ?? this.status?.brand;
    return brand ? mcpServerName(brand) : '';
  }
  public get actionCount(): number {
    return this.checks.filter(check => this.checkState(check) === 'action').length;
  }
  public checkState(check: (typeof this.checks)[number]): 'passed' | 'action' | 'unchecked' {
    if (!this.status) return 'unchecked';
    if (this.status.checks[check]) return 'passed';
    if (
      check === 'records' &&
      (!this.status.checks.configuration || !this.status.checks.reporting || !this.status.checks.account)
    )
      return 'unchecked';
    return 'action';
  }
  public get diagnostics(): string {
    const connection = this.status?.connection;
    // Deliberate allowlist: never copy client registrations, account identifiers or config values.
    return [
      `${this.translations.t('mcp-brand')}: ${connection?.brand ?? this.status?.brand ?? '—'}`,
      `${this.translations.t('mcp-server-url')}: ${connection?.endpoint ?? '—'}`,
      `${this.translations.t('mcp-server-name')}: ${this.serverName || '—'}`,
      `${this.translations.t('mcp-harness-label')}: ${this.harnessName}`,
      `${this.translations.t('mcp-readiness')}: ${this.status?.state ?? '—'}`,
      ...this.checks
        .filter(check => this.checkState(check) !== 'passed')
        .map(
          check =>
            `${this.translations.t('mcp-check-' + check)}: ${this.translations.t('mcp-check-' + this.checkState(check))}`
        ),
      ...(this.status?.configurationProblems ?? []),
    ].join('\n');
  }

  public selectHarness(id: HarnessId): void {
    this.selectedHarness = id;
    this.resetCopyFeedback();
    try {
      localStorage.setItem('redbox.mcp.assistant', id);
    } catch {
      /* Optional preference. */
    }
    this.cdr.markForCheck();
  }
  public radioKey(event: KeyboardEvent): void {
    const delta = ['ArrowRight', 'ArrowDown'].includes(event.key)
      ? 1
      : ['ArrowLeft', 'ArrowUp'].includes(event.key)
        ? -1
        : 0;
    if (!delta && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const current = this.harnesses.findIndex(harness => harness.id === this.selectedHarness);
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? this.harnesses.length - 1
          : (current + delta + this.harnesses.length) % this.harnesses.length;
    this.selectHarness(this.harnesses[index].id);
    (event.currentTarget as HTMLElement)
      .querySelector<HTMLButtonElement>(`[data-harness="${this.selectedHarness}"]`)
      ?.focus();
  }
  public selectRecordType(value: string): void {
    this.selectedRecordType = value;
    this.resetCopyFeedback();
    this.cdr.markForCheck();
  }
  public async refresh(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    this.refreshError = false;
    this.cdr.markForCheck();
    this.resetCopyFeedback();
    try {
      this.applyStatus(await this.api.status());
    } catch {
      // Keep instructions during the request, but don't display stale access after failure.
      this.status = undefined;
      this.refreshError = true;
    } finally {
      this.refreshing = false;
      this.cdr.markForCheck();
    }
  }
  public async copy(id: string, text: string): Promise<void> {
    const revision = (this.copyRevision.get(id) ?? 0) + 1;
    this.copyRevision.set(id, revision);
    const oldTimer = this.copyTimers.get(id);
    if (oldTimer) clearTimeout(oldTimer);
    this.copyMessage = '';
    try {
      await navigator.clipboard.writeText(text);
      if (this.copyRevision.get(id) !== revision) return;
      this.copyStates[id] = 'copied';
      this.copyMessage = this.translations.t('mcp-copied');
      this.copyTimers.set(
        id,
        setTimeout(() => {
          delete this.copyStates[id];
          this.copyTimers.delete(id);
          this.cdr.markForCheck();
        }, 2000)
      );
    } catch {
      if (this.copyRevision.get(id) !== revision) return;
      this.copyStates[id] = 'failed';
      this.copyMessage = this.translations.t('mcp-copy-failed');
    }
    this.cdr.markForCheck();
  }
  private resetCopyFeedback(): void {
    this.copyTimers.forEach(timer => clearTimeout(timer));
    this.copyTimers.clear();
    this.copyRevision.forEach((revision, id) => this.copyRevision.set(id, revision + 1));
    this.copyStates = {};
    this.copyMessage = '';
  }
  override ngOnDestroy(): void {
    this.resetCopyFeedback();
    super.ngOnDestroy();
  }
}
