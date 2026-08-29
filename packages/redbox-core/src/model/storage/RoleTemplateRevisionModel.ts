import type { ScopeKey } from '../../authorization';
import type { RoleTemplateModel } from './RoleTemplateModel';

export class RoleTemplateRevisionModel {
  id = '';
  template!: string | RoleTemplateModel;
  revision = 1;
  scopeKeys: ScopeKey[] = [];
  notes?: string;
  publishedBy = '';
  publishedAt!: string | Date;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}
