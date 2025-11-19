import { Attr, BelongsTo, BeforeCreate, Entity } from '../../lib/decorators';

const assignKey = (dashboardType: Record<string, any>, cb: (err?: Error) => void) => {
  dashboardType.key = `${dashboardType.branding}_${dashboardType.name}`;
  cb();
};

@BeforeCreate(assignKey)
@Entity('dashboardtype')
export class DashboardType {
  @Attr({ type: 'string', unique: true })
  public key?: string;

  @Attr({ type: 'string', required: true })
  public name!: string;

  @BelongsTo('brandingconfig', { required: true })
  public branding!: string | number;

  @Attr({ type: 'json', required: true })
  public formatRules!: Record<string, unknown>;

  @Attr({ type: 'boolean', defaultsTo: true })
  public searchable?: boolean;
}
