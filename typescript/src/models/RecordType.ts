import { Attr, BelongsTo, BeforeCreate, Entity, HasMany } from '../../lib/decorators';

const assignKey = (recordType: Record<string, any>, cb: (err?: Error) => void) => {
  recordType.key = `${recordType.branding}_${recordType.name}`;
  cb();
};

@BeforeCreate(assignKey)
@Entity('recordtype')
export class RecordType {
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
}
