/// <reference path="../sails.ts" />
import { Entity, Attr, BelongsTo, toWaterlineModelDef } from '../decorators';
import { UserAttributes } from './User';

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
export class WorkspaceAppClass {
  @Attr({ type: 'string', required: true })
  public app!: string;

  @BelongsTo('user', { required: true })
  public user!: string | number;

  @Attr({ type: 'json' })
  public info?: Record<string, unknown>;
}

// Export the Waterline model definition for runtime use
export const WorkspaceAppWLDef = toWaterlineModelDef(WorkspaceAppClass);

// Type interface for backwards compatibility
export interface WorkspaceAppAttributes extends Sails.WaterlineAttributes {
  app: string;
  info?: Record<string, unknown>;
  user: string | number | UserAttributes;
}

export interface WorkspaceAppWaterlineModel extends Sails.Model<WorkspaceAppAttributes> {
  attributes: WorkspaceAppAttributes;
}

declare global {
  const WorkspaceApp: WorkspaceAppWaterlineModel;
}
