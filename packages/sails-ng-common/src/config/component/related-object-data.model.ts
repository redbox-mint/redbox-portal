import { AvailableFieldLayoutDefinitionOutlines } from '../dictionary.outline';
import { FieldComponentConfig, FieldComponentDefinition } from '../field-component.model';
import { FormComponentDefinition } from '../form-component.model';
import { FieldComponentConfigKind, FieldComponentDefinitionKind, FormComponentDefinitionKind } from '../shared.outline';
import { FormConfigVisitorOutline } from '../visitor/base.outline';
import { ContentFieldComponentConfig } from './content.model';
import { RelatedObjectDataComponentName, RelatedObjectDataFieldComponentConfigOutline, RelatedObjectDataFieldComponentDefinitionOutline, RelatedObjectDataFormComponentDefinitionOutline, RelatedObjectSummary } from './related-object-data.outline';

export class RelatedObjectDataFieldComponentConfig extends ContentFieldComponentConfig implements RelatedObjectDataFieldComponentConfigOutline {
  dataPath?: string;
  oidProperty?: string;
  relatedFields?: string[];
  relatedObjects?: RelatedObjectSummary[];
  accessDeniedOids?: string[];
  failedOids?: string[];
}

export class RelatedObjectDataFieldComponentDefinition extends FieldComponentDefinition implements RelatedObjectDataFieldComponentDefinitionOutline {
  class = RelatedObjectDataComponentName;
  config?: RelatedObjectDataFieldComponentConfig;
  async accept(visitor: FormConfigVisitorOutline): Promise<void> { await visitor.visitRelatedObjectDataFieldComponentDefinition(this); }
}

export class RelatedObjectDataFormComponentDefinition extends FormComponentDefinition implements RelatedObjectDataFormComponentDefinitionOutline {
  component!: RelatedObjectDataFieldComponentDefinitionOutline;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionOutlines;
  async accept(visitor: FormConfigVisitorOutline): Promise<void> { await visitor.visitRelatedObjectDataFormComponentDefinition(this); }
}

export const RelatedObjectDataMap = [
  { kind: FieldComponentConfigKind, def: RelatedObjectDataFieldComponentConfig },
  { kind: FieldComponentDefinitionKind, def: RelatedObjectDataFieldComponentDefinition, class: RelatedObjectDataComponentName },
  { kind: FormComponentDefinitionKind, def: RelatedObjectDataFormComponentDefinition, class: RelatedObjectDataComponentName },
];
export const RelatedObjectDataDefaults = {
  [FormComponentDefinitionKind]: { [RelatedObjectDataComponentName]: { [FieldComponentDefinitionKind]: RelatedObjectDataComponentName } },
};
