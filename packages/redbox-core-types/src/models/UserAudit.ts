import '../../sails';
import { JsonMap } from './types';

export interface UserAuditAttributes {
  action: string;
  additionalContext?: JsonMap;
  user: JsonMap;
}

export interface UserAuditWaterlineModel extends Sails.Model {
  attributes: UserAuditAttributes;
}

declare global {
  var UserAudit: UserAuditWaterlineModel;
}
