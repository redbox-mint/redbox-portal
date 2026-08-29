import type {
  AuthorizationAuditActorType,
  AuthorizationAuditAuthMethod,
  AuthorizationAuditEventType,
  AuthorizationAuditOutcome,
  AuthorizationAuditTargetType,
  AuthorizationRedactedValue,
} from '../../authorization';

export class AuthorizationAuditModel {
  id = '';
  eventId = '';
  schemaVersion = 1;
  eventType!: AuthorizationAuditEventType;
  outcome!: AuthorizationAuditOutcome;
  actorType!: AuthorizationAuditActorType;
  actorId = '';
  authMethod!: AuthorizationAuditAuthMethod;
  brandId?: string;
  targetType!: AuthorizationAuditTargetType;
  targetId?: string;
  before?: AuthorizationRedactedValue;
  after?: AuthorizationRedactedValue;
  reasonCode?: string;
  reason?: string;
  requestId?: string;
  batchId?: string;
  occurredAt!: string | Date;
  createdAt?: string | Date;
}
