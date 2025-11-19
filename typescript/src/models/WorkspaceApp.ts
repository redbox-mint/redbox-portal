import { Attr, BelongsTo, Entity } from '../../lib/decorators';

@Entity('workspaceapp', {
  indexes: [
    {
      attributes: {
        app: 1,
        user: 1,
      },
      options: {
        unique: true,
      },
    },
  ],
})
export class WorkspaceApp {
  @Attr({ type: 'string', required: true })
  public app!: string;

  @BelongsTo('user', { required: true })
  public user!: string | number;

  @Attr({ type: 'json' })
  public info?: Record<string, unknown>;
}
