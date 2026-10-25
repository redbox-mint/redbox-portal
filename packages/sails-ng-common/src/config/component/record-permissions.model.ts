import { FieldComponentConfig, FieldComponentDefinition } from '../field-component.model';
import { AvailableFieldLayoutDefinitionOutlines } from '../dictionary.outline';
import { FormComponentDefinition } from '../form-component.model';
import { FormConfigVisitorOutline } from '../visitor/base.outline';
import { FieldComponentConfigKind, FieldComponentDefinitionKind, FormComponentDefinitionKind } from '../shared.outline';
import {
  RecordPermissionsComponentName,
  RecordPermissionsFieldComponentConfigOutline,
  RecordPermissionsFieldComponentDefinitionOutline,
  RecordPermissionsFormComponentDefinitionOutline,
} from './record-permissions.outline';

/* Record Permissions Component */

export class RecordPermissionsFieldComponentConfig
  extends FieldComponentConfig
  implements RecordPermissionsFieldComponentConfigOutline
{
  constructor() {
    super();
  }
}

export class RecordPermissionsFieldComponentDefinition
  extends FieldComponentDefinition
  implements RecordPermissionsFieldComponentDefinitionOutline
{
  class = RecordPermissionsComponentName;
  config?: RecordPermissionsFieldComponentConfigOutline;

  constructor() {
    super();
  }

  async accept(visitor: FormConfigVisitorOutline) {
    await visitor.visitRecordPermissionsFieldComponentDefinition(this);
  }
}

/* Record Permissions Form Component */

export class RecordPermissionsFormComponentDefinition
  extends FormComponentDefinition
  implements RecordPermissionsFormComponentDefinitionOutline
{
  component!: RecordPermissionsFieldComponentDefinitionOutline;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionOutlines;

  constructor() {
    super();
  }

  async accept(visitor: FormConfigVisitorOutline) {
    await visitor.visitRecordPermissionsFormComponentDefinition(this);
  }
}

export const RecordPermissionsMap = [
  { kind: FieldComponentConfigKind, def: RecordPermissionsFieldComponentConfig },
  {
    kind: FieldComponentDefinitionKind,
    def: RecordPermissionsFieldComponentDefinition,
    class: RecordPermissionsComponentName,
  },
  {
    kind: FormComponentDefinitionKind,
    def: RecordPermissionsFormComponentDefinition,
    class: RecordPermissionsComponentName,
  },
];
export const RecordPermissionsDefaults = {
  [FormComponentDefinitionKind]: {
    [RecordPermissionsComponentName]: {
      [FieldComponentDefinitionKind]: RecordPermissionsComponentName,
    },
  },
};
