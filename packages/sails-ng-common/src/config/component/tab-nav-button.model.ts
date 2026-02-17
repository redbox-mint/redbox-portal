import { FieldComponentConfig, FieldComponentDefinition } from '../field-component.model';
import { AvailableFieldLayoutDefinitionOutlines } from '../dictionary.outline';
import { FormComponentDefinition } from '../form-component.model';
import { FormConfigVisitorOutline } from '../visitor/base.outline';
import { FieldComponentConfigKind, FieldComponentDefinitionKind, FormComponentDefinitionKind } from '../shared.outline';
import {
  TabNavButtonComponentName,
  TabNavButtonFieldComponentConfigOutline,
  TabNavButtonFieldComponentDefinitionOutline,
  TabNavButtonFormComponentDefinitionOutline,
} from './tab-nav-button.outline';

/* Tab Nav Button Component */

export class TabNavButtonFieldComponentConfig
  extends FieldComponentConfig
  implements TabNavButtonFieldComponentConfigOutline
{
  prevLabel?: string;
  nextLabel?: string;
  targetTabContainerId?: string;
  endDisplayMode?: string;

  constructor() {
    super();
  }
}

export class TabNavButtonFieldComponentDefinition
  extends FieldComponentDefinition
  implements TabNavButtonFieldComponentDefinitionOutline
{
  class = TabNavButtonComponentName;
  config?: TabNavButtonFieldComponentConfigOutline;

  constructor() {
    super();
  }

  accept(visitor: FormConfigVisitorOutline): void {
    visitor.visitTabNavButtonFieldComponentDefinition(this);
  }
}

/* Tab Nav Button Form Component */

export class TabNavButtonFormComponentDefinition
  extends FormComponentDefinition
  implements TabNavButtonFormComponentDefinitionOutline
{
  component!: TabNavButtonFieldComponentDefinitionOutline;
  model?: never;
  layout?: AvailableFieldLayoutDefinitionOutlines;

  constructor() {
    super();
  }

  accept(visitor: FormConfigVisitorOutline) {
    visitor.visitTabNavButtonFormComponentDefinition(this);
  }
}

export const TabNavButtonMap = [
  { kind: FieldComponentConfigKind, def: TabNavButtonFieldComponentConfig },
  { kind: FieldComponentDefinitionKind, def: TabNavButtonFieldComponentDefinition, class: TabNavButtonComponentName },
  { kind: FormComponentDefinitionKind, def: TabNavButtonFormComponentDefinition, class: TabNavButtonComponentName },
];
export const TabNavButtonDefaults = {
  [FormComponentDefinitionKind]: {
    [TabNavButtonComponentName]: {
      [FieldComponentDefinitionKind]: TabNavButtonComponentName,
    },
  },
};
