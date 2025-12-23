import { Attr, BelongsTo, BeforeCreate, Entity } from '../../lib/decorators';

const assignKey = (report: Record<string, any>, cb: (err?: Error) => void) => {
  report.key = `${report.branding}_${report.name}`;
  cb();
};

@BeforeCreate(assignKey)
@Entity('report')
export class Report {
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

export interface ReportColumn {
  label: string;
  property: string;
  exportTemplate?: string;
  hide?: boolean;
  template?: string;
}
