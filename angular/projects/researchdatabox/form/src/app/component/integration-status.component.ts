import { Component, computed, effect, inject, signal, OnDestroy } from '@angular/core';
import { FormFieldBaseComponent } from '@researchdatabox/portal-ng-common';
import { IntegrationStatusComponentName } from '@researchdatabox/sails-ng-common';
import { FormComponentEventBus, FormComponentEventType } from '../form-state';
import { RecordService, IntegrationStatusItem, IntegrationOutcome, TranslationService, UserService } from '@researchdatabox/portal-ng-common';

@Component({
  selector: 'redbox-form-integration-status',
  template: `
    @if (isVisible && oid() && shouldRender()) {
      <div class="rb-integration-status panel panel-default" role="region" [attr.aria-live]="hasError() ? 'assertive' : 'polite'" attr.aria-label="{{ headingText() | i18next }}">
        <div class="panel-heading d-flex align-items-center">
          <span class="panel-title flex-grow-1">{{ headingText() | i18next }}</span>
          @if (isPolling()) {
            <i class="fa fa-refresh fa-spin me-2" aria-hidden="true"></i>
          }
          <button type="button" class="btn btn-link btn-sm p-0 text-decoration-none rb-int-collapse"
            [attr.aria-expanded]="!collapsed()"
            aria-controls="integration-status-body"
            (click)="collapsed.set(!collapsed())"
            attr.aria-label="{{ (collapsed() ? '@integration-status-expand' : '@integration-status-collapse') | i18next }}">
            <i class="fa" [ngClass]="collapsed() ? 'fa-chevron-down' : 'fa-chevron-up'" aria-hidden="true"></i>
          </button>
        </div>
        @if (!collapsed()) {
        <div id="integration-status-body">
        @if (hasError() && canSeeTechnicalDetails()) {
          <div class="panel-body">
            <p class="text-danger rb-int-meta mb-0">
              <i class="fa fa-exclamation-circle fa-fw" aria-hidden="true"></i>
              {{ '@integration-status-error' | i18next }}
            </p>
          </div>
        } @else if (displayIntegrations().length === 0) {
          <div class="panel-body">
            <p class="text-muted rb-int-meta mb-0">
              <i class="fa fa-info-circle fa-fw" aria-hidden="true"></i>
              {{ '@integration-status-empty' | i18next }}
            </p>
          </div>
        } @else {
          <ul class="list-group list-group-flush">
            @for (item of displayIntegrations(); track item.traceId) {
              <li class="list-group-item">
                @if (item.outcome; as outcome) {
                  <div class="d-flex align-items-center gap-3">
                    <span class="badge rb-int-badge" [ngClass]="severityBadgeClass(outcome.severity)" role="status">
                      @if (outcome.severity === 'in-progress') {
                        <i class="fa fa-spinner fa-pulse fa-fw" aria-hidden="true"></i>
                      } @else if (outcome.severity === 'success') {
                        <i class="fa fa-check fa-fw" aria-hidden="true"></i>
                      } @else if (outcome.severity === 'error' || outcome.severity === 'warning') {
                        <i class="fa fa-exclamation-triangle fa-fw" aria-hidden="true"></i>
                      }
                      {{ outcome.labelKey | i18next }}
                    </span>
                    <div>
                      <span class="fw-semibold d-block">{{ integrationLabel(item.integrationName) | i18next }}</span>
                      @if (!item.synthesized) {
                        <span class="text-muted rb-int-meta d-block">{{ timestampText(item) }}</span>
                      }
                    </div>
                  </div>
                  @if (outcome.helpKey) {
                    <div class="rb-int-meta mt-2 ms-1 ps-3 border-start text-muted">
                      <i class="fa fa-info-circle fa-fw" aria-hidden="true"></i>
                      {{ outcome.helpKey | i18next }}
                    </div>
                  }
                  @if (getKeyResult(item, 'doi'); as doi) {
                    @if (outcome.severity !== 'error' && outcome.severity !== 'none') {
                      <div class="rb-int-meta mt-2 ms-1 ps-3 border-start">
                        <strong>{{ doiKeyLabel(outcome.state) | i18next }}</strong>
                        <a href="https://doi.org/{{doi}}" target="_blank" rel="noopener noreferrer" class="ms-2">{{doi}} <i class="fa fa-external-link fa-fw" aria-hidden="true"></i></a>
                      </div>
                    }
                  }
                  @if (getKeyResult(item, 'articleId'); as articleId) {
                    <div class="rb-int-meta mt-2 ms-1 ps-3 border-start">
                      <strong>{{ '@integration-status-keyresult-figshare' | i18next }}</strong>
                      <span class="ms-2">{{articleId}}</span>
                    </div>
                  }
                } @else {
                  <div class="d-flex align-items-center gap-3">
                    <span class="badge rb-int-badge" [ngClass]="badgeClass(item.status)" role="status">
                      @if (item.status === 'started') {
                        <i class="fa fa-spinner fa-pulse fa-fw" aria-hidden="true"></i>
                      } @else if (item.status === 'success') {
                        <i class="fa fa-check fa-fw" aria-hidden="true"></i>
                      } @else if (item.status === 'failed') {
                        <i class="fa fa-exclamation-triangle fa-fw" aria-hidden="true"></i>
                      }
                      {{ statusLabel(item.status) | i18next }}
                    </span>
                    <div>
                      <span class="fw-semibold d-block">{{ integrationLabel(item.integrationName) | i18next }}</span>
                      <span class="text-muted rb-int-meta d-block">{{ timestampText(item) }}</span>
                    </div>
                  </div>
                  @if (getKeyResult(item, 'doi'); as doi) {
                    <div class="rb-int-meta mt-2 ms-1 ps-3 border-start">
                      <strong>{{ '@integration-status-keyresult-doi' | i18next }}</strong>
                      <a href="https://doi.org/{{doi}}" target="_blank" rel="noopener noreferrer" class="ms-2">{{doi}} <i class="fa fa-external-link fa-fw" aria-hidden="true"></i></a>
                    </div>
                  }
                  @if (getKeyResult(item, 'articleId'); as articleId) {
                    <div class="rb-int-meta mt-2 ms-1 ps-3 border-start">
                      <strong>{{ '@integration-status-keyresult-figshare' | i18next }}</strong>
                      <span class="ms-2">{{articleId}}</span>
                    </div>
                  }
                  @if (item.message && item.status === 'failed') {
                    <div class="rb-int-meta mt-2 ms-1 ps-3 border-start border-danger text-danger">
                      <i class="fa fa-info-circle fa-fw" aria-hidden="true"></i>
                      {{ item.message }}
                    </div>
                  }
                }
              </li>
            }
          </ul>
          @if (canSeeTechnicalDetails()) {
            <div class="rb-int-technical-toggle border-top py-2 px-3">
              <button type="button" class="btn btn-sm btn-link text-decoration-none p-0"
                [attr.aria-expanded]="technicalOpen()"
                aria-controls="integration-technical-details"
                (click)="technicalOpen.set(!technicalOpen())">
                <i class="fa fa-cog fa-fw" aria-hidden="true"></i>
                {{ '@integration-status-technical-toggle' | i18next }}
              </button>
            </div>
            @if (technicalOpen()) {
              <div id="integration-technical-details" class="list-group list-group-flush">
                @for (item of integrations(); track item.traceId) {
                  @if (!item.synthesized) {
                    <li class="list-group-item">
                      <div class="d-flex align-items-center gap-3">
                        <span class="badge rb-int-badge" [ngClass]="badgeClass(item.status)" role="status">
                          @if (item.status === 'started') {
                            <i class="fa fa-spinner fa-pulse fa-fw" aria-hidden="true"></i>
                          } @else if (item.status === 'success') {
                            <i class="fa fa-check fa-fw" aria-hidden="true"></i>
                          } @else if (item.status === 'failed') {
                            <i class="fa fa-exclamation-triangle fa-fw" aria-hidden="true"></i>
                          }
                          {{ statusLabel(item.status) | i18next }}
                        </span>
                        <div>
                          <span class="fw-semibold d-block">{{ integrationLabel(item.integrationName) | i18next }}</span>
                          <span class="text-muted rb-int-meta d-block">{{ timestampText(item) }}</span>
                        </div>
                      </div>
                      @if (getKeyResult(item, 'doi'); as doi) {
                        <div class="rb-int-meta mt-2 ms-1 ps-3 border-start">
                          <strong>{{ '@integration-status-keyresult-doi' | i18next }}</strong>
                          <a href="https://doi.org/{{doi}}" target="_blank" rel="noopener noreferrer" class="ms-2">{{doi}} <i class="fa fa-external-link fa-fw" aria-hidden="true"></i></a>
                        </div>
                      }
                      @if (getKeyResult(item, 'articleId'); as articleId) {
                        <div class="rb-int-meta mt-2 ms-1 ps-3 border-start">
                          <strong>{{ '@integration-status-keyresult-figshare' | i18next }}</strong>
                          <span class="ms-2">{{articleId}}</span>
                        </div>
                      }
                      @if (item.message) {
                        <div class="rb-int-meta mt-2 ms-1 ps-3 border-start" [ngClass]="item.status === 'failed' ? 'border-danger text-danger' : 'text-muted'">
                          <i class="fa fa-info-circle fa-fw" aria-hidden="true"></i>
                          {{ item.message }}
                        </div>
                      }
                    </li>
                  }
                }
              </div>
            }
          }
        }
        </div>
        }
      </div>
    }
  `,
  standalone: false
})
export class IntegrationStatusComponent extends FormFieldBaseComponent<undefined> implements OnDestroy {
  public override logName = IntegrationStatusComponentName;
  private readonly eventBus = inject(FormComponentEventBus);
  private readonly recordService = inject(RecordService);
  private readonly translationService = inject(TranslationService);
  private readonly userService = inject(UserService);

  protected readonly oid = signal<string | null>(null);
  protected readonly integrations = signal<IntegrationStatusItem[]>([]);
  protected readonly isPolling = signal(false);
  protected readonly hasError = signal(false);
  protected readonly gracePollActive = signal(false);
  protected readonly canSeeTechnicalDetails = signal(false);
  protected readonly technicalOpen = signal(false);
  protected readonly collapsed = signal(false);
  protected readonly waitingForStatus = signal(false);
  // Integration names observed in-progress during this session (not persisted, so a
  // reload starts empty). Drives the researcher "show success only if it was live" rule.
  protected readonly seenInProgress = signal<Set<string>>(new Set<string>());
  private pollTimerId: number | null = null;
  private pollAttempts = 0;
  private graceRemaining = 0;
  private saveStatusTimeout: ReturnType<typeof setTimeout> | null = null;
  /** When set, rapid-poll at 100ms after each response instead of the normal interval. */
  private rapidPollUntil: number | null = null;

  private get config(): Record<string, unknown> | undefined {
    return this.componentDefinition?.config as Record<string, unknown> | undefined;
  }

  private get integrationNames(): string[] | undefined {
    return this.config?.['integrationNames'] as string[] | undefined;
  }

  private get pollIntervalMs(): number {
    const val = this.config?.['pollIntervalMs'];
    return typeof val === 'number' && Number.isFinite(val) ? val : 5000;
  }

  private get maxPollAttempts(): number {
    const val = this.config?.['maxPollAttempts'];
    return typeof val === 'number' && Number.isFinite(val) ? val : 60;
  }

  private get rapidPollDurationMs(): number {
    const val = this.config?.['rapidPollDurationMs'];
    return typeof val === 'number' && Number.isFinite(val) ? val : 3000;
  }

  private get rapidPollIntervalMs(): number {
    const val = this.config?.['rapidPollIntervalMs'];
    return typeof val === 'number' && Number.isFinite(val) ? val : 100;
  }

  private get technicalDetailRoles(): string[] {
    const val = this.config?.['technicalDetailRoles'];
    return Array.isArray(val) ? val as string[] : ['Admin', 'Librarians'];
  }

  protected readonly headingText = computed(() => {
    const h = this.config?.['heading'];
    return typeof h === 'string' && h ? h : '@integration-status-heading';
  });

  // All roles: only show in-progress, failures, or integrations that went
  // in-progress during this session (so they stay visible after completing).
  protected readonly displayIntegrations = computed<IntegrationStatusItem[]>(() => {
    const all = this.integrations();
    const seen = this.seenInProgress();
    return all.filter(item => this.isInProgress(item) || this.isError(item) || seen.has(item.integrationName));
  });

  // All roles: only render when there are integrations worth showing.
  protected readonly shouldRender = computed<boolean>(() => {
    return this.waitingForStatus() || this.displayIntegrations().length > 0;
  });

  constructor() {
    super();

    const readySignal = this.eventBus.selectSignal(FormComponentEventType.FORM_DEFINITION_READY);
    const saveSuccessSignal = this.eventBus.selectSignal(FormComponentEventType.FORM_SAVE_SUCCESS);

    effect(() => {
      readySignal();
      void this.initRoleResolution();
      this.resolveOidAndFetch();
    });

    effect(() => {
      const saveEvent = saveSuccessSignal();
      if (saveEvent) {
        const eventOid = (saveEvent as any)?.oid;
        if (eventOid) {
          this.oid.set(eventOid);
        }
        if (this.saveStatusTimeout !== null) {
          clearTimeout(this.saveStatusTimeout);
          this.saveStatusTimeout = null;
        }
        // Rapid-poll: check immediately, then poll after each response
        // for the configured duration before falling back to normal polling.
        this.waitingForStatus.set(true);
        this.rapidPollUntil = Date.now() + this.rapidPollDurationMs;
        this.graceRemaining = 3;
        this.fetchStatus();
      }
    });
  }

  private async initRoleResolution(): Promise<void> {
    try {
      await this.userService.waitForInit();
      const res = await this.userService.getInfo();
      const user = (res as any)?.user ?? res;
      const userRoles = (user?.roles ?? []) as Array<{ name?: string }>;
      const allowed = this.technicalDetailRoles;
      this.canSeeTechnicalDetails.set(userRoles.some(r => r.name && allowed.includes(r.name)));
    } catch {
      this.canSeeTechnicalDetails.set(false);
    }
  }

  private resolveOidAndFetch(): void {
    try {
      const fc = this.formComponent;
      const formOid = fc?.trimmedParams?.oid?.() ?? fc?.oid?.() ?? '';
      if (formOid) {
        this.oid.set(formOid);
        this.fetchStatus();
      }
    } catch {
      // formComponent not available (e.g. in tests), skip fetch
    }
  }

  private async fetchStatus(): Promise<void> {
    const currentOid = this.oid();
    if (!currentOid) {
      this.integrations.set([]);
      return;
    }

    try {
      const response = await this.recordService.getRecordIntegrationStatus(currentOid, {
        integrationName: this.integrationNames?.join(',')
      });
      this.integrations.set(response.integrations);
      this.hasError.set(false);
      this.recordSeenInProgress(response.integrations);

      // Stop waiting once we have something to show
      if (response.integrations.length > 0) {
        this.waitingForStatus.set(false);
      }

      // Rapid polling: fire again 100ms after each response, for up to 3s.
      if (this.rapidPollUntil !== null) {
        if (Date.now() < this.rapidPollUntil) {
          this.isPolling.set(true);
          setTimeout(() => this.fetchStatus(), this.rapidPollIntervalMs);
          return;
        }
        this.rapidPollUntil = null;
      }

      const hasInFlight = response.integrations.some(i => i.status === 'started' && !i.synthesized);
      if (hasInFlight) {
        this.graceRemaining = 0;
        this.gracePollActive.set(false);
        this.startPolling();
      } else if (this.graceRemaining > 0) {
        this.graceRemaining--;
        this.startPolling();
      } else {
        this.stopPolling();
      }
    } catch {
      this.hasError.set(true);
      this.waitingForStatus.set(false);
      this.stopPolling();
    }
  }

  private startPolling(): void {
    if (this.pollTimerId !== null) {
      return;
    }
    this.isPolling.set(true);
    this.pollAttempts = 0;
    this.pollTimerId = window.setInterval(() => {
      this.pollAttempts++;
      if (this.pollAttempts >= this.maxPollAttempts) {
        this.stopPolling();
        return;
      }
      this.fetchStatus();
    }, this.pollIntervalMs);
  }

  private stopPolling(): void {
    if (this.pollTimerId !== null) {
      window.clearInterval(this.pollTimerId);
      this.pollTimerId = null;
    }
    this.isPolling.set(false);
    this.gracePollActive.set(false);
  }

  protected isInProgress(item: IntegrationStatusItem): boolean {
    return item.status === 'started' || item.outcome?.severity === 'in-progress';
  }

  protected isError(item: IntegrationStatusItem): boolean {
    return item.status === 'failed' || item.outcome?.severity === 'error';
  }

  private recordSeenInProgress(items: IntegrationStatusItem[]): void {
    const names = items.filter(i => this.isInProgress(i)).map(i => i.integrationName);
    if (names.length === 0) {
      return;
    }
    this.seenInProgress.update(prev => {
      const next = new Set(prev);
      for (const name of names) {
        next.add(name);
      }
      return next;
    });
  }

  protected severityBadgeClass(severity: string): string {
    switch (severity) {
      case 'in-progress': return 'text-bg-info';
      case 'success': return 'text-bg-success';
      case 'error': return 'text-bg-danger';
      case 'warning': return 'text-bg-warning';
      case 'pending': return 'text-bg-warning';
      default: return 'text-bg-secondary';
    }
  }

  protected badgeClass(status: string): string {
    switch (status) {
      case 'started': return 'text-bg-info';
      case 'success': return 'text-bg-success';
      case 'failed': return 'text-bg-danger';
      default: return 'text-bg-secondary';
    }
  }

  protected statusLabel(status: string): string {
    switch (status) {
      case 'started': return '@integration-status-started';
      case 'success': return '@integration-status-success';
      case 'failed': return '@integration-status-failed';
      default: return status;
    }
  }

  protected doiKeyLabel(state: string): string {
    return state === 'published' ? '@integration-status-keyresult-doi-published' : '@integration-status-keyresult-doi';
  }

  protected integrationLabel(name: string): string {
    if (name === 'doi') return '@integration-status-name-doi';
    if (name === 'figshare') return '@integration-status-name-figshare';
    return name;
  }

  protected getKeyResult(item: IntegrationStatusItem, key: string): string | null {
    const kr = item.keyResult;
    if (kr && typeof kr === 'object' && key in kr) {
      const val = (kr as Record<string, unknown>)[key];
      return typeof val === 'string' ? val : null;
    }
    return null;
  }

  protected timestampText(item: IntegrationStatusItem): string {
    const started = item.startedAt ? new Date(item.startedAt) : null;
    const completed = item.completedAt ? new Date(item.completedAt) : null;
    const ts = this.translationService;
    const noEscape = { interpolation: { escapeValue: false } };

    if (item.status === 'started' && started) {
      return ts.t('@integration-status-timestamp-started', { date: started.toLocaleString(), ...noEscape });
    }
    if (completed) {
      if (item.durationMs != null) {
        const secs = (item.durationMs / 1000).toFixed(1);
        return ts.t('@integration-status-timestamp-completed-with-duration', { date: completed.toLocaleString(), seconds: secs, ...noEscape });
      }
      return ts.t('@integration-status-timestamp-completed', { date: completed.toLocaleString(), ...noEscape });
    }
    if (started) {
      return ts.t('@integration-status-timestamp-started', { date: started.toLocaleString(), ...noEscape });
    }
    return '';
  }

  ngOnDestroy(): void {
    this.stopPolling();
    if (this.saveStatusTimeout !== null) {
      clearTimeout(this.saveStatusTimeout);
      this.saveStatusTimeout = null;
    }
  }
}
