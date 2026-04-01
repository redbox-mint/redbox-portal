import { FieldModelConfig, FieldModelDefinition } from '../field-model.model';
import { FormComponentDefinition } from '../form-component.model';
import { FormConfigVisitorOutline } from '../visitor/base.outline';
import {
  FieldComponentConfigKind,
  FieldComponentDefinitionKind,
  FieldModelConfigKind,
  FieldModelDefinitionKind,
  FormComponentDefinitionKind,
} from '../shared.outline';
import { FieldComponentConfig, FieldComponentDefinition } from '../field-component.model';
import { AvailableFieldLayoutDefinitionOutlines } from '../dictionary.outline';
import {
  RecordSelectorComponentName,
  RecordSelectorFieldComponentConfigOutline,
  RecordSelectorFieldComponentDefinitionOutline,
  RecordSelectorFieldModelConfigOutline,
  RecordSelectorFieldModelDefinitionOutline,
  RecordSelectorFormComponentDefinitionOutline,
  RecordSelectorModelName,
  RecordSelectorModelValueType,
} from './record-selector.outline';

export class RecordSelectorFieldComponentConfig
  extends FieldComponentConfig
  implements RecordSelectorFieldComponentConfigOutline
{
  columnTitle = 'Record title';
  recordType?: string;
  workflowState = '';
  filterMode = 'default';
  filterFields: string[] = [];
}

export class RecordSelectorFieldComponentDefinition
  extends FieldComponentDefinition
  implements RecordSelectorFieldComponentDefinitionOutline
{
  class = RecordSelectorComponentName;
  config?: RecordSelectorFieldComponentConfigOutline;

  accept(visitor: FormConfigVisitorOutline): void {
    visitor.visitRecordSelectorFieldComponentDefinition(this);
  }
}

export class RecordSelectorFieldModelConfig
  extends FieldModelConfig<RecordSelectorModelValueType>
  implements RecordSelectorFieldModelConfigOutline {}

export class RecordSelectorFieldModelDefinition
  extends FieldModelDefinition<RecordSelectorModelValueType>
  implements RecordSelectorFieldModelDefinitionOutline
{
  class = RecordSelectorModelName;
  config?: RecordSelectorFieldModelConfigOutline;

  accept(visitor: FormConfigVisitorOutline): void {
    visitor.visitRecordSelectorFieldModelDefinition(this);
  }
}

export class RecordSelectorFormComponentDefinition
  extends FormComponentDefinition
  implements RecordSelectorFormComponentDefinitionOutline
{
  public component!: RecordSelectorFieldComponentDefinitionOutline;
  public model?: RecordSelectorFieldModelDefinitionOutline;
  public layout?: AvailableFieldLayoutDefinitionOutlines;

  accept(visitor: FormConfigVisitorOutline): void {
    visitor.visitRecordSelectorFormComponentDefinition(this);
  }
}

export const RecordSelectorMap = [
  { kind: FieldComponentConfigKind, def: RecordSelectorFieldComponentConfig },
  { kind: FieldComponentDefinitionKind, def: RecordSelectorFieldComponentDefinition, class: RecordSelectorComponentName },
  { kind: FieldModelConfigKind, def: RecordSelectorFieldModelConfig },
  { kind: FieldModelDefinitionKind, def: RecordSelectorFieldModelDefinition, class: RecordSelectorModelName },
  { kind: FormComponentDefinitionKind, def: RecordSelectorFormComponentDefinition, class: RecordSelectorComponentName },
];

export const RecordSelectorDefaults = {
  [FormComponentDefinitionKind]: {
    [RecordSelectorComponentName]: {
      [FieldComponentDefinitionKind]: RecordSelectorComponentName,
      [FieldModelDefinitionKind]: RecordSelectorModelName,
    },
  },
};
