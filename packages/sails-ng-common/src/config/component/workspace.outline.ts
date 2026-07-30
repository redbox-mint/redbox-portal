import {
  FieldComponentConfigFrame,
  FieldComponentConfigOutline,
  FieldComponentDefinitionFrame,
  FieldComponentDefinitionOutline,
} from '../field-component.outline';
import { FormComponentDefinitionFrame, FormComponentDefinitionOutline } from '../form-component.outline';
import { AvailableFieldLayoutDefinitionFrames, AvailableFieldLayoutDefinitionOutlines } from '../dictionary.outline';
import {
  FieldComponentConfigFrameKindType,
  FieldComponentConfigKindType,
  FieldComponentDefinitionFrameKindType,
  FieldComponentDefinitionKindType,
  FormComponentDefinitionFrameKindType,
  FormComponentDefinitionKindType,
} from '../shared.outline';

export const WorkspaceSelectorComponentName = 'WorkspaceSelectorComponent' as const;
export type WorkspaceDisplayType = 'dropdown' | 'cards' | 'panels';

export interface WorkspaceTypeDefinition {
  name: string;
  label?: string;
  subtitle?: string;
  description?: string;
  logo?: string;
  externallyProvisioned?: boolean;
  [key: string]: unknown;
}

export interface WorkspaceFieldComponentConfigFrame extends FieldComponentConfigFrame {
  open?: string;
  saveFirst?: string;
  displayType?: WorkspaceDisplayType;
  shouldSaveForm?: boolean;
  allowAddTemplate?: string;
  defaultSelection?: WorkspaceTypeDefinition[];
}
export interface WorkspaceFieldComponentConfigOutline
  extends WorkspaceFieldComponentConfigFrame, FieldComponentConfigOutline {}
export interface WorkspaceFieldComponentDefinitionFrame extends FieldComponentDefinitionFrame {
  class: typeof WorkspaceSelectorComponentName;
  config?: WorkspaceFieldComponentConfigFrame;
}
export interface WorkspaceFieldComponentDefinitionOutline
  extends WorkspaceFieldComponentDefinitionFrame, FieldComponentDefinitionOutline {
  class: typeof WorkspaceSelectorComponentName;
  config?: WorkspaceFieldComponentConfigOutline;
}
export interface WorkspaceFormComponentDefinitionFrame extends FormComponentDefinitionFrame {
  component: WorkspaceFieldComponentDefinitionFrame;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionFrames;
}
export interface WorkspaceFormComponentDefinitionOutline
  extends WorkspaceFormComponentDefinitionFrame, FormComponentDefinitionOutline {
  component: WorkspaceFieldComponentDefinitionOutline;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionOutlines;
}
export type WorkspaceTypes =
  | { kind: FieldComponentConfigFrameKindType; class: WorkspaceFieldComponentConfigFrame }
  | { kind: FieldComponentDefinitionFrameKindType; class: WorkspaceFieldComponentDefinitionFrame }
  | { kind: FormComponentDefinitionFrameKindType; class: WorkspaceFormComponentDefinitionFrame }
  | { kind: FieldComponentConfigKindType; class: WorkspaceFieldComponentConfigOutline }
  | { kind: FieldComponentDefinitionKindType; class: WorkspaceFieldComponentDefinitionOutline }
  | { kind: FormComponentDefinitionKindType; class: WorkspaceFormComponentDefinitionOutline };
