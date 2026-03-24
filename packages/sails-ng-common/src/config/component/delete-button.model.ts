import { FieldComponentConfig, FieldComponentDefinition } from '../field-component.model';
import { AvailableFieldLayoutDefinitionOutlines } from '../dictionary.outline';
import { FormComponentDefinition } from '../form-component.model';
import { FormConfigVisitorOutline } from '../visitor/base.outline';
import { FieldComponentConfigKind, FieldComponentDefinitionKind, FormComponentDefinitionKind } from '../shared.outline';
import {
  DeleteButtonComponentName,
  DeleteButtonFieldComponentConfigOutline,
  DeleteButtonFieldComponentDefinitionOutline,
  DeleteButtonFormComponentDefinitionOutline,
} from './delete-button.outline';

export class DeleteButtonFieldComponentConfig extends FieldComponentConfig implements DeleteButtonFieldComponentConfigOutline {
  buttonCssClasses?: string;
  closeOnDelete?: boolean;
  redirectLocation?: string;
  redirectDelaySeconds?: number;
  confirmationMessage?: string;
  confirmationTitle?: string;
  cancelButtonMessage?: string;
  confirmButtonMessage?: string;
}

export class DeleteButtonFieldComponentDefinition
  extends FieldComponentDefinition
  implements DeleteButtonFieldComponentDefinitionOutline
{
  class = DeleteButtonComponentName;
  config?: DeleteButtonFieldComponentConfigOutline;

  accept(visitor: FormConfigVisitorOutline): void {
    visitor.visitDeleteButtonFieldComponentDefinition(this);
  }
}

export class DeleteButtonFormComponentDefinition
  extends FormComponentDefinition
  implements DeleteButtonFormComponentDefinitionOutline
{
  component!: DeleteButtonFieldComponentDefinitionOutline;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionOutlines;

  accept(visitor: FormConfigVisitorOutline): void {
    visitor.visitDeleteButtonFormComponentDefinition(this);
  }
}

export const DeleteButtonMap = [
  { kind: FieldComponentConfigKind, def: DeleteButtonFieldComponentConfig },
  { kind: FieldComponentDefinitionKind, def: DeleteButtonFieldComponentDefinition, class: DeleteButtonComponentName },
  { kind: FormComponentDefinitionKind, def: DeleteButtonFormComponentDefinition, class: DeleteButtonComponentName },
];

export const DeleteButtonDefaults = {
  [FormComponentDefinitionKind]: {
    [DeleteButtonComponentName]: {
      [FieldComponentDefinitionKind]: DeleteButtonComponentName,
    },
  },
};
