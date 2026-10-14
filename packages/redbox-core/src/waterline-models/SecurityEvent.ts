/// <reference path="../sails.ts" />
import { Attr, Entity, toWaterlineModelDef } from '../decorators';

@Entity('securityevent', {
  indexes: [
    { attributes: { brandId: 1, deliveryState: 1, nextEligibleAt: 1, occurredAt: 1 } },
  ],
})
export class SecurityEventClass {
  @Attr({ type: 'string', required: true, unique: true })
  public eventId!: string;

  @Attr({ type: 'string', required: true })
  public brandId!: string;

  @Attr({ type: 'string' })
  public portalId?: string;

  @Attr({ type: 'string', required: true })
  public eventType!: string;

  @Attr({ type: 'string', required: true })
  public category!: string;

  @Attr({ type: 'string', required: true })
  public severity!: string;

  @Attr({ type: 'string', required: true })
  public occurredAt!: string;

  @Attr({ type: 'string', required: true })
  public source!: string;

  @Attr({ type: 'json' })
  public actor?: Record<string, unknown>;

  @Attr({ type: 'json' })
  public subject?: Record<string, unknown>;

  @Attr({ type: 'json' })
  public resource?: Record<string, unknown>;

  @Attr({ type: 'json' })
  public requestContext?: Record<string, unknown>;

  @Attr({ type: 'json' })
  public payload?: Record<string, unknown>;

  @Attr({ type: 'string' })
  public correlationId?: string;

  @Attr({ type: 'string' })
  public traceId?: string;

  @Attr({ type: 'string', required: true })
  public deliveryState!: string;

  @Attr({ type: 'string', allowNull: true })
  public leaseToken?: string | null;

  @Attr({ type: 'string', allowNull: true })
  public leaseExpiresAt?: string | null;

  @Attr({ type: 'string', allowNull: true })
  public nextEligibleAt?: string | null;

  @Attr({ type: 'string', allowNull: true })
  public terminalAt?: string | null;

  @Attr({ type: 'json' })
  public destinationStates?: Record<string, unknown>;
}

export const SecurityEventWLDef = toWaterlineModelDef(SecurityEventClass);

export interface SecurityEventAttributes extends Sails.WaterlineAttributes {
  eventId: string;
  brandId: string;
  portalId?: string;
  eventType: string;
  category: string;
  severity: string;
  occurredAt: string;
  source: string;
  actor?: Record<string, unknown>;
  subject?: Record<string, unknown>;
  resource?: Record<string, unknown>;
  requestContext?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  correlationId?: string;
  traceId?: string;
  deliveryState: string;
  leaseToken?: string | null;
  leaseExpiresAt?: string | null;
  nextEligibleAt?: string | null;
  terminalAt?: string | null;
  destinationStates?: Record<string, unknown>;
}

export interface SecurityEventWaterlineModel extends Sails.Model<SecurityEventAttributes> {
  attributes: SecurityEventAttributes;
}

declare global {
  const SecurityEvent: SecurityEventWaterlineModel;
}
