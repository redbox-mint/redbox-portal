import type {
  AuthorizationScopeRisk,
  AuthorizationScopeSourceType,
  AuthorizationScopeStatus,
} from '../../authorization';

export class AuthorizationScopeModel {
  id = '';
  key = '';
  namespace = '';
  label = '';
  description = '';
  risk: AuthorizationScopeRisk = 'read';
  sourceType: AuthorizationScopeSourceType = 'core';
  sourcePackage = '';
  sourceVersion = '';
  status: AuthorizationScopeStatus = 'active';
  replacementKey?: string;
  lastSeenGeneration = '';
  metadataVersion = 1;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}
