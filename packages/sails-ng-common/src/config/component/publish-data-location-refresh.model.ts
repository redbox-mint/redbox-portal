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
  PublishDataLocationRefreshComponentName,
  PublishDataLocationRefreshFieldComponentConfigOutline,
  PublishDataLocationRefreshFieldComponentDefinitionOutline,
  PublishDataLocationRefreshFormComponentDefinitionOutline,
} from './publish-data-location-refresh.outline';

export class PublishDataLocationRefreshFieldComponentConfig
  extends FieldComponentConfig
  implements PublishDataLocationRefreshFieldComponentConfigOutline
{}

/** Visitor-aware definition for the stateless refresh trigger component. */
export class PublishDataLocationRefreshFieldComponentDefinition
  extends FieldComponentDefinition
  implements PublishDataLocationRefreshFieldComponentDefinitionOutline
{
  class = PublishDataLocationRefreshComponentName;
  config?: PublishDataLocationRefreshFieldComponentConfigOutline;

  accept(visitor: FormConfigVisitorOutline): void {
    visitor.visitPublishDataLocationRefreshFieldComponentDefinition(this);
  }
}

export class PublishDataLocationRefreshFormComponentDefinition
  extends FormComponentDefinition
  implements PublishDataLocationRefreshFormComponentDefinitionOutline
{
  component!: PublishDataLocationRefreshFieldComponentDefinitionOutline;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionOutlines;

  accept(visitor: FormConfigVisitorOutline): void {
    visitor.visitPublishDataLocationRefreshFormComponentDefinition(this);
  }
}

export const PublishDataLocationRefreshMap = [
  { kind: FieldComponentConfigKind, def: PublishDataLocationRefreshFieldComponentConfig },
  {
    kind: FieldComponentDefinitionKind,
    def: PublishDataLocationRefreshFieldComponentDefinition,
    class: PublishDataLocationRefreshComponentName,
  },
  {
    kind: FormComponentDefinitionKind,
    def: PublishDataLocationRefreshFormComponentDefinition,
    class: PublishDataLocationRefreshComponentName,
  },
] as const;

// Provide the minimum default shape necessary for standard construct/migrate
// visitors to instantiate the component without inventing a backing model.
export const PublishDataLocationRefreshDefaults = {
  [FormComponentDefinitionKind]: {
    [PublishDataLocationRefreshComponentName]: {
      [FieldComponentDefinitionKind]: PublishDataLocationRefreshComponentName,
    },
  },
};
