import { expect } from 'chai';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { globSync } from 'glob';
import {
  type HooksFixture,
  type JsonValue,
  type LegacyActionInventory,
  type RepresentativeConfiguration,
  type RepresentativeDatabase,
  loadLegacyActionInventory,
  loadLegacyActionMappings,
  loadNegativeFixture,
  loadRepresentativeConfiguration,
  loadRepresentativeDatabase,
  parseLegacyActionInventory,
  parseLegacyActionMappings,
  parseRepresentativeConfiguration,
  parseRepresentativeDatabase,
  repositoryRoot,
} from '../fixtures/legacy-record-actions/fixtures';

const LIFECYCLE_MODES = ['onCreate', 'onUpdate', 'onDelete', 'onTransitionWorkflow'] as const;
const PHASES = ['pre', 'postSync', 'post'] as const;
const SHIPPED_CONFIG_SOURCE_GLOBS: string[] = [
  'packages/redbox-core/src/config/**/*.ts',
  'packages/redbox-hook-dev/src/config/**/*.ts',
  'packages/*hook*/src/config/**/*.{ts,js,json}',
];
const SHIPPED_CONFIG_EXCLUSION_GLOBS: string[] = [
  '**/dist/**',
  '**/node_modules/**',
  '**/coverage/**',
  'packages/**/test/**',
  'test/**',
  'support/wiki/**',
  'support/specs/**',
  'packages/redbox-core/src/config/brandingConfigurationDefaults.config.ts',
];
const MIGRATED_AUTOMATIC_TRANSITION_EXPRESSION = 'sails.services.triggerservice.transitionWorkflow';
const MIGRATED_AUTOMATIC_TRANSITION_OCCURRENCES = 2;
const REPRESENTATIVE_IDENTITIES = {
  brands: ['brand-default', 'brand-secondary'],
  workflowSteps: ['workflow-default-draft', 'workflow-default-published', 'workflow-secondary-draft'],
} as const satisfies { brands: readonly string[]; workflowSteps: readonly string[] };

type LifecycleMode = (typeof LIFECYCLE_MODES)[number];
type Phase = (typeof PHASES)[number];
type Nesting = 'record-hook' | 'onNotifySuccess' | 'runHooksSync' | 'queuedTriggerConfiguration' | 'nested-executable';
type InventoryOccurrence = LegacyActionInventory['actions'][number]['occurrences'][number];
type SourceOptions = InventoryOccurrence['sourceOptions'];
type ConfiguredRecordType = RepresentativeConfiguration['recordtype'][string];
type ConfiguredWorkflowStage = RepresentativeConfiguration['workflow'][string][string];
type DatabaseRecordType = RepresentativeDatabase['recordTypes'][number];
type DatabaseWorkflowStep = RepresentativeDatabase['workflowSteps'][number];

function omitJsonPath(value: JsonValue, pathParts: readonly (string | number)[]): JsonValue {
  const [head, ...tail] = pathParts;
  if (head === undefined) {
    throw new Error('An omission path must identify a field or row.');
  }
  if (Array.isArray(value)) {
    if (typeof head !== 'number') {
      throw new Error('Expected an array index.');
    }
    return tail.length === 0
      ? value.filter((_item, index) => index !== head)
      : value.map((item, index) => (index === head ? omitJsonPath(item, tail) : item));
  }
  if (value === null || typeof value !== 'object' || typeof head !== 'string') {
    throw new Error('Cannot omit a field from a non-object JSON value.');
  }
  if (tail.length === 0) {
    const { [head]: _omitted, ...remaining } = value;
    return remaining;
  }
  return { ...value, [head]: omitJsonPath(value[head], tail) };
}

interface ScannedOccurrence {
  expression: string;
  file: string;
  line: number;
  recordType: string;
  lifecycleMode: LifecycleMode;
  phase: Phase;
  order: number;
  nesting: Nesting;
  parentOrder?: number;
  sourceParameterShape: SourceParameterShape;
  sourceOptions: SourceOptions;
}

interface SourceParameterShape {
  keys: string[];
  nested: Record<string, string[]>;
}

interface ComparableOccurrence {
  expression: string;
  file: string;
  line: number;
  recordType: string;
  lifecycleMode: LifecycleMode;
  phase: Phase;
  order: number;
  nesting: Nesting;
  parentOrder?: number;
  sourceOptions: SourceOptions;
}

interface ConfiguredFunctionOccurrence {
  expression: string;
  nesting: Nesting;
  path: string;
}

interface ConfiguredTransitionTarget {
  recordType: string;
  path: string;
  stage: string;
  stageLabel: string;
  form: string;
}

function isLifecycleMode(value: string): value is LifecycleMode {
  return LIFECYCLE_MODES.some(mode => mode === value);
}

function isPhase(value: string): value is Phase {
  return PHASES.some(phase => phase === value);
}

function propertyName(node: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return undefined;
}

function objectProperty(object: ts.ObjectLiteralExpression, name: string): ts.PropertyAssignment | undefined {
  return object.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && propertyName(property.name) === name
  );
}

function stringInitializer(property: ts.PropertyAssignment | undefined): ts.StringLiteralLike | undefined {
  if (
    property &&
    (ts.isStringLiteral(property.initializer) || ts.isNoSubstitutionTemplateLiteral(property.initializer))
  ) {
    return property.initializer;
  }
  return undefined;
}

function nestingName(relativePath: readonly (string | number)[]): Nesting {
  if (relativePath.includes('onNotifySuccess')) {
    return 'onNotifySuccess';
  }
  if (relativePath.includes('hooks')) {
    return 'runHooksSync';
  }
  if (relativePath.includes('triggerConfiguration')) {
    return 'queuedTriggerConfiguration';
  }
  return 'nested-executable';
}

function configuredNestingName(functionPath: string): Nesting {
  if (functionPath.includes('.onNotifySuccess[')) {
    return 'onNotifySuccess';
  }
  if (functionPath.includes('.options.hooks[')) {
    return 'runHooksSync';
  }
  if (functionPath.includes('.triggerConfiguration.function')) {
    return 'queuedTriggerConfiguration';
  }
  return 'nested-executable';
}

function sourceParameterShape(initializer: ts.Expression | undefined): SourceParameterShape {
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
    return { keys: [], nested: {} };
  }
  const keys: string[] = [];
  const nested: Record<string, string[]> = {};
  for (const property of initializer.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    const name = propertyName(property.name);
    if (name === undefined) {
      continue;
    }
    keys.push(name);
    if (ts.isArrayLiteralExpression(property.initializer)) {
      const nestedKeys = new Set<string>();
      for (const element of property.initializer.elements) {
        if (!ts.isObjectLiteralExpression(element)) {
          continue;
        }
        for (const nestedProperty of element.properties) {
          if (ts.isPropertyAssignment(nestedProperty)) {
            const nestedName = propertyName(nestedProperty.name);
            if (nestedName !== undefined) {
              nestedKeys.add(nestedName);
            }
          }
        }
      }
      if (nestedKeys.size > 0) {
        nested[`${name}[]`] = [...nestedKeys].sort();
      }
    }
  }
  return { keys: keys.sort(), nested };
}

function sourceOptions(source: ts.SourceFile, property: ts.PropertyAssignment | undefined): SourceOptions {
  if (!property) {
    return { presence: 'absent' };
  }
  if (!ts.isObjectLiteralExpression(property.initializer)) {
    throw new Error(
      `The options value '${property.initializer.getText(source)}' in ${source.fileName} is not an object.`
    );
  }
  return { presence: 'present' };
}

function scanNestedFunctions(
  source: ts.SourceFile,
  node: ts.Node,
  relativePath: readonly (string | number)[],
  base: Pick<ScannedOccurrence, 'file' | 'recordType' | 'lifecycleMode' | 'phase'>,
  parentOrder: number,
  results: ScannedOccurrence[]
): void {
  if (ts.isObjectLiteralExpression(node)) {
    if (relativePath.length > 0) {
      const functionProperty = objectProperty(node, 'function');
      const expression = stringInitializer(functionProperty);
      if (functionProperty && expression) {
        const arrayIndex = [...relativePath].reverse().find((part): part is number => typeof part === 'number');
        const options = objectProperty(node, 'options');
        results.push({
          ...base,
          expression: expression.text,
          line: source.getLineAndCharacterOfPosition(functionProperty.getStart(source)).line + 1,
          order: arrayIndex ?? 0,
          nesting: nestingName(relativePath),
          parentOrder,
          sourceParameterShape: sourceParameterShape(options?.initializer),
          sourceOptions: sourceOptions(source, options),
        });
      }
    }

    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) {
        continue;
      }
      const name = propertyName(property.name);
      if (name === undefined || (relativePath.length === 0 && name === 'function')) {
        continue;
      }
      scanNestedFunctions(source, property.initializer, [...relativePath, name], base, parentOrder, results);
    }
    return;
  }

  if (ts.isArrayLiteralExpression(node)) {
    node.elements.forEach((element, index) => {
      scanNestedFunctions(source, element, [...relativePath, index], base, parentOrder, results);
    });
  }
}

function scanMode(
  source: ts.SourceFile,
  modeObject: ts.ObjectLiteralExpression,
  lifecycleMode: LifecycleMode,
  objectPath: readonly string[],
  relativeFile: string,
  results: ScannedOccurrence[]
): void {
  const hooksIndex = objectPath.lastIndexOf('hooks');
  const recordType = hooksIndex > 0 ? objectPath[hooksIndex - 1] : '<unresolved-record-type>';

  for (const phaseProperty of modeObject.properties) {
    if (!ts.isPropertyAssignment(phaseProperty)) {
      continue;
    }
    const phaseName = propertyName(phaseProperty.name);
    if (!phaseName || !isPhase(phaseName) || !ts.isArrayLiteralExpression(phaseProperty.initializer)) {
      continue;
    }

    phaseProperty.initializer.elements.forEach((element, order) => {
      if (!ts.isObjectLiteralExpression(element)) {
        return;
      }
      const functionProperty = objectProperty(element, 'function');
      const expression = stringInitializer(functionProperty);
      if (!functionProperty || !expression) {
        return;
      }
      const base = { file: relativeFile, recordType, lifecycleMode, phase: phaseName };
      const options = objectProperty(element, 'options');
      results.push({
        ...base,
        expression: expression.text,
        line: source.getLineAndCharacterOfPosition(functionProperty.getStart(source)).line + 1,
        order,
        nesting: 'record-hook',
        sourceParameterShape: sourceParameterShape(options?.initializer),
        sourceOptions: sourceOptions(source, options),
      });

      if (options) {
        scanNestedFunctions(source, options.initializer, [], base, order, results);
      }
    });
  }
}

function scanSource(filePath: string): ScannedOccurrence[] {
  const relativeFile = path.relative(repositoryRoot, filePath).split(path.sep).join('/');
  const source = ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    path.extname(filePath) === '.json' ? ts.ScriptKind.JSON : ts.ScriptKind.TS
  );
  const results: ScannedOccurrence[] = [];

  function visit(node: ts.Node, objectPath: readonly string[]): void {
    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property)) {
          continue;
        }
        const name = propertyName(property.name);
        if (name === undefined) {
          continue;
        }
        if (isLifecycleMode(name) && ts.isObjectLiteralExpression(property.initializer)) {
          scanMode(source, property.initializer, name, objectPath, relativeFile, results);
        } else {
          visit(property.initializer, [...objectPath, name]);
        }
      }
      return;
    }
    ts.forEachChild(node, child => visit(child, objectPath));
  }

  visit(source, []);
  return results;
}

function discoverShippedConfigSources(): string[] {
  return [
    ...new Set(
      globSync(SHIPPED_CONFIG_SOURCE_GLOBS, {
        absolute: true,
        cwd: repositoryRoot,
        nodir: true,
        ignore: SHIPPED_CONFIG_EXCLUSION_GLOBS,
      })
    ),
  ].sort();
}

function normalizedOccurrence(occurrence: ScannedOccurrence): ComparableOccurrence {
  return {
    expression: occurrence.expression,
    file: occurrence.file,
    line: occurrence.line,
    recordType: occurrence.recordType,
    lifecycleMode: occurrence.lifecycleMode,
    phase: occurrence.phase,
    order: occurrence.order,
    nesting: occurrence.nesting,
    sourceOptions: occurrence.sourceOptions,
    ...(occurrence.parentOrder === undefined ? {} : { parentOrder: occurrence.parentOrder }),
  };
}

function inventoryOccurrences(inventory: LegacyActionInventory): ScannedOccurrence[] {
  return inventory.actions.flatMap(action =>
    action.occurrences.map((occurrence: InventoryOccurrence) => ({
      expression: action.legacyExpression,
      file: occurrence.source.file,
      line: occurrence.source.line,
      recordType: occurrence.recordType,
      lifecycleMode: occurrence.lifecycleMode,
      phase: occurrence.phase,
      order: occurrence.order,
      nesting: occurrence.nesting,
      sourceParameterShape: { keys: [], nested: {} },
      sourceOptions: occurrence.sourceOptions,
      ...(occurrence.parentOrder === undefined ? {} : { parentOrder: occurrence.parentOrder }),
    }))
  );
}

function sortedOccurrences(occurrences: ScannedOccurrence[]): ComparableOccurrence[] {
  return occurrences
    .map(normalizedOccurrence)
    .sort((left, right) =>
      `${left.file}:${String(left.line).padStart(5, '0')}`.localeCompare(
        `${right.file}:${String(right.line).padStart(5, '0')}`
      )
    );
}

function migratedOccurrenceProjection(
  occurrence: ScannedOccurrence,
  historical: boolean
): Omit<ComparableOccurrence, 'line'> {
  const normalized = normalizedOccurrence(occurrence);
  const { line: _line, ...projected } = normalized;
  if (
    !historical ||
    projected.file !== 'packages/redbox-hook-dev/src/config/recordtype.ts' ||
    projected.recordType !== 'dataPublication' ||
    projected.phase !== 'pre' ||
    (projected.lifecycleMode !== 'onCreate' && projected.lifecycleMode !== 'onUpdate')
  ) {
    return projected;
  }
  return {
    ...projected,
    ...(projected.nesting === 'record-hook' ? { order: projected.order - 1 } : {}),
    ...(projected.parentOrder === undefined ? {} : { parentOrder: projected.parentOrder - 1 }),
  };
}

function sortedMigratedOccurrences(
  occurrences: ScannedOccurrence[],
  historical: boolean
): Omit<ComparableOccurrence, 'line'>[] {
  return occurrences
    .map(occurrence => migratedOccurrenceProjection(occurrence, historical))
    .sort((left, right) => {
      const leftKey = JSON.stringify(left);
      const rightKey = JSON.stringify(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
}

function collectNestedFunctions(
  value: JsonValue,
  pathPrefix: string,
  occurrences: ConfiguredFunctionOccurrence[]
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectNestedFunctions(item, `${pathPrefix}[${index}]`, occurrences);
    });
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }

  for (const key of Object.keys(value)) {
    const child = value[key];
    const childPath = `${pathPrefix}.${key}`;
    if (key === 'function' && typeof child === 'string') {
      occurrences.push({ expression: child, nesting: configuredNestingName(childPath), path: childPath });
    } else {
      collectNestedFunctions(child, childPath, occurrences);
    }
  }
}

function configuredFunctionOccurrences(hooks: HooksFixture): ConfiguredFunctionOccurrence[] {
  const occurrences: ConfiguredFunctionOccurrence[] = [];
  for (const lifecycleMode of LIFECYCLE_MODES) {
    const mode = hooks[lifecycleMode];
    if (!mode) {
      continue;
    }
    for (const phase of PHASES) {
      mode[phase]?.forEach((definition, order) => {
        const definitionPath = `hooks.${lifecycleMode}.${phase}[${order}]`;
        occurrences.push({
          expression: definition.function,
          nesting: 'record-hook',
          path: `${definitionPath}.function`,
        });
        if (definition.options) {
          collectNestedFunctions(definition.options, `${definitionPath}.options`, occurrences);
        }
      });
    }
  }
  return occurrences;
}

function requiredStringOption(
  options: Record<string, JsonValue> | undefined,
  optionName: string,
  definitionPath: string
): string {
  const value = options?.[optionName];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${definitionPath}.options.${optionName} must be a non-empty string.`);
  }
  return value;
}

function configuredTransitionTargets(configuration: RepresentativeConfiguration): ConfiguredTransitionTarget[] {
  const targets: ConfiguredTransitionTarget[] = [];
  for (const [recordTypeName, recordType] of Object.entries(configuration.recordtype)) {
    for (const lifecycleMode of LIFECYCLE_MODES) {
      const mode = recordType.hooks[lifecycleMode];
      if (!mode) {
        continue;
      }
      for (const phase of PHASES) {
        mode[phase]?.forEach((definition, order) => {
          if (definition.function !== 'sails.services.triggerservice.transitionWorkflow') {
            return;
          }
          const path = `recordtype.${recordTypeName}.hooks.${lifecycleMode}.${phase}[${order}]`;
          targets.push({
            recordType: recordTypeName,
            path,
            stage: requiredStringOption(definition.options, 'targetWorkflowStageName', path),
            stageLabel: requiredStringOption(definition.options, 'targetWorkflowStageLabel', path),
            form: requiredStringOption(definition.options, 'targetForm', path),
          });
        });
      }
    }
  }
  return targets;
}

function persistedRecordTypeProjection(
  recordTypeName: string,
  config: ConfiguredRecordType,
  branding: string
): Omit<DatabaseRecordType, 'id'> {
  return {
    key: `${branding}_${recordTypeName}`,
    name: recordTypeName,
    branding,
    packageType: config.packageType,
    searchable: config.searchable,
    hooks: config.hooks,
  };
}

function withoutRecordTypeId(recordType: DatabaseRecordType): Omit<DatabaseRecordType, 'id'> {
  const { id: _id, ...persistedFields } = recordType;
  return persistedFields;
}

function withoutWorkflowStepId(workflowStep: DatabaseWorkflowStep): Omit<DatabaseWorkflowStep, 'id'> {
  const { id: _id, ...persistedFields } = workflowStep;
  return persistedFields;
}

function persistedWorkflowStepProjection(
  stageName: string,
  stage: ConfiguredWorkflowStage,
  recordTypeId: string
): Omit<DatabaseWorkflowStep, 'id'> {
  return {
    name: stageName,
    recordType: recordTypeId,
    starting: stage.starting,
    hidden: stage.hidden ?? false,
    config: stage.config,
  };
}

describe('A01 legacy record action inventory', function () {
  const inventory = loadLegacyActionInventory();
  const mappings = loadLegacyActionMappings();
  const representativeConfig = loadRepresentativeConfiguration();
  const representativeDatabase = loadRepresentativeDatabase();

  it('reconciles the canonical inventory with shipped source metadata', function () {
    const scanned = discoverShippedConfigSources().flatMap(scanSource);
    const activeInventory = inventoryOccurrences(inventory).filter(
      occurrence => occurrence.expression !== MIGRATED_AUTOMATIC_TRANSITION_EXPRESSION
    );

    expect(sortedMigratedOccurrences(activeInventory, true)).to.deep.equal(sortedMigratedOccurrences(scanned, false));
    expect(inventory.scan.includedSourceGroups.flatMap(group => group.paths).sort()).to.deep.equal(
      [...SHIPPED_CONFIG_SOURCE_GLOBS].sort()
    );
    expect(inventory.scan.exclusions.flatMap(exclusion => exclusion.paths).sort()).to.deep.equal(
      [...SHIPPED_CONFIG_EXCLUSION_GLOBS].sort()
    );
    expect(scanned).to.have.length(
      inventory.scan.expectedCounts.totalExecutableOccurrences - MIGRATED_AUTOMATIC_TRANSITION_OCCURRENCES
    );
    expect(scanned.filter(occurrence => occurrence.nesting === 'record-hook')).to.have.length(
      inventory.scan.expectedCounts.recordHookDefinitions - MIGRATED_AUTOMATIC_TRANSITION_OCCURRENCES
    );
    expect(scanned.filter(occurrence => occurrence.nesting !== 'record-hook')).to.have.length(
      inventory.scan.expectedCounts.nestedExecutableDefinitions
    );
    expect(new Set(scanned.map(occurrence => occurrence.expression)).size).to.equal(
      inventory.scan.expectedCounts.uniqueLegacyExpressions - 1
    );

    const documentedCounts = new Map(
      inventory.scan.includedSourceGroups.map(group => [group.name, group.occurrenceCount])
    );
    expect(scanned.filter(item => item.file.startsWith('packages/redbox-core/'))).to.have.length(
      documentedCounts.get('core-record-type-config') ?? -1
    );
    expect(scanned.filter(item => item.file.startsWith('packages/redbox-hook-dev/'))).to.have.length(
      (documentedCounts.get('redbox-hook-dev') ?? 0) - MIGRATED_AUTOMATIC_TRANSITION_OCCURRENCES
    );
  });

  it('reconciles mappings and parameter shapes with canonical artifacts and source', function () {
    const scanned = discoverShippedConfigSources().flatMap(scanSource);
    const fixtureExpressions = configuredFunctionOccurrences(
      representativeConfig.recordtype['legacy-action-fixture'].hooks
    ).map(occurrence => occurrence.expression);
    const expectedExpressions = [...new Set([...scanned.map(item => item.expression), ...fixtureExpressions])].sort();
    const mappingByExpression = new Map(mappings.mappings.map(mapping => [mapping.legacyExpression, mapping]));
    const actionByExpression = new Map(inventory.actions.map(action => [action.legacyExpression, action]));

    expect([...mappingByExpression.keys()].sort()).to.deep.equal(expectedExpressions);
    expect(mappingByExpression.size).to.equal(mappings.mappings.length);
    expect(actionByExpression.size).to.equal(inventory.actions.length);

    for (const expression of expectedExpressions) {
      const mapping = mappingByExpression.get(expression);
      expect(mapping, expression).not.to.equal(undefined);
      if (!mapping) {
        throw new Error('Missing migration mapping for ' + expression + '.');
      }
      expect(mapping.actionId).to.match(/^redbox\.core\.[a-z0-9.-]+$/);
      expect(mapping.contractVersion).to.equal(1);
      expect(mapping.owner).to.equal('@researchdatabox/redbox-core');
      expect(Object.values(mapping.parameterTransform).some(value => value !== undefined)).to.equal(true);

      const action = actionByExpression.get(expression);
      const occurrences = scanned.filter(occurrence => occurrence.expression === expression);
      if (!action) {
        expect(occurrences, expression).to.be.empty;
        expect(mapping.shippedOccurrenceCount, expression).to.equal(0);
        continue;
      }
      expect(mapping.actionId).to.equal(action.proposedActionId);
      expect(action.occurrences).to.have.length(
        occurrences.length +
          (expression === MIGRATED_AUTOMATIC_TRANSITION_EXPRESSION ? MIGRATED_AUTOMATIC_TRANSITION_OCCURRENCES : 0)
      );
      expect(mapping.shippedOccurrenceCount ?? occurrences.length).to.equal(occurrences.length);
      expect(new Set(action.parameterShape.required).size).to.equal(action.parameterShape.required.length);
      expect(new Set(action.parameterShape.optional).size).to.equal(action.parameterShape.optional.length);
      expect(action.parameterShape.required.some(name => action.parameterShape.optional.includes(name))).to.equal(
        false
      );

      for (const occurrence of occurrences) {
        const declaredKeys = [...action.parameterShape.required, ...action.parameterShape.optional];
        expect(occurrence.sourceParameterShape.keys.filter(key => !declaredKeys.includes(key))).to.deep.equal([]);
        expect(
          action.parameterShape.required.filter(key => !occurrence.sourceParameterShape.keys.includes(key))
        ).to.deep.equal([]);
        expect(occurrence.sourceParameterShape.nested).to.deep.equal(
          Object.fromEntries(
            Object.entries(action.parameterShape.nested ?? {}).filter(([name]) =>
              Object.hasOwn(occurrence.sourceParameterShape.nested, name)
            )
          )
        );
      }
    }

    expect(mappingByExpression.get(MIGRATED_AUTOMATIC_TRANSITION_EXPRESSION)?.migrationTargetKind).to.equal(
      'automatic-transition'
    );
    expect(mappingByExpression.get('sails.services.triggerservice.runHooksSync')?.migrationTargetKind).to.equal(
      'flatten-only'
    );
    expect(mappingByExpression.get('sails.services.rdmpservice.queueTriggerCall')?.migrationTargetKind).to.equal(
      'queue-binding'
    );
    const classifications = new Set(inventory.actions.flatMap(action => action.behavior.classifications));
    expect(classifications).to.include.members([
      'direct-mutation',
      'replacement-return',
      'side-effect-only',
      'nested-callback',
    ]);
  });

  it('derives persisted representative rows, stages, and transition targets from fixture artifacts', function () {
    expect(representativeDatabase.brands.map(brand => brand.id)).to.deep.equal(REPRESENTATIVE_IDENTITIES.brands);
    expect(new Set(representativeDatabase.brands.map(brand => brand.id)).size).to.equal(
      representativeDatabase.brands.length
    );
    expect(representativeDatabase.workflowSteps.map(step => step.id)).to.deep.equal(
      REPRESENTATIVE_IDENTITIES.workflowSteps
    );

    const defaultBrand = representativeDatabase.brands.find(brand => brand.name === 'default');
    const secondaryBrand = representativeDatabase.brands.find(brand => brand.name === 'secondary');
    if (!defaultBrand || !secondaryBrand) {
      throw new Error('The representative database must include default and secondary brands.');
    }
    const defaultRecordTypes = representativeDatabase.recordTypes.filter(row => row.branding === defaultBrand.id);
    const expectedDefaultRows = Object.entries(representativeConfig.recordtype).map(([name, config]) =>
      persistedRecordTypeProjection(name, config, defaultBrand.id)
    );
    expect(defaultRecordTypes.map(withoutRecordTypeId)).to.have.deep.members(expectedDefaultRows);

    const recordTypeById = new Map(representativeDatabase.recordTypes.map(row => [row.id, row]));
    for (const step of representativeDatabase.workflowSteps) {
      const recordType = recordTypeById.get(step.recordType);
      const configured = recordType && representativeConfig.workflow[recordType.name]?.[step.name];
      expect(configured, step.id).not.to.equal(undefined);
      if (!recordType || !configured) {
        throw new Error('Workflow step ' + step.id + ' has no configuration fixture.');
      }
      expect(withoutWorkflowStepId(step)).to.deep.equal(
        persistedWorkflowStepProjection(step.name, configured, recordType.id)
      );
    }

    const defaultByName = new Map(defaultRecordTypes.map(row => [row.name, row]));
    for (const target of configuredTransitionTargets(representativeConfig)) {
      const configured = representativeConfig.workflow[target.recordType]?.[target.stage];
      expect(configured?.config.workflow.stageLabel, target.path).to.equal(target.stageLabel);
      expect(configured?.config.form, target.path).to.equal(target.form);
      const recordType = defaultByName.get(target.recordType);
      expect(
        representativeDatabase.workflowSteps.some(
          step => step.recordType === recordType?.id && step.name === target.stage
        ),
        target.path
      ).to.equal(true);
    }

    const defaultFixture = defaultByName.get('legacy-action-fixture');
    const secondaryFixture = representativeDatabase.recordTypes.find(
      row => row.branding === secondaryBrand.id && row.name === 'legacy-action-fixture'
    );
    expect(defaultFixture).not.to.equal(undefined);
    expect(secondaryFixture).not.to.equal(undefined);
    expect(secondaryFixture?.hooks).not.to.deep.equal(defaultFixture?.hooks);
    expect(representativeDatabase.records[0].metaMetadata.brandId).to.equal(defaultBrand.id);
  });

  it('maps every executable fixture path and leaves the negative expression fail-closed', function () {
    const mappingExpressions = new Set(mappings.mappings.map(mapping => mapping.legacyExpression));
    const configuredOccurrences = configuredFunctionOccurrences(
      representativeConfig.recordtype['legacy-action-fixture'].hooks
    );
    const databaseOccurrences = representativeDatabase.recordTypes.flatMap(recordType =>
      configuredFunctionOccurrences(recordType.hooks)
    );
    for (const occurrence of [...configuredOccurrences, ...databaseOccurrences]) {
      expect(mappingExpressions.has(occurrence.expression), occurrence.path).to.equal(true);
    }

    const negative = loadNegativeFixture();
    const unknownDefinition = negative.recordTypes[0].hooks.onCreate?.pre?.[0];
    expect(unknownDefinition?.function).to.equal(negative.expectedMigrationFailure.expression);
    expect(negative.expectedMigrationFailure.path).to.equal('recordTypes[0].hooks.onCreate.pre[0].function');
    expect(mappingExpressions.has(negative.expectedMigrationFailure.expression)).to.equal(false);
  });

  it('rejects omissions at compact artifact boundaries', function () {
    expect(() =>
      parseRepresentativeConfiguration(
        omitJsonPath(structuredClone(representativeConfig) as unknown as JsonValue, [
          'recordtype',
          'legacy-action-fixture',
          'packageType',
        ])
      )
    ).to.throw();
    expect(() =>
      parseRepresentativeDatabase(
        omitJsonPath(structuredClone(representativeDatabase) as unknown as JsonValue, ['recordTypes', 0, 'branding'])
      )
    ).to.throw();
    expect(() =>
      parseLegacyActionInventory(
        omitJsonPath(structuredClone(inventory), ['actions', 0, 'occurrences', 0, 'sourceOptions'])
      )
    ).to.throw();
    expect(() =>
      parseLegacyActionMappings(omitJsonPath(structuredClone(mappings), ['mappings', 0, 'forceRunDisposition']))
    ).to.throw();
  });
});
