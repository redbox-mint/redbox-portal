import { FieldComponentConfig, FieldComponentDefinition } from '../field-component.model';
import { FormComponentDefinition } from '../form-component.model';
import { AvailableFieldLayoutDefinitionOutlines } from '../dictionary.outline';
import { FormConfigVisitorOutline } from '../visitor/base.outline';
import { FieldComponentConfigKind, FieldComponentDefinitionKind, FormComponentDefinitionKind } from '../shared.outline';
import {
  WorkspaceSelectorComponentName,
  WorkspaceDisplayType,
  WorkspaceFieldComponentConfigOutline,
  WorkspaceFieldComponentDefinitionOutline,
  WorkspaceFormComponentDefinitionOutline,
  WorkspaceTypeDefinition,
} from './workspace.outline';

export class WorkspaceFieldComponentConfig
  extends FieldComponentConfig
  implements WorkspaceFieldComponentConfigOutline
{
  open = 'Open';
  saveFirst = 'Please save this record first';
  displayType: WorkspaceDisplayType = 'dropdown';
  shouldSaveForm = true;
  allowAddTemplate?: string;
  defaultSelection: WorkspaceTypeDefinition[] = [];
}
export class WorkspaceFieldComponentDefinition
  extends FieldComponentDefinition
  implements WorkspaceFieldComponentDefinitionOutline
{
  class = WorkspaceSelectorComponentName;
  config?: WorkspaceFieldComponentConfigOutline;
  async accept(visitor: FormConfigVisitorOutline) {
    await visitor.visitWorkspaceFieldComponentDefinition(this);
  }
}
export class WorkspaceFormComponentDefinition
  extends FormComponentDefinition
  implements WorkspaceFormComponentDefinitionOutline
{
  component!: WorkspaceFieldComponentDefinitionOutline;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionOutlines;
  async accept(visitor: FormConfigVisitorOutline) {
    await visitor.visitWorkspaceFormComponentDefinition(this);
  }
}
export const WorkspaceMap = [
  { kind: FieldComponentConfigKind, def: WorkspaceFieldComponentConfig },
  { kind: FieldComponentDefinitionKind, def: WorkspaceFieldComponentDefinition, class: WorkspaceSelectorComponentName },
  { kind: FormComponentDefinitionKind, def: WorkspaceFormComponentDefinition, class: WorkspaceSelectorComponentName },
];
export const WorkspaceDefaults = {
  [FormComponentDefinitionKind]: {
    [WorkspaceSelectorComponentName]: { [FieldComponentDefinitionKind]: WorkspaceSelectorComponentName },
  },
};
