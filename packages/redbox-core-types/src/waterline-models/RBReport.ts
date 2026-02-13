/// <reference path="../sails.ts" />
import { Entity, Attr, BelongsTo, BeforeCreate, toWaterlineModelDef } from '../decorators';
import { BrandingConfigAttributes } from './BrandingConfig';

const assignKey = (report: Record<string, unknown>, cb: (err?: Error) => void) => {
  report.key = `${report.branding}_${report.name}`;
  cb();
};

@BeforeCreate(assignKey)
@Entity('report')
export class ReportClass {
  @Attr({ type: 'string', unique: true })
  public key?: string;

  @Attr({ type: 'string', required: true })
  public name!: string;

  @Attr({ type: 'string', required: true })
  public title!: string;

  @BelongsTo('brandingconfig', { required: true })
  public branding!: string | number;

  @Attr({ type: 'string' })
  public reportSource?: string;

  @Attr({ type: 'json' })
  public solrQuery?: Record<string, unknown>;

  @Attr({ type: 'json' })
  public databaseQuery?: Record<string, unknown>;

  @Attr({ type: 'json', required: true })
  public filter!: Record<string, unknown>;

  @Attr({ type: 'json', required: true })
  public columns!: ReportColumn[];
}

// Export the Waterline model definition for runtime use
export const ReportWLDef = toWaterlineModelDef(ReportClass);

export interface ReportColumn {
  label: string;
  property: string;
  exportTemplate?: string;
  hide?: boolean;
  template?: string;
}

// Type interface for backwards compatibility
export interface ReportAttributes extends Sails.WaterlineAttributes {
  branding: string | number | BrandingConfigAttributes;
  columns: ReportColumn[];
  databaseQuery?: Record<string, unknown>;
  filter: Record<string, unknown>;
  key?: string;
  name: string;
  reportSource?: string;
  solrQuery?: Record<string, unknown>;
  title: string;
}

export interface ReportWaterlineModel extends Sails.Model<ReportAttributes> {
  attributes: ReportAttributes;
}

// Note: Using RBReport to avoid conflict with DOM's Report interface
declare global {
  const RBReport: ReportWaterlineModel;
}

