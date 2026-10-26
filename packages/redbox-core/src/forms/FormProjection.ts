import _ from 'lodash';
import {
  guessType,
  diffRecordValues,
  arrayStartsWithArray,
  type ILogger,
  type FormConfigFrame,
  type FormModesConfig,
  type ReusableFormDefinitions,
  type RecordValuePath,
  type RecordValueChange,
} from '@researchdatabox/sails-ng-common';
import { ConstructFormConfigVisitor } from '../visitor/construct.visitor';
import { DataValueFormConfigVisitor } from '../visitor/data-value.visitor';
import { JsonTypeDefSchemaFormConfigVisitor } from '../visitor/json-type-def.visitor';
type BasicRedboxRecord = {
  redboxOid: string;
  metadata: Record<string, unknown>;
  metaMetadata?: Record<string, unknown>;
} & Record<string, unknown>;
type FormRecordConsistencyChangePath = RecordValuePath;
type FormRecordConsistencyChange = RecordValueChange;
const isPermittedChangesSchemaObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requirePermittedChangesSchemaObject = (value: unknown): Record<string, unknown> => {
  if (!isPermittedChangesSchemaObject(value)) {
    throw new Error(`Invalid permittedChanges object, schema definitions must be objects: ${JSON.stringify(value)}`);
  }
  return value;
};

export class FormProjection {
  public constructor(private readonly logger: ILogger) {}
  public async mergeRecordClientFormConfig(
    original: BasicRedboxRecord,
    changed: BasicRedboxRecord,
    clientFormConfig: FormConfigFrame,
    formMode: FormModesConfig,
    reusableFormDefs?: ReusableFormDefinitions
  ): Promise<BasicRedboxRecord> {
    const schemaFormConfig = this.stripModelValuesFromFormConfig(clientFormConfig);
    const permittedChanges = await this.buildSchemaForFormConfig(schemaFormConfig, formMode, reusableFormDefs);
    const originalMetadata = original?.metadata ?? {};
    const changedMetadata = changed?.metadata ?? {};
    const changes = this.compareRecords(original, changed);
    return {
      ...original,
      redboxOid: original?.redboxOid ?? '',
      metadata: this.mergeRecordMetadataPermitted(originalMetadata, changedMetadata, permittedChanges, changes),
    };
  }
  public async projectMetadataClientFormConfig(
    metadata: Record<string, unknown>,
    clientFormConfig: FormConfigFrame,
    formMode: FormModesConfig,
    reusableFormDefs?: ReusableFormDefinitions
  ): Promise<Record<string, unknown>> {
    const projected = await this.mergeRecordClientFormConfig(
      {
        redboxOid: '',
        metadata: {},
      },
      {
        redboxOid: '',
        metadata,
      },
      clientFormConfig,
      formMode,
      reusableFormDefs
    );
    return projected.metadata;
  }
  public mergeRecordMetadataPermitted(
    original: object,
    changed: object,
    permittedChanges: Record<string, unknown> | unknown,
    changes: FormRecordConsistencyChange[],
    currentPath?: FormRecordConsistencyChangePath
  ): Record<string, unknown> {
    // ensure there is a current path
    currentPath = currentPath ?? [];

    // filter the changes to only those relevant to the current path
    const relevantChanges = changes?.filter(i => {
      return !currentPath || arrayStartsWithArray(currentPath, i?.path);
    });

    // check all keys in either the original or changes objects
    const { keys: originalKeys } = this.toKeysEntries(original);
    const { keys: changedKeys } = this.toKeysEntries(changed);
    const allKeys = new Set<string | number>(originalKeys);
    changedKeys.forEach(i => allKeys.add(i));

    // permittedChanged is in JSON Type Def format
    // permitted changes is always for an object (i.e. has property 'properties')
    const originalRecord = original as Record<string | number, unknown>;
    const changedRecord = changed as Record<string | number, unknown>;
    const permittedChangesObj = permittedChanges as Record<string | number, unknown>;
    if (permittedChangesObj?.type === 'object') {
      return changedRecord;
    }
    // if (!('properties' in permittedChangesObj)) {
    //     throw new Error(`Permitted changes must have an object, a 'properties' property, at the top level ${JSON.stringify(permittedChanges)}`)
    // }
    const permittedChangesProps = (
      'properties' in permittedChangesObj || 'optionalProperties' in permittedChangesObj
        ? {
            ...((permittedChangesObj['properties'] ?? {}) as Record<string | number, unknown>),
            ...((permittedChangesObj['optionalProperties'] ?? {}) as Record<string | number, unknown>),
          }
        : permittedChangesObj
    ) as Record<string | number, unknown>;

    // create a new record instance
    const result: Record<string | number, unknown> = {
      // for debugging:
      // _meta: {keys:Array.from(allKeys),currentPath:currentPath},
    };

    // for each key, evaluate the value
    for (const key of allKeys) {
      // pre-calculate aspects of the original item
      const isKeyInOriginal = key in originalRecord;
      const originalValue = isKeyInOriginal ? originalRecord[key] : undefined;

      // pre-calculate aspects of the changed item
      const isKeyInChanged = key in changedRecord;
      const changedValue = isKeyInChanged ? changedRecord[key] : undefined;
      const changedValueType = guessType(changedValue);

      // pre-calculate aspects of the permitted changes
      const isKeyInPermittedChange = key in permittedChangesProps;
      const permittedChangesValue = permittedChangesProps?.[key];
      const permittedChangesValueObj = isKeyInPermittedChange
        ? requirePermittedChangesSchemaObject(permittedChangesValue)
        : undefined;
      const isPermittedChangeObject =
        isKeyInPermittedChange &&
        !!permittedChangesValueObj &&
        ('properties' in permittedChangesValueObj || 'optionalProperties' in permittedChangesValueObj);
      const isPermittedChangeArray =
        isKeyInPermittedChange && !!permittedChangesValueObj && 'elements' in permittedChangesValueObj;
      const isPermittedChangeType =
        isKeyInPermittedChange && !!permittedChangesValueObj && 'type' in permittedChangesValueObj;
      const isPermittedChangeEmpty =
        isKeyInPermittedChange && !!permittedChangesValueObj && Object.keys(permittedChangesValueObj).length === 0;
      const originalValueForMerge = isKeyInOriginal
        ? originalValue
        : isPermittedChangeArray
          ? []
          : isPermittedChangeObject
            ? {}
            : undefined;
      const originalValueForMergeType = guessType(originalValueForMerge);

      // ensure the permitted changes item is valid
      const isPermittedChangeMatches = {
        isPermittedChangeObject: isPermittedChangeObject,
        isPermittedChangeArray: isPermittedChangeArray,
        isPermittedChangeType: isPermittedChangeType,
        isPermittedChangeEmpty: isPermittedChangeEmpty,
      };
      if (
        isKeyInPermittedChange &&
        Object.values(isPermittedChangeMatches).filter((i: boolean) => i === true).length !== 1
      ) {
        throw new Error(
          `Invalid permittedChanges object, all definitions must have a property that is one of 'properties', 'elements', 'type', (none): ${JSON.stringify(isPermittedChangeMatches)} - ${JSON.stringify(permittedChangesValue)}`
        );
      }

      // evaluate the combinations of original and changed values
      if (
        isPermittedChangeArray &&
        isKeyInChanged &&
        originalValueForMergeType === 'array' &&
        changedValueType === 'array'
      ) {
        // The change is permitted and an array, original and changed have the key and both are arrays.
        // For an array, the merge logic is to replace the original array with the changed array.
        // The whole array is replaced because there is no current way to distinguish what from the original should be kept.
        // TODO: Consider how to replace each element in the array instead of the whole array.
        //       Replacing the whole array prevents use of constraints in components in the array elements.
        const newPermittedChanges = requirePermittedChangesSchemaObject(permittedChangesValueObj?.['elements']);
        result[key] = (changedValue as unknown[]).map((changedElement: unknown, index: number) => {
          if (newPermittedChanges.type === 'object' || Object.keys(newPermittedChanges).length === 0) {
            return changedElement;
          }
          // Evaluate the element in the array.
          const guessedType = guessType(changedElement);
          if (guessedType === 'object') {
            // For an object, evaluate it as a component value.
            // NOTE: The 'original' element does not include elementTemplate default values,
            //       because that default is for new entries, not existing entries.
            const originalElement = {};
            const newPath = [...currentPath, key, index];
            const keyChanges = relevantChanges?.filter(i => arrayStartsWithArray(newPath, i?.path));
            this.logger.verbose(`mergeRecordMetadataPermitted - array`, {
              originalElement: originalElement,
              changedElement: changedElement,
              newPermittedChanges: newPermittedChanges,
              keyChanges: keyChanges,
              newPath: newPath,
            });
            return this.mergeRecordMetadataPermitted(
              originalElement,
              changedElement as object,
              newPermittedChanges,
              keyChanges,
              newPath as FormRecordConsistencyChangePath
            );
          } else {
            // For anything that's not an object, there's nothing else to do, return it.
            return changedElement;
          }
        });
      } else if (
        isPermittedChangeObject &&
        isKeyInChanged &&
        originalValueForMergeType === 'object' &&
        changedValueType === 'object'
      ) {
        // The change is permitted and an object, original and changed have the key and both are objects.
        // Evaluate the properties of the object.
        const newPermittedChanges = permittedChangesValue as Record<string, unknown>;
        const newPath = [...currentPath, key];
        const keyChanges = relevantChanges?.filter(i => arrayStartsWithArray(newPath, i?.path));
        result[key] = this.mergeRecordMetadataPermitted(
          originalValueForMerge as object,
          changedValue as object,
          newPermittedChanges,
          keyChanges,
          newPath as FormRecordConsistencyChangePath
        );
      } else if (isKeyInPermittedChange && isKeyInChanged) {
        // The change is permitted and the key is in the changed.
        // Replace the original value with the changed value.
        result[key] = changedValue;
      } else if (isKeyInOriginal && originalValue !== undefined) {
        // The key is in the original, so keep the key & value.
        // Keep the original value.
        result[key] = originalValue;
      }
    }

    /*
            this.logger.verbose(`mergeRecordPermitted currentPath ${currentPath}: ${JSON.stringify({
                original: original,
                changed: changed,
                permittedChanges: permittedChanges,
                changes: changes,
                result: result,
            })}`);
             */

    return result;
  }
  public async buildDataModelDefaultForFormConfig(
    item: FormConfigFrame,
    formMode: FormModesConfig,
    reusableFormDefs?: ReusableFormDefinitions
  ): Promise<Record<string, unknown>> {
    const constructor = new ConstructFormConfigVisitor(this.logger);
    const constructed = await constructor.start({ data: item, formMode, reusableFormDefs });

    const visitor = new DataValueFormConfigVisitor(this.logger);
    return await visitor.start({ form: constructed });
  }
  public async buildSchemaForFormConfig(
    item: FormConfigFrame,
    formMode: FormModesConfig,
    reusableFormDefs?: ReusableFormDefinitions
  ): Promise<Record<string, unknown>> {
    const constructor = new ConstructFormConfigVisitor(this.logger);
    const constructed = await constructor.start({ data: item, formMode, reusableFormDefs });

    const visitor = new JsonTypeDefSchemaFormConfigVisitor(this.logger);
    return await visitor.start({ form: constructed });
  }
  public compareRecords(
    original: unknown,
    changed: unknown,
    path?: FormRecordConsistencyChangePath
  ): FormRecordConsistencyChange[] {
    return diffRecordValues(original, changed, path);
  }
  public stripModelValuesFromFormConfig(item: FormConfigFrame): FormConfigFrame {
    const result = _.cloneDeep(item) as unknown as Record<string, unknown>;

    const stripComponent = (component: Record<string, unknown>) => {
      const model = component?.model as Record<string, unknown> | undefined;
      const modelConfig = model?.config as Record<string, unknown> | undefined;
      if (modelConfig && Object.prototype.hasOwnProperty.call(modelConfig, 'value')) {
        delete modelConfig.value;
      }

      const componentConfig = (component?.component as Record<string, unknown> | undefined)?.config as
        Record<string, unknown> | undefined;
      if (!componentConfig) {
        return;
      }

      const nestedArrays = ['componentDefinitions', 'tabs', 'panels'];
      nestedArrays.forEach(key => {
        const nested = componentConfig[key];
        if (Array.isArray(nested)) {
          nested.forEach(item => stripComponent(item as Record<string, unknown>));
        }
      });

      const elementTemplate = componentConfig.elementTemplate;
      if (_.isPlainObject(elementTemplate)) {
        stripComponent(elementTemplate as Record<string, unknown>);
      }
    };

    const componentDefinitions = result.componentDefinitions;
    if (Array.isArray(componentDefinitions)) {
      componentDefinitions.forEach(item => stripComponent(item as Record<string, unknown>));
    }

    return result as unknown as FormConfigFrame;
  }
  public toKeysEntries(item: unknown): {
    entries: [string | number, unknown][];
    keys: (string | number)[];
  } {
    const guessedType = guessType(item);
    if (guessedType === 'object') {
      const entries = Object.entries(item as Record<string, unknown>);
      return { entries: entries, keys: entries.map(i => i[0]) };
    } else if (guessedType === 'array') {
      const entries: [string | number, unknown][] = (item as Array<unknown>).map((value, index) => [index, value]);
      return { entries: entries, keys: entries.map(i => i[0]) };
    } else {
      return { entries: [], keys: [] };
    }
  }
}
