import type { FormComponentDefinitionFrame } from '@researchdatabox/sails-ng-common';

import type {
  ContractArrayNode,
  ContractCondition,
  ContractJsonPrimitive,
  ContractNode,
  ContractObjectNode,
  ContractScalarNode,
  RecordContractDiagnostic,
  RecordContractPointer,
} from './types';
import type {
  RecordContractComponentContribution,
  RecordContractComponentContributor,
  RecordContractContributorCompileContext,
  RecordContractContributorNullability,
} from './contributor-registry';
import { joinRecordContractPointer } from './json-pointer';

export type CoreRecordContractComponentClassification =
  'scalar' | 'object' | 'array' | 'specialized' | 'container' | 'non-persisting';

/** Closed inventory used by startup/CI coverage checks. */
export const CORE_RECORD_CONTRACT_COMPONENT_INVENTORY = {
  AccordionComponent: 'container',
  AccordionPanelComponent: 'container',
  CancelButtonComponent: 'non-persisting',
  CheckboxInputComponent: 'scalar',
  CheckboxTreeComponent: 'specialized',
  ContentComponent: 'non-persisting',
  DataLocationComponent: 'specialized',
  DateInputComponent: 'scalar',
  DeleteButtonComponent: 'non-persisting',
  DropdownInputComponent: 'scalar',
  FileUploadComponent: 'specialized',
  GroupComponent: 'object',
  IntegrationStatusComponent: 'non-persisting',
  MapComponent: 'specialized',
  PDFListComponent: 'specialized',
  PublishDataLocationRefreshComponent: 'non-persisting',
  PublishDataLocationSelectorComponent: 'specialized',
  QuestionTreeComponent: 'specialized',
  RadioInputComponent: 'scalar',
  RecordMetadataRetrieverComponent: 'non-persisting',
  RecordSelectorComponent: 'specialized',
  RelatedObjectDataComponent: 'non-persisting',
  RepeatableComponent: 'array',
  ReusableComponent: 'container',
  RichTextEditorComponent: 'scalar',
  SaveButtonComponent: 'non-persisting',
  SaveStatusComponent: 'non-persisting',
  SimpleInputComponent: 'scalar',
  SuggestedValidationSummaryComponent: 'non-persisting',
  TabComponent: 'container',
  TabContentComponent: 'container',
  TabNavButtonComponent: 'non-persisting',
  TextAreaComponent: 'scalar',
  TypeaheadInputComponent: 'specialized',
  ValidationSummaryComponent: 'non-persisting',
  WorkspaceSelectorComponent: 'non-persisting',
} as const satisfies Readonly<Record<string, CoreRecordContractComponentClassification>>;

export type CoreRecordContractComponentType = keyof typeof CORE_RECORD_CONTRACT_COMPONENT_INVENTORY;

type UnknownRecord = Readonly<Record<string, unknown>>;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

function componentConfig(component: Readonly<FormComponentDefinitionFrame>): UnknownRecord {
  return asRecord(component.component.config);
}

function modelConfig(component: Readonly<FormComponentDefinitionFrame>): UnknownRecord {
  return asRecord(component.model?.config);
}

function childComponents(value: unknown): readonly FormComponentDefinitionFrame[] {
  return Array.isArray(value) ? (value as FormComponentDefinitionFrame[]) : [];
}

function nullableFromDefault(component: Readonly<FormComponentDefinitionFrame>): boolean {
  return modelConfig(component).defaultValue === null;
}

function scalar(
  scalarType: ContractScalarNode['scalarType'],
  nullable: boolean,
  values?: readonly ContractJsonPrimitive[]
): ContractScalarNode {
  const enumValues = values?.filter(
    (value): value is string | number | boolean =>
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  );
  return {
    kind: 'scalar',
    scalarType,
    nullable,
    ...(enumValues && enumValues.length > 0 ? { enum: [...new Set(enumValues)].sort(compareScalar) } : {}),
  };
}

function compareScalar(left: string | number | boolean, right: string | number | boolean): number {
  return `${typeof left}:${String(left)}`.localeCompare(`${typeof right}:${String(right)}`);
}

function object(
  properties: Readonly<Record<string, ContractNode>>,
  context: RecordContractContributorCompileContext,
  nullable = false
): ContractObjectNode {
  return {
    kind: 'object',
    nullable,
    properties,
    unknownProperties: context.publicContext.unknownProperties,
  };
}

function array(items: ContractNode, nullable = false): ContractArrayNode {
  return { kind: 'array', nullable, items };
}

function permissiveDiagnostic(
  context: RecordContractContributorCompileContext,
  componentType: string
): RecordContractDiagnostic {
  return {
    code: 'record-contract.core-permissive-shape',
    severity: 'warning',
    message: 'This registered core component has a bounded permissive region pending a more precise shape audit.',
    pointer: context.pointer,
    componentType,
  };
}

function componentContributor(
  componentType: CoreRecordContractComponentType,
  nullability: RecordContractContributorNullability,
  compile: RecordContractComponentContributor['compile']
): RecordContractComponentContributor {
  return {
    kind: 'component',
    key: `core.${componentType
      .replace(/Component$/, '')
      .replaceAll(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase()}`,
    version: '1',
    componentType,
    ownedPointers: [''],
    nullability,
    compile,
  };
}

function nonPersisting(
  componentType: CoreRecordContractComponentType,
  children?: (component: Readonly<FormComponentDefinitionFrame>) => readonly FormComponentDefinitionFrame[]
): RecordContractComponentContributor {
  return componentContributor(componentType, 'non-null', context => ({
    kind: 'non-persisting',
    ...(children ? { children: children(context.component) } : {}),
  }));
}

function fixedOptions(config: UnknownRecord, property = 'options'): readonly ContractJsonPrimitive[] | undefined {
  const options = config[property];
  if (!Array.isArray(options)) {
    return undefined;
  }
  const values = options
    .map(option => asRecord(option).value)
    .filter(
      (value): value is ContractJsonPrimitive =>
        value === null || ['string', 'number', 'boolean'].includes(typeof value)
    );
  return values.length === options.length ? values : undefined;
}

function validators(component: Readonly<FormComponentDefinitionFrame>): readonly UnknownRecord[] {
  const configured = modelConfig(component).validators;
  return Array.isArray(configured) ? configured.map(asRecord) : [];
}

function simpleInputContribution(
  context: RecordContractContributorCompileContext
): RecordContractComponentContribution {
  const type = componentConfig(context.component).type;
  const integer = validators(context.component).some(validator => validator.class === 'integer');
  return {
    kind: 'node',
    node: scalar(
      type === 'number' ? (integer ? 'integer' : 'number') : 'string',
      nullableFromDefault(context.component)
    ),
  };
}

function choiceContribution(
  context: RecordContractContributorCompileContext,
  nullable: boolean
): RecordContractComponentContribution {
  const config = componentConfig(context.component);
  const values = fixedOptions(config);
  const defaultValue = modelConfig(context.component).defaultValue;
  if (Array.isArray(defaultValue)) {
    return { kind: 'node', node: array(scalar('string', false, values), nullable) };
  }
  return { kind: 'node', node: scalar('string', nullable, values) };
}

function checkboxContribution(context: RecordContractContributorCompileContext): RecordContractComponentContribution {
  const config = componentConfig(context.component);
  if (config.booleanMode === true) {
    return { kind: 'node', node: scalar('boolean', nullableFromDefault(context.component)) };
  }
  const values = fixedOptions(config);
  if (config.multipleValues === false) {
    return { kind: 'node', node: scalar('string', true, values) };
  }
  return { kind: 'node', node: array(scalar('string', false, values), true) };
}

function genericArrayContribution(
  componentType: CoreRecordContractComponentType
): RecordContractComponentContributor['compile'] {
  return context => ({
    kind: 'node',
    node: array({ kind: 'any', nullable: true }, nullableFromDefault(context.component)),
    diagnostics: [permissiveDiagnostic(context, componentType)],
  });
}

function attachmentArrayContribution(
  context: RecordContractContributorCompileContext
): RecordContractComponentContribution {
  const attachment = object(
    {
      type: scalar('string', false, ['attachment']),
      attachmentId: scalar('string', true),
      location: scalar('string', false),
      uploadUrl: scalar('string', false),
      fileId: scalar('string', false),
      name: scalar('string', false),
      mimeType: scalar('string', true),
      notes: scalar('string', true),
      size: scalar('number', true),
      pending: scalar('boolean', true),
    },
    context
  );
  return { kind: 'node', node: array(attachment, nullableFromDefault(context.component)) };
}

function mapContribution(context: RecordContractContributorCompileContext): RecordContractComponentContribution {
  return {
    kind: 'node',
    node: object(
      {
        type: scalar('string', false, ['FeatureCollection']),
        features: array({ kind: 'any', nullable: false }),
      },
      context,
      nullableFromDefault(context.component)
    ),
    diagnostics: [permissiveDiagnostic(context, 'MapComponent')],
  };
}

function recordSelectorContribution(
  context: RecordContractContributorCompileContext
): RecordContractComponentContribution {
  return {
    kind: 'node',
    node: object({ oid: scalar('string', false), title: scalar('string', true) }, context, true),
  };
}

function typeaheadContribution(context: RecordContractContributorCompileContext): RecordContractComponentContribution {
  const config = componentConfig(context.component);
  if (config.valueMode !== 'optionObject') {
    const values = config.sourceType === 'static' ? fixedOptions(config, 'staticOptions') : undefined;
    return { kind: 'node', node: scalar('string', true, values) };
  }
  const configuredFields = asRecord(config.optionObjectFields);
  const names = Object.keys(configuredFields).sort();
  const properties = Object.fromEntries(
    (names.length > 0 ? names : ['label', 'sourceType', 'value']).map(name => [name, scalar('string', true)])
  );
  return { kind: 'node', node: object(properties, context, true) };
}

function questionCondition(rule: UnknownRecord, base: RecordContractPointer): ContractCondition | undefined {
  const operation = rule.op;
  if (operation === 'true') {
    return undefined;
  }
  if ((operation === 'in' || operation === 'notin') && typeof rule.q === 'string' && Array.isArray(rule.a)) {
    const values = rule.a.filter(
      (value): value is ContractJsonPrimitive =>
        value === null || ['string', 'number', 'boolean'].includes(typeof value)
    );
    const condition: ContractCondition = {
      kind: 'in',
      pointer: joinRecordContractPointer(base, rule.q),
      values,
    };
    return operation === 'notin' ? { kind: 'not', condition } : condition;
  }
  if ((operation === 'and' || operation === 'or') && Array.isArray(rule.args)) {
    const conditions = rule.args.map(asRecord).map(item => questionCondition(item, base));
    if (conditions.some(item => item === undefined)) {
      return undefined;
    }
    return {
      kind: operation === 'and' ? 'all' : 'any',
      conditions: conditions.filter((item): item is ContractCondition => item !== undefined),
    };
  }
  return undefined;
}

async function questionTreeContribution(
  context: RecordContractContributorCompileContext
): Promise<RecordContractComponentContribution> {
  const config = componentConfig(context.component);
  const questions = Array.isArray(config.questions) ? config.questions.map(asRecord) : [];
  const diagnostics: RecordContractDiagnostic[] = [];
  const properties: Record<string, ContractNode> = {};
  for (const question of questions) {
    if (typeof question.id !== 'string' || question.id === '') {
      continue;
    }
    const answerValues = Array.isArray(question.answers)
      ? question.answers
          .map(asRecord)
          .map(answer => answer.value)
          .filter(
            (value): value is ContractJsonPrimitive =>
              value === null || ['string', 'number', 'boolean'].includes(typeof value)
          )
      : undefined;
    const answerNode = array(scalar('string', false, answerValues), false);
    const rule = asRecord(question.rules);
    const condition = questionCondition(rule, context.pointer);
    if (rule.op === 'true' || condition) {
      properties[question.id] = condition
        ? { kind: 'conditional', nullable: false, condition, thenNode: answerNode }
        : answerNode;
    } else {
      properties[question.id] = { kind: 'any', nullable: true, reason: 'unrepresentable-condition' };
      diagnostics.push({
        code: 'record-contract.unrepresentable-condition',
        severity: 'warning',
        message: 'A question-tree condition could not be represented safely and remains permissive.',
        pointer: joinRecordContractPointer(context.pointer, question.id),
        componentType: 'QuestionTreeComponent',
      });
    }
  }
  properties['questiontree-outcome-info'] = { kind: 'any', nullable: true };

  const configuredChildren = childComponents(config.componentDefinitions);
  if (configuredChildren.length > 0) {
    const childNode = await context.compileChildren(configuredChildren, context.pointer);
    Object.assign(properties, childNode.properties);
    diagnostics.push({
      code: 'record-contract.unrepresentable-condition',
      severity: 'warning',
      message: 'Question-tree child fields are retained, but their runtime branch expression is annotation-only.',
      pointer: context.pointer,
      componentType: 'QuestionTreeComponent',
    });
  }

  return {
    kind: 'node',
    node: object(properties, context, nullableFromDefault(context.component)),
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
  };
}

export function createCoreRecordContractContributors(): readonly RecordContractComponentContributor[] {
  return [
    nonPersisting('AccordionComponent', component => childComponents(componentConfig(component).panels)),
    nonPersisting('AccordionPanelComponent', component =>
      childComponents(componentConfig(component).componentDefinitions)
    ),
    nonPersisting('CancelButtonComponent'),
    componentContributor('CheckboxInputComponent', 'configuration', checkboxContribution),
    componentContributor(
      'CheckboxTreeComponent',
      'legacy-permissive',
      genericArrayContribution('CheckboxTreeComponent')
    ),
    nonPersisting('ContentComponent'),
    componentContributor(
      'DataLocationComponent',
      'legacy-permissive',
      genericArrayContribution('DataLocationComponent')
    ),
    componentContributor('DateInputComponent', 'nullable', () => ({ kind: 'node', node: scalar('string', true) })),
    nonPersisting('DeleteButtonComponent'),
    componentContributor('DropdownInputComponent', 'nullable', context => choiceContribution(context, true)),
    componentContributor('FileUploadComponent', 'configuration', attachmentArrayContribution),
    componentContributor('GroupComponent', 'configuration', async context => ({
      kind: 'node',
      node: {
        ...(await context.compileChildren(
          childComponents(componentConfig(context.component).componentDefinitions),
          context.pointer
        )),
        nullable: nullableFromDefault(context.component),
      },
    })),
    nonPersisting('IntegrationStatusComponent'),
    componentContributor('MapComponent', 'configuration', mapContribution),
    componentContributor('PDFListComponent', 'legacy-permissive', genericArrayContribution('PDFListComponent')),
    nonPersisting('PublishDataLocationRefreshComponent'),
    componentContributor(
      'PublishDataLocationSelectorComponent',
      'legacy-permissive',
      genericArrayContribution('PublishDataLocationSelectorComponent')
    ),
    componentContributor('QuestionTreeComponent', 'configuration', questionTreeContribution),
    componentContributor('RadioInputComponent', 'nullable', context => choiceContribution(context, true)),
    nonPersisting('RecordMetadataRetrieverComponent'),
    componentContributor('RecordSelectorComponent', 'nullable', recordSelectorContribution),
    nonPersisting('RelatedObjectDataComponent'),
    componentContributor('RepeatableComponent', 'configuration', async context => {
      const template = componentConfig(context.component).elementTemplate;
      if (template === null || typeof template !== 'object' || Array.isArray(template)) {
        return {
          kind: 'node',
          node: array(
            { kind: 'any', nullable: true, reason: 'unsupported-component' },
            nullableFromDefault(context.component)
          ),
          diagnostics: [permissiveDiagnostic(context, 'RepeatableComponent')],
        };
      }
      const element = template as FormComponentDefinitionFrame;
      const wrapper = await context.compileChildren([element], context.pointer);
      const item =
        Object.keys(wrapper.properties).length === 1 && element.name
          ? (wrapper.properties[element.name] ?? wrapper)
          : wrapper;
      return { kind: 'node', node: array(item, nullableFromDefault(context.component)) };
    }),
    nonPersisting('ReusableComponent'),
    componentContributor('RichTextEditorComponent', 'configuration', context => ({
      kind: 'node',
      node: scalar('string', nullableFromDefault(context.component)),
    })),
    nonPersisting('SaveButtonComponent'),
    nonPersisting('SaveStatusComponent'),
    componentContributor('SimpleInputComponent', 'configuration', simpleInputContribution),
    nonPersisting('SuggestedValidationSummaryComponent'),
    nonPersisting('TabComponent', component => childComponents(componentConfig(component).tabs)),
    nonPersisting('TabContentComponent', component => childComponents(componentConfig(component).componentDefinitions)),
    nonPersisting('TabNavButtonComponent'),
    componentContributor('TextAreaComponent', 'configuration', context => ({
      kind: 'node',
      node: scalar('string', nullableFromDefault(context.component)),
    })),
    componentContributor('TypeaheadInputComponent', 'nullable', typeaheadContribution),
    nonPersisting('ValidationSummaryComponent'),
    nonPersisting('WorkspaceSelectorComponent'),
  ].sort((left, right) => left.componentType.localeCompare(right.componentType));
}
