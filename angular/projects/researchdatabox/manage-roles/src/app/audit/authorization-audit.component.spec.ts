import { AuthorizationAuditEvent } from '../authorization-admin.models';
import { AuthorizationAdminService } from '../authorization-admin.service';
import { AuthorizationAuditComponent } from './authorization-audit.component';

describe('AuthorizationAuditComponent', () => {
  const event: AuthorizationAuditEvent = {
    eventId: 'event-1',
    schemaVersion: 1,
    eventType: 'role.updated',
    outcome: 'succeeded',
    actorType: 'user',
    actorId: 'admin',
    authMethod: 'session',
    targetType: 'role',
    targetId: 'role-1',
    requestId: 'request-1',
    occurredAt: '2026-01-02T00:00:00Z',
    before: { displayName: '<img src=x onerror=alert(1)>' },
    after: { displayName: 'Safe' },
  };

  it('uses server filters and cursor pagination for audit events', async () => {
    const service = jasmine.createSpyObj<AuthorizationAdminService>('AuthorizationAdminService', [
      'listAudit',
      'toUiError',
    ]);
    service.listAudit.and.resolveTo({ items: [event], nextCursor: 'cursor-1' });
    const component = new AuthorizationAuditComponent(service);
    component.eventType = 'role.updated';
    component.actorId = 'admin';
    await component.ngOnInit();
    expect(service.listAudit).toHaveBeenCalledWith(
      jasmine.objectContaining({ eventType: 'role.updated', actorId: 'admin' })
    );
    expect(component.nextCursor).toBe('cursor-1');
  });

  it('filters loaded events by time and serializes redacted snapshots as plain text', () => {
    const service = jasmine.createSpyObj<AuthorizationAdminService>('AuthorizationAdminService', ['toUiError']);
    const component = new AuthorizationAuditComponent(service);
    component.events = [event];
    component.occurredFrom = '2026-01-01T00:00';
    component.occurredTo = '2026-01-03T00:00';
    expect(component.visibleEvents.length).toBe(1);
    expect(component.formatSnapshot(event.before)).toContain('<img');
    component.occurredFrom = '2026-02-01T00:00';
    expect(component.visibleEvents.length).toBe(0);
  });
});
