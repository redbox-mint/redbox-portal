export type ActionContractValidationErrorCode =
  | 'invalid-action-definition-id'
  | 'invalid-action-binding-id'
  | 'invalid-action-descriptor'
  | 'invalid-action-binding'
  | 'invalid-action-context'
  | 'invalid-action-result'
  | 'invalid-action-output'
  | 'invalid-action-patch'
  | 'unsupported-action-result'
  | 'action-contract-version-mismatch'
  | 'unsupported-action-scope'
  | 'invalid-action-parameters'
  | 'action-policy-exceeds-bounds'
  | 'duplicate-action-definition-id'
  | 'duplicate-action-binding-id'
  | 'duplicate-action-binding-order'
  | 'invalid-action-dependency';

export interface ActionContractValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export function isActionContractValidationError(value: object): value is ActionContractValidationError {
  return value instanceof ActionContractValidationError;
}

export class ActionContractValidationError extends Error {
  readonly code: ActionContractValidationErrorCode;
  readonly issues: readonly ActionContractValidationIssue[];

  constructor(
    code: ActionContractValidationErrorCode,
    message: string,
    issues: readonly ActionContractValidationIssue[]
  ) {
    super(message);
    this.name = 'ActionContractValidationError';
    this.code = code;
    this.issues = issues;
  }
}
