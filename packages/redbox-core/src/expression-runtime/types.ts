import type { ActionActor, ActionJsonValue } from '../action-registry/contracts';
import type { ActionBindingId, ActionBindingScope } from '../action-registry/identifiers';
import { EXPRESSION_ARTIFACT_SCHEMA_VERSION, EXPRESSION_CONTEXT_SCHEMA_VERSION } from './limits';

export type ManagedExpressionEngine = 'jsonata' | 'handlebars';
export type ManagedTemplateDestination = 'plain-text' | 'html-text' | 'email-subject' | 'url-component';

export type SafeExpressionJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly SafeExpressionJsonValue[]
  | SafeExpressionJsonObject;

export interface SafeExpressionJsonObject {
  readonly [key: string]: SafeExpressionJsonValue;
}

export interface SafeExpressionRecordProjection {
  readonly oid?: string;
  readonly current?: SafeExpressionJsonObject;
  readonly candidate?: SafeExpressionJsonObject;
}

export interface SafeExpressionTransitionProjection {
  readonly id: string;
  readonly sourceStage: string;
  readonly targetStage: string;
}

export interface SafeExpressionPriorOutputProjection {
  readonly bindingId: ActionBindingId;
  readonly fields: SafeExpressionJsonObject;
}

interface ExpressionContextBase {
  readonly schemaVersion: typeof EXPRESSION_CONTEXT_SCHEMA_VERSION;
  readonly timestamp: string;
  readonly brandId: string;
  readonly recordTypeKey: string;
  readonly actor: Readonly<ActionActor> | null;
}

export interface TransitionConditionContext extends ExpressionContextBase {
  readonly purpose: 'transition-condition';
  readonly record: SafeExpressionRecordProjection;
  readonly transition: SafeExpressionTransitionProjection;
}

export interface ActionParameterExpressionContext extends ExpressionContextBase {
  readonly purpose: 'action-parameter';
  readonly executionId: string;
  readonly correlationId: string;
  readonly scope: Readonly<ActionBindingScope>;
  readonly record: SafeExpressionRecordProjection;
  readonly transition?: SafeExpressionTransitionProjection;
  readonly priorOutputs: readonly SafeExpressionPriorOutputProjection[];
}

export interface TextTemplateContext extends ExpressionContextBase {
  readonly purpose: 'text-template';
  readonly record: SafeExpressionRecordProjection;
  readonly transition?: SafeExpressionTransitionProjection;
}

export interface OutputDependencyExpressionContext {
  readonly schemaVersion: typeof EXPRESSION_CONTEXT_SCHEMA_VERSION;
  readonly purpose: 'output-dependency';
  readonly brandId: string;
  readonly recordTypeKey: string;
  readonly priorOutput: SafeExpressionPriorOutputProjection;
}

export type ManagedExpressionContext =
  | TransitionConditionContext
  | ActionParameterExpressionContext
  | TextTemplateContext
  | OutputDependencyExpressionContext;

export type ManagedJsonataContext =
  | TransitionConditionContext
  | ActionParameterExpressionContext
  | OutputDependencyExpressionContext;

export type ManagedJsonataValueContext = ActionParameterExpressionContext | OutputDependencyExpressionContext;

export interface PreparedJsonataExpression {
  readonly schemaVersion: typeof EXPRESSION_ARTIFACT_SCHEMA_VERSION;
  readonly engine: 'jsonata';
  readonly source: string;
  readonly astNodes: number;
}

export interface PreparedHandlebarsTemplate {
  readonly schemaVersion: typeof EXPRESSION_ARTIFACT_SCHEMA_VERSION;
  readonly engine: 'handlebars';
  readonly source: string;
  readonly destination: ManagedTemplateDestination;
  readonly astNodes: number;
}

export type PreparedActionParameter =
  | { readonly kind: 'jsonata'; readonly expression: PreparedJsonataExpression }
  | { readonly kind: 'handlebars'; readonly template: PreparedHandlebarsTemplate };

export interface ManagedEvaluationOptions {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export type ManagedJsonataResult = ActionJsonValue | undefined;

export type ManagedExpressionFailureKind = 'validation' | 'evaluation' | 'limit' | 'timeout' | 'interrupted' | 'worker';

export interface ManagedExpressionDiagnostic {
  readonly schemaVersion: typeof EXPRESSION_ARTIFACT_SCHEMA_VERSION;
  readonly engine: ManagedExpressionEngine;
  readonly kind: ManagedExpressionFailureKind;
  readonly code: string;
  readonly workerTerminated: boolean;
}
