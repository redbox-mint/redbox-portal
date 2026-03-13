import { AvailableFieldLayoutDefinitionOutlines } from '../dictionary.outline';
import { FieldComponentConfig, FieldComponentDefinition } from '../field-component.model';
import { FormComponentDefinition } from '../form-component.model';
import {
  FieldComponentConfigKind,
  FieldComponentDefinitionKind,
  FormComponentDefinitionKind,
} from '../shared.outline';
import { FormConfigVisitorOutline } from '../visitor/base.outline';
import {
  RecordMetadataRetrieverComponentName,
  RecordMetadataRetrieverFieldComponentConfigOutline,
  RecordMetadataRetrieverFieldComponentDefinitionOutline,
  RecordMetadataRetrieverFormComponentDefinitionOutline,
} from './record-metadata-retriever.outline';

export class RecordMetadataRetrieverFieldComponentConfig
  extends FieldComponentConfig
  implements RecordMetadataRetrieverFieldComponentConfigOutline
{
  constructor() {
    super();
  }
}

export class RecordMetadataRetrieverFieldComponentDefinition
  extends FieldComponentDefinition
  implements RecordMetadataRetrieverFieldComponentDefinitionOutline
{
  class = RecordMetadataRetrieverComponentName;
  config?: RecordMetadataRetrieverFieldComponentConfigOutline;

  constructor() {
    super();
  }

  accept(visitor: FormConfigVisitorOutline): void {
    visitor.visitRecordMetadataRetrieverFieldComponentDefinition(this);
  }
}

export class RecordMetadataRetrieverFormComponentDefinition
  extends FormComponentDefinition
  implements RecordMetadataRetrieverFormComponentDefinitionOutline
{
  component!: RecordMetadataRetrieverFieldComponentDefinitionOutline;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionOutlines;

  constructor() {
    super();
  }

  accept(visitor: FormConfigVisitorOutline): void {
    visitor.visitRecordMetadataRetrieverFormComponentDefinition(this);
  }
}

export const RecordMetadataRetrieverMap = [
  { kind: FieldComponentConfigKind, def: RecordMetadataRetrieverFieldComponentConfig },
  {
    kind: FieldComponentDefinitionKind,
    def: RecordMetadataRetrieverFieldComponentDefinition,
    class: RecordMetadataRetrieverComponentName,
  },
  {
    kind: FormComponentDefinitionKind,
    def: RecordMetadataRetrieverFormComponentDefinition,
    class: RecordMetadataRetrieverComponentName,
  },
];

export const RecordMetadataRetrieverDefaults = {
  [FormComponentDefinitionKind]: {
    [RecordMetadataRetrieverComponentName]: {
      [FieldComponentDefinitionKind]: RecordMetadataRetrieverComponentName,
    },
  },
};
