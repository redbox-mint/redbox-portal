import { Attr, Entity } from '../../lib/decorators';

@Entity('useraudit')
export class UserAudit {
  @Attr({ type: 'json', required: true })
  public user!: Record<string, unknown>;

  @Attr({ type: 'string', required: true })
  public action!: string;

  @Attr({ type: 'json' })
  public additionalContext?: Record<string, unknown>;
}
