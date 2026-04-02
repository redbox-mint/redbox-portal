import { FieldComponentConfig, FieldComponentDefinition } from '../field-component.model';
import { AvailableFieldLayoutDefinitionOutlines } from '../dictionary.outline';
import { FormComponentDefinition } from '../form-component.model';
import { FormConfigVisitorOutline } from '../visitor/base.outline';
import { FieldComponentConfigKind, FieldComponentDefinitionKind, FormComponentDefinitionKind } from '../shared.outline';
import {
  CancelButtonComponentName,
  CancelButtonFieldComponentConfigOutline,
  CancelButtonFieldComponentDefinitionOutline,
  CancelButtonFormComponentDefinitionOutline,
} from './cancel-button.outline';

/* Cancel Button Component */

export class CancelButtonFieldComponentConfig
  extends FieldComponentConfig
  implements CancelButtonFieldComponentConfigOutline
{
  confirmationMessage?: string;
  confirmationTitle?: string;
  cancelButtonMessage?: string;
  confirmButtonMessage?: string;
  buttonCssClasses?: string;

  constructor() {
    super();
  }
}

export class CancelButtonFieldComponentDefinition
  extends FieldComponentDefinition
  implements CancelButtonFieldComponentDefinitionOutline
{
  class = CancelButtonComponentName;
  config?: CancelButtonFieldComponentConfigOutline;

  constructor() {
    super();
  }

  accept(visitor: FormConfigVisitorOutline): void {
    visitor.visitCancelButtonFieldComponentDefinition(this);
  }
}

/* Cancel Button Form Component */

export class CancelButtonFormComponentDefinition
  extends FormComponentDefinition
  implements CancelButtonFormComponentDefinitionOutline
{
  component!: CancelButtonFieldComponentDefinitionOutline;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionOutlines;

  constructor() {
    super();
  }

  accept(visitor: FormConfigVisitorOutline) {
    visitor.visitCancelButtonFormComponentDefinition(this);
  }
}

export const CancelButtonMap = [
  { kind: FieldComponentConfigKind, def: CancelButtonFieldComponentConfig },
  { kind: FieldComponentDefinitionKind, def: CancelButtonFieldComponentDefinition, class: CancelButtonComponentName },
  { kind: FormComponentDefinitionKind, def: CancelButtonFormComponentDefinition, class: CancelButtonComponentName },
];
export const CancelButtonDefaults = {
  [FormComponentDefinitionKind]: {
    [CancelButtonComponentName]: {
      [FieldComponentDefinitionKind]: CancelButtonComponentName,
    },
  },
};
