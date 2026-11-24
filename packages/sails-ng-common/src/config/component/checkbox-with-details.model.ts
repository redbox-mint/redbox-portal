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
import type { HistoricalVocabMode } from './dropdown-input.outline';
import {
  CheckboxWithDetailsComponentName,
  CheckboxWithDetailsFieldComponentConfigOutline,
  CheckboxWithDetailsFieldComponentDefinitionOutline,
  CheckboxWithDetailsFieldModelConfigOutline,
  CheckboxWithDetailsFieldModelDefinitionOutline,
  CheckboxWithDetailsFormComponentDefinitionOutline,
  CheckboxWithDetailsModelName,
  CheckboxWithDetailsModelValueType,
  CheckboxDetailFieldOutline,
  CheckboxWithDetailsOption,
} from './checkbox-with-details.outline';

/* Checkbox With Details Component */

export class CheckboxWithDetailsFieldComponentConfig
  extends FieldComponentConfig
  implements CheckboxWithDetailsFieldComponentConfigOutline
{
  options?: CheckboxWithDetailsOption[];
  detailFields?: CheckboxDetailFieldOutline[];
  detailFieldsByValue?: Record<string, CheckboxDetailFieldOutline[]>;
  /** Supplied by the server for option mappings backed by a stored record. */
  storedMappingValues?: readonly string[];
  vocabRef?: string;
  inlineVocab?: boolean;
  /** When set, options whose value is not listed are disabled. */
  enabledOptionValues?: string[] | null;
  historicalVocabMode?: HistoricalVocabMode;
}

export class CheckboxWithDetailsFieldComponentDefinition
  extends FieldComponentDefinition
  implements CheckboxWithDetailsFieldComponentDefinitionOutline
{
  class = CheckboxWithDetailsComponentName;
  config?: CheckboxWithDetailsFieldComponentConfigOutline;

  async accept(visitor: FormConfigVisitorOutline) {
    await visitor.visitCheckboxWithDetailsFieldComponentDefinition(this);
  }
}

/* Checkbox With Details Model */

export class CheckboxWithDetailsFieldModelConfig
  extends FieldModelConfig<CheckboxWithDetailsModelValueType>
  implements CheckboxWithDetailsFieldModelConfigOutline {}

export class CheckboxWithDetailsFieldModelDefinition
  extends FieldModelDefinition<CheckboxWithDetailsModelValueType>
  implements CheckboxWithDetailsFieldModelDefinitionOutline
{
  class = CheckboxWithDetailsModelName;
  config?: CheckboxWithDetailsFieldModelConfigOutline;

  async accept(visitor: FormConfigVisitorOutline) {
    await visitor.visitCheckboxWithDetailsFieldModelDefinition(this);
  }
}

/* Checkbox With Details Form Component */

export class CheckboxWithDetailsFormComponentDefinition
  extends FormComponentDefinition
  implements CheckboxWithDetailsFormComponentDefinitionOutline
{
  public component!: CheckboxWithDetailsFieldComponentDefinitionOutline;
  public model?: CheckboxWithDetailsFieldModelDefinitionOutline;
  public layout?: AvailableFieldLayoutDefinitionOutlines;

  async accept(visitor: FormConfigVisitorOutline) {
    await visitor.visitCheckboxWithDetailsFormComponentDefinition(this);
  }
}

export const CheckboxWithDetailsMap = [
  { kind: FieldComponentConfigKind, def: CheckboxWithDetailsFieldComponentConfig },
  {
    kind: FieldComponentDefinitionKind,
    def: CheckboxWithDetailsFieldComponentDefinition,
    class: CheckboxWithDetailsComponentName,
  },
  { kind: FieldModelConfigKind, def: CheckboxWithDetailsFieldModelConfig },
  { kind: FieldModelDefinitionKind, def: CheckboxWithDetailsFieldModelDefinition, class: CheckboxWithDetailsModelName },
  {
    kind: FormComponentDefinitionKind,
    def: CheckboxWithDetailsFormComponentDefinition,
    class: CheckboxWithDetailsComponentName,
  },
];
export const CheckboxWithDetailsDefaults = {
  [FormComponentDefinitionKind]: {
    [CheckboxWithDetailsComponentName]: {
      [FieldComponentDefinitionKind]: CheckboxWithDetailsComponentName,
      [FieldModelDefinitionKind]: CheckboxWithDetailsModelName,
    },
  },
};
