/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { Entity, Attr, BelongsTo, HasMany, BeforeCreate, toWaterlineModelDef } from '../decorators';
import { BrandingConfigAttributes } from './BrandingConfig';

const assignKey = (recordType: Record<string, unknown>, cb: (err?: Error) => void) => {
  recordType.key = `${recordType.branding}_${recordType.name}`;
  cb();
};

@BeforeCreate(assignKey)
@Entity('recordtype')
export class RecordTypeClass {
  @Attr({ type: 'string', unique: true })
  public key?: string;

  @Attr({ type: 'string', required: true })
  public name!: string;

  @BelongsTo('brandingconfig', { required: true })
  public branding!: string | number;

  @Attr({ type: 'string' })
  public packageType?: string;

  @Attr({ type: 'string', defaultsTo: 'default' })
  public searchCore?: string;

  @HasMany('workflowStep', 'recordType')
  public workflowSteps?: unknown[];

  @Attr({ type: 'json' })
  public searchFilters?: Record<string, unknown>;

  @Attr({ type: 'boolean', defaultsTo: true })
  public searchable?: boolean;

  @Attr({ type: 'json' })
  public transferResponsibility?: Record<string, unknown>;

  @Attr({ type: 'json' })
  public relatedTo?: Record<string, unknown>;

  @Attr({ type: 'json' })
  public hooks?: Record<string, unknown>;

  @Attr({ type: 'json' })
  public dashboard?: Record<string, unknown>;
}

// Export the Waterline model definition for runtime use
export const RecordTypeWLDef = toWaterlineModelDef(RecordTypeClass);

// Type interface for backwards compatibility
export interface RecordTypeAttributes extends Sails.WaterlineAttributes {
  branding: string | number | BrandingConfigAttributes;
  dashboard?: Record<string, unknown>;
  hooks?: Record<string, unknown>;
  key?: string;
  name: string;
  packageType?: string;
  relatedTo?: Record<string, unknown>;
  searchable?: boolean;
  searchCore?: string;
  searchFilters?: Record<string, unknown>;
  transferResponsibility?: Record<string, unknown>;
  workflowSteps?: unknown[];
}

export interface RecordTypeWaterlineModel extends Sails.Model<RecordTypeAttributes> {
  attributes: RecordTypeAttributes;
}

declare global {
  var RecordType: RecordTypeWaterlineModel;
}
