import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTabsDirective, I18NextPipe } from '@researchdatabox/portal-ng-common';
import { getOperationAST, parse, print } from 'graphql';
import type {
  EditorDiagnostic,
  GraphqlNamedQueryBinding,
  GraphqlNamedQueryDefinition,
  GraphqlNamedQueryDescription,
  GraphqlNamedQueryMappings,
  GraphqlNamedQueryVariable,
  NamedQueryJson,
} from '@researchdatabox/sails-ng-common';
import { QueryAssistanceModule } from './query-assistance.module';
import { GraphqlJsonInputComponent } from './graphql-json-input.component';

/** A detached draft editor: no persistence, navigation or explorer dependency. */
@Component({
  selector: 'nq-graphql-draft-editor',
  imports: [
    CommonModule,
    FormsModule,
    I18NextPipe,
    AdminTabsDirective,
    QueryAssistanceModule,
    GraphqlJsonInputComponent,
  ],
  templateUrl: './graphql-draft-editor.component.html',
})
export class GraphqlDraftEditorComponent implements OnChanges {
  @Input() draft!: GraphqlNamedQueryDefinition;
  @Input() isNew = false;
  @Input() advanced = false;
  @Input() candidateValues: Record<string, NamedQueryJson> = {};
  @Input() diagnostics: EditorDiagnostic[] = [];
  @Input() description: GraphqlNamedQueryDescription | null = null;
  @Output() draftChange = new EventEmitter<void>();
  @Output() validityChange = new EventEmitter<boolean>();
  get tabs() {
    return this.advanced ? ['document', 'variables', 'mappings'] : ['basics', 'document', 'variables', 'mappings'];
  }
  readonly visitedTabs = new Set(['basics']);
  private activeTab = 'basics';
  get tab(): string {
    return this.activeTab;
  }
  set tab(value: string) {
    this.activeTab = value;
    this.visitedTabs.add(value);
  }
  readonly mappingTargets: Array<keyof GraphqlNamedQueryMappings> = [
    'oid',
    'title',
    'metadata',
    'dateCreated',
    'lastSaveDate',
  ];
  readonly pagePaths = ['collectionPath', 'hasNextPagePath', 'endCursorPath'] as const;
  private invalid = new Set<string>();
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['draft']) {
      this.invalid.clear();
      this.visitedTabs.clear();
      this.tab = this.advanced ? 'document' : 'basics';
    }
  }
  variableKey(_index: number, variable: { name: string }): string {
    return variable.name;
  }
  get operation() {
    return this.draft.graphql;
  }
  private parsedDocument = '';
  private parsedName?: string;
  private parsedVariables: { name: string; inputType: string; required: boolean; hasDefault: boolean }[] = [];
  private parsedNames: string[] = [];
  private refreshDocument(): void {
    if (this.parsedDocument === this.operation.document && this.parsedName === this.operation.operationName) return;
    this.parsedDocument = this.operation.document;
    this.parsedName = this.operation.operationName;
    this.parsedVariables = [];
    this.parsedNames = [];
    try {
      const document = parse(this.operation.document, { maxTokens: 2000 });
      const operation = getOperationAST(document, this.operation.operationName);
      this.parsedVariables = (operation?.variableDefinitions ?? []).map(variable => ({
        name: variable.variable.name.value,
        inputType: print(variable.type),
        required: variable.type.kind === 'NonNullType',
        hasDefault: variable.defaultValue !== undefined,
      }));
      this.parsedNames = document.definitions.flatMap(node =>
        node.kind === 'OperationDefinition' && node.name ? [node.name.value] : []
      );
    } catch {
      /* Invalid documents stay editable without repeated parsing. */
    }
  }
  get variables() {
    this.refreshDocument();
    return this.parsedVariables;
  }
  get staleVariables(): string[] {
    const declared = new Set(this.variables.map(variable => variable.name));
    return Object.keys(this.operation.variables).filter(name => !declared.has(name));
  }
  get operationNames(): string[] {
    this.refreshDocument();
    return this.parsedNames;
  }
  ownership(name: string): string {
    if ([this.operation.lookup?.firstVariable, this.operation.lookup?.afterVariable].includes(name)) return 'server';
    return this.operation.variables[name]?.ownership ?? '';
  }
  setDocument(value: string): void {
    this.operation.document = value;
    this.reconcileVariableValidity();
    this.draftChange.emit();
  }
  private reconcileVariableValidity(): void {
    const controls = new Set<string>();
    for (const variable of this.variables) {
      // Match the template, including consumer controls in a conflicting saved binding.
      if (this.ownership(variable.name) === 'fixed') controls.add('variable:' + variable.name + ':fixed');
      if (this.binding(variable.name)) controls.add('variable:' + variable.name + ':default');
    }
    let removed = false;
    for (const key of this.invalid) {
      if (key.startsWith('variable:') && !controls.has(key)) {
        this.invalid.delete(key);
        removed = true;
      }
    }
    // Reconcile before Angular removes controls; retained controls keep their errors.
    if (removed) this.validityChange.emit(!this.invalid.size);
  }
  setOperationName(value: string): void {
    if (value.trim()) this.operation.operationName = value.trim();
    else delete this.operation.operationName;
    this.reconcileVariableValidity();
    this.draftChange.emit();
  }
  classify(name: string, ownership: string): void {
    if (!['fixed', 'consumer', 'omitted'].includes(ownership)) return;
    const variable = this.variables.find(variable => variable.name === name);
    const binding: GraphqlNamedQueryVariable =
      ownership === 'consumer'
        ? { ownership, parameter: name, inputType: variable?.inputType ?? '', required: variable?.required ?? false }
        : ownership === 'fixed'
          ? {
              ownership,
              value: Object.hasOwn(this.candidateValues, name) ? structuredClone(this.candidateValues[name]) : null,
            }
          : { ownership: 'omitted' };
    this.operation.variables = { ...this.operation.variables, [name]: binding };
    this.clearValidity(name);
    this.draftChange.emit();
  }
  binding(name: string): GraphqlNamedQueryBinding | null {
    const binding = this.operation.variables[name];
    return binding?.ownership === 'consumer' ? binding : null;
  }
  fixed(name: string): NamedQueryJson | undefined {
    const binding = this.operation.variables[name];
    return binding?.ownership === 'fixed' ? binding.value : undefined;
  }
  setFixed(name: string, value: NamedQueryJson | undefined): void {
    if (value === undefined) return;
    this.operation.variables[name] = { ownership: 'fixed', value };
    this.draftChange.emit();
  }
  setDefault(name: string, value: NamedQueryJson | undefined): void {
    const binding = this.binding(name);
    if (!binding) return;
    if (value === undefined) delete binding.defaultValue;
    else binding.defaultValue = value;
    this.draftChange.emit();
  }
  removeVariable(name: string): void {
    delete this.operation.variables[name];
    this.clearValidity(name);
    this.draftChange.emit();
  }
  validity(key: string, valid: boolean): void {
    if (valid) this.invalid.delete(key);
    else this.invalid.add(key);
    this.validityChange.emit(!this.invalid.size);
  }
  private clearValidity(name: string): void {
    this.invalid.delete('variable:' + name + ':fixed');
    this.invalid.delete('variable:' + name + ':default');
    this.validityChange.emit(!this.invalid.size);
  }
  setResultPath(value: NamedQueryJson | undefined): void {
    if (Array.isArray(value) && value.every((part): part is string => typeof part === 'string')) {
      this.operation.resultPath = value;
      this.draftChange.emit();
    }
  }
  setMapping(target: keyof GraphqlNamedQueryMappings, value: NamedQueryJson | undefined): void {
    this.operation.mappings ??= {};
    if (value === undefined) delete this.operation.mappings[target];
    else if (Array.isArray(value) && value.every((part): part is string => typeof part === 'string'))
      this.operation.mappings[target] = value;
    this.draftChange.emit();
  }
  toggleLookup(enabled: boolean): void {
    if (enabled)
      this.operation.lookup = {
        mode: 'firstPage',
        collectionPath: [],
        hasNextPagePath: [],
        firstVariable: '',
        afterVariable: '',
        searchParameter: '',
      };
    else {
      delete this.operation.lookup;
      for (const key of [...this.invalid]) if (key.startsWith('lookup:')) this.invalid.delete(key);
      this.validityChange.emit(!this.invalid.size);
    }
    this.draftChange.emit();
  }
  setPageVariable(field: 'firstVariable' | 'afterVariable', name: string): void {
    if (!this.operation.lookup) return;
    this.operation.lookup[field] = name;
    // Choosing adapter ownership explicitly removes the conflicting business binding.
    if (name) {
      delete this.operation.variables[name];
      this.clearValidity(name);
    }
    this.draftChange.emit();
  }
  setPagePath(field: 'collectionPath' | 'hasNextPagePath' | 'endCursorPath', value: NamedQueryJson | undefined): void {
    const lookup = this.operation.lookup;
    if (!lookup) return;
    if (field === 'endCursorPath' && value === undefined) delete lookup.endCursorPath;
    else if (Array.isArray(value) && value.every((part): part is string => typeof part === 'string'))
      lookup[field] = value;
    this.draftChange.emit();
  }
  omissionSatisfied(name: string): boolean {
    return (
      this.description?.operationVariables?.find(variable => variable.variable === name)?.omissionSatisfied ?? false
    );
  }
}
