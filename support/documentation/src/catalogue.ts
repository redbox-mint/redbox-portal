export const CATALOGUE_SCHEMA_VERSION = '1.0.0' as const;

export type Lifecycle = 'supported' | 'experimental' | 'deprecated' | 'internal' | 'unclassified';
export type SurfaceKind =
  | 'hook-protocol'
  | 'base-service'
  | 'base-controller'
  | 'service'
  | 'ajax-controller'
  | 'webservice-controller'
  | 'form-config'
  | 'form-component';

export interface SourceLocation {
  file: string;
  line: number;
  url: string;
}

export interface Documentation {
  summary: string;
  extensionSemantics?: string;
  caveats: string[];
  see: string[];
}

export interface ParameterContract {
  name: string;
  type: string;
  description?: string;
}

export interface MemberContract {
  id: string;
  name: string;
  lifecycle: Lifecycle;
  signature?: string;
  type?: string;
  defaultValue?: string;
  optional?: boolean;
  description?: string;
  parameters?: ParameterContract[];
  returns?: string;
  source: SourceLocation;
}

export interface RouteContract {
  method: string;
  path: string;
  action: string;
  authorization: string[];
}

export interface FormRelationships {
  definitionMapping?: string;
  visitorMethods: string[];
  angularComponent?: string;
  angularModel?: string;
}

export interface SurfaceContract {
  id: string;
  kind: SurfaceKind;
  name: string;
  lifecycle: Lifecycle;
  documentation: Documentation;
  source: SourceLocation;
  members: MemberContract[];
  routes?: RouteContract[];
  relationships?: FormRelationships;
  example?: string;
}

export type DiagnosticCode =
  | 'unclassified'
  | 'missing-summary'
  | 'missing-extension-semantics'
  | 'undocumented-member'
  | 'missing-parameter-description'
  | 'missing-return-description'
  | 'missing-example'
  | 'invalid-example'
  | 'invalid-link'
  | 'form-contract-mismatch';

export interface DocumentationDiagnostic {
  code: DiagnosticCode;
  severity: 'advisory';
  surfaceId?: string;
  message: string;
  source?: SourceLocation;
}

export interface DocumentationHealth {
  schemaVersion: typeof CATALOGUE_SCHEMA_VERSION;
  generatedAt: string;
  sourceCommit: string;
  findingCount: number;
  findings: DocumentationDiagnostic[];
}

export interface Catalogue {
  schemaVersion: typeof CATALOGUE_SCHEMA_VERSION;
  generatedAt: string;
  sourceCommit: string;
  surfaces: SurfaceContract[];
  diagnostics: DocumentationDiagnostic[];
}
