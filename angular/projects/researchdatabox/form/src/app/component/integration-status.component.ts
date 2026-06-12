import { Component, computed, effect, inject, signal, OnDestroy } from '@angular/core';
import { FormFieldBaseComponent } from '@researchdatabox/portal-ng-common';
import { IntegrationStatusComponentName } from '@researchdatabox/sails-ng-common';
import { FormComponentEventBus, FormComponentEventType } from '../form-state';
import { RecordService, IntegrationStatusItem } from '@researchdatabox/portal-ng-common';

@Component({
  selector: 'redbox-form-integration-status',
  template: `
    @if (isVisible && oid()) {
      <div class="rb-integration-status card" role="region" [attr.aria-live]="hasError() ? 'assertive' : 'polite'" attr.aria-label="{{ '@integration-status-heading' | i18next }}">
        <div class="card-header py-2 d-flex align-items-center">
          <i class="fa fa-plug me-2" aria-hidden="true"></i>
          <span class="fw-semibold">{{ headingText() | i18next }}</span>
          @if (isPolling()) {
            <span class="ms-auto text-muted rb-int-meta">
              <i class="fa fa-refresh fa-spin" aria-hidden="true"></i>
            </span>
          }
        </div>
        @if (integrations().length === 0) {
          <div class="card-body py-2">
            <p class="text-muted rb-int-meta mb-0">
              <i class="fa fa-info-circle fa-fw" aria-hidden="true"></i>
              {{ '@integration-status-empty' | i18next }}
            </p>
          </div>
        } @else {
          <ul class="list-group list-group-flush">
            @for (item of integrations(); track item.traceId) {
              <li class="list-group-item">
                <div class="d-flex align-items-center gap-3">
                  <span class="badge" [ngClass]="badgeClass(item.status)" rb-int-badge role="status">
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
                @if (item.message && item.status === 'failed') {
                  <div class="rb-int-meta mt-2 ms-1 ps-3 border-start border-danger text-danger">
                    <i class="fa fa-info-circle fa-fw" aria-hidden="true"></i>
                    {{ item.message }}
                  </div>
                }
              </li>
            }
          </ul>
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

  protected readonly oid = signal<string | null>(null);
  protected readonly integrations = signal<IntegrationStatusItem[]>([]);
  protected readonly isPolling = signal(false);
  protected readonly hasError = signal(false);
  private pollTimerId: number | null = null;
  private pollAttempts = 0;

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

  protected readonly headingText = computed(() => {
    const h = this.config?.['heading'];
    return typeof h === 'string' && h ? h : '@integration-status-heading';
  });

  constructor() {
    super();

    const readySignal = this.eventBus.selectSignal(FormComponentEventType.FORM_DEFINITION_READY);
    const saveSuccessSignal = this.eventBus.selectSignal(FormComponentEventType.FORM_SAVE_SUCCESS);

    effect(() => {
      readySignal();
      this.resolveOidAndFetch();
    });

    effect(() => {
      const saveEvent = saveSuccessSignal();
      if (saveEvent) {
        const eventOid = (saveEvent as any)?.oid;
        if (eventOid) {
          this.oid.set(eventOid);
        }
        setTimeout(() => this.fetchStatus(), 1500);
      }
    });
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

      const hasInFlight = response.integrations.some(i => i.status === 'started');
      if (hasInFlight) {
        this.startPolling();
      } else {
        this.stopPolling();
      }
    } catch {
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

    if (item.status === 'started' && started) {
      return 'Started ' + started.toLocaleString();
    }
    if (completed) {
      let text = 'Completed ' + completed.toLocaleString();
      if (item.durationMs != null) {
        const secs = (item.durationMs / 1000).toFixed(1);
        text += ' (in ' + secs + 's)';
      }
      return text;
    }
    if (started) {
      return 'Started ' + started.toLocaleString();
    }
    return '';
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }
}
