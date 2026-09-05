export type AuthorizationRolloutMode = 'legacy' | 'shadow' | 'enforce';
export type AuthorizationProjectionAuthMethod = 'anonymous' | 'session' | 'bearer' | 'internal';
export type AuthorizationProjectionProtectedRoleKind = 'none' | 'guest' | 'brand-admin' | 'system-admin';
export type AuthorizationProjectionAssignmentSource = 'manual' | 'onboarding' | 'migration' | 'external' | 'recovery';

export type AuthorizationPrincipalCategory =
  | 'anonymous'
  | 'authenticated'
  | 'system-admin'
  | 'legacy-bearer'
  | 'system-process';

export interface AuthorizationProjection {
  brand?: {
    id: string;
    name: string;
  };
  rolloutMode: AuthorizationRolloutMode;
  principal: {
    category: AuthorizationPrincipalCategory;
    authMethod: AuthorizationProjectionAuthMethod;
    active: boolean;
    userId?: string;
  };
  roles: Array<{
    id: string;
    key: string;
    displayName: string;
    contextType: 'brand' | 'system';
    brandId?: string;
    protectedKind: AuthorizationProjectionProtectedRoleKind;
    implicit: boolean;
    assignmentCount?: number;
    assignmentsTruncated?: boolean;
    assignments?: Array<{
      assignmentId: string;
      source: AuthorizationProjectionAssignmentSource;
      sourceKey: string;
      expiresAt?: string;
    }>;
  }>;
  scopeKeys: string[];
}

export type AuthorizationProjectionStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface AuthorizationProjectionState {
  status: AuthorizationProjectionStatus;
  projection?: AuthorizationProjection;
  error?: unknown;
}
