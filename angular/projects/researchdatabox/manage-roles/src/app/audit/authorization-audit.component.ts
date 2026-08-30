import { Component, OnInit } from '@angular/core';
import {
  AuthorizationAuditEvent,
  AuthorizationAuditEventType,
  AuthorizationAuditOutcome,
  AuthorizationAuditTargetType,
  AuthorizationUiErrorState,
} from '../authorization-admin.models';
import { AuthorizationAdminService } from '../authorization-admin.service';

@Component({
  selector: 'authorization-audit',
  templateUrl: './authorization-audit.component.html',
  styleUrls: ['./authorization-audit.component.scss'],
  standalone: false,
})
export class AuthorizationAuditComponent implements OnInit {
  public readonly eventTypes: AuthorizationAuditEventType[] = [
    'authorization.bootstrap.invariants-checked',
    'authorization.migration.batch-applied',
    'assignment.created',
    'assignment.batch-applied',
    'assignment.expired',
    'assignment.noop',
    'assignment.reactivated',
    'assignment.revoked',
    'assignment.source-replaced',
    'assignment.suppressed',
    'assignment.unsuppressed',
    'audit.retention.completed',
    'authorization.config-exported',
    'authorization.config-imported',
    'role.cloned',
    'role.created',
    'role.deleted',
    'role.inactivated',
    'role.scopes-updated',
    'role.template-upgraded',
    'role.template-upgrade-batch-applied',
    'role.updated',
    'scope.adopted',
    'scope.catalog-reconciled',
    'scope.orphaned',
    'template.reconciled',
    'template.revision-published',
  ];
  public readonly outcomes: AuthorizationAuditOutcome[] = ['succeeded', 'denied', 'failed'];
  public readonly targetTypes: AuthorizationAuditTargetType[] = [
    'authorization-audit',
    'authorization-config',
    'authorization-migration',
    'authorization-readiness',
    'authorization-scope',
    'role',
    'role-assignment',
    'role-scope-override',
    'role-template',
    'role-template-revision',
  ];
  public events: AuthorizationAuditEvent[] = [];
  public nextCursor?: string;
  public loading = false;
  public error?: AuthorizationUiErrorState;
  public liveMessage = '';
  public expandedEventId?: string;

  public occurredFrom = '';
  public occurredTo = '';
  public eventType: AuthorizationAuditEventType | '' = '';
  public outcome: AuthorizationAuditOutcome | '' = '';
  public actorId = '';
  public targetType: AuthorizationAuditTargetType | '' = '';
  public targetId = '';
  public readonly timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  private auditLoadId = 0;

  constructor(private readonly authorizationAdminService: AuthorizationAdminService) {}

  public get visibleEvents(): AuthorizationAuditEvent[] {
    const from = this.dateBoundary(this.occurredFrom, Number.NEGATIVE_INFINITY);
    const to = this.dateBoundary(this.occurredTo, Number.POSITIVE_INFINITY);
    return this.events.filter(event => {
      const occurred = new Date(event.occurredAt).getTime();
      return occurred >= from && occurred <= to;
    });
  }

  public async ngOnInit(): Promise<void> {
    await this.loadAudit(false);
  }

  public async loadAudit(append: boolean): Promise<void> {
    const loadId = ++this.auditLoadId;
    this.loading = true;
    this.liveMessage = 'Loading redacted authorization audit events.';
    this.error = undefined;
    try {
      const page = await this.authorizationAdminService.listAudit({
        limit: 50,
        ...(append && this.nextCursor ? { cursor: this.nextCursor } : {}),
        ...(this.eventType ? { eventType: this.eventType } : {}),
        ...(this.outcome ? { outcome: this.outcome } : {}),
        ...(this.actorId.trim() ? { actorId: this.actorId.trim() } : {}),
        ...(this.targetType ? { targetType: this.targetType } : {}),
        ...(this.targetId.trim() ? { targetId: this.targetId.trim() } : {}),
      });
      if (loadId !== this.auditLoadId) return;
      this.events = append ? [...this.events, ...page.items] : page.items;
      this.nextCursor = page.nextCursor;
      this.liveMessage = `${this.visibleEvents.length} audit events shown.`;
    } catch (error) {
      if (loadId !== this.auditLoadId) return;
      this.error = this.authorizationAdminService.toUiError(error);
      this.liveMessage = this.error.message;
    } finally {
      if (loadId === this.auditLoadId) this.loading = false;
    }
  }

  public resetFilters(): void {
    this.occurredFrom = '';
    this.occurredTo = '';
    this.eventType = '';
    this.outcome = '';
    this.actorId = '';
    this.targetType = '';
    this.targetId = '';
    void this.loadAudit(false);
  }

  public toggleDetails(eventId: string): void {
    this.expandedEventId = this.expandedEventId === eventId ? undefined : eventId;
  }

  public formatSnapshot(snapshot: unknown): string {
    if (snapshot === undefined) return 'Not recorded';
    try {
      return JSON.stringify(snapshot, null, 2);
    } catch {
      return 'Snapshot could not be displayed.';
    }
  }

  private dateBoundary(value: string, fallback: number): number {
    if (!value) return fallback;
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? fallback : timestamp;
  }
}
