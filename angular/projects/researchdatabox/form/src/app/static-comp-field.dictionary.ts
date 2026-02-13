import {SimpleInputModel, SimpleInputComponent} from "./component/simple-input.component";
import {
  RepeatableComponent,
  RepeatableComponentModel,
  RepeatableElementLayoutComponent
} from "./component/repeatable.component";
import {DefaultLayoutComponent} from "./component/default-layout.component";
import {ValidationSummaryFieldComponent} from "./component/validation-summary.component";
import {GroupFieldModel, GroupFieldComponent} from "./component/group.component";
import {ContentComponent} from "./component/content.component";
import {TabComponent, TabComponentLayout, TabContentComponent} from "./component/tab.component";
import {SaveButtonComponent} from "./component/save-button.component";
import {TextAreaComponent, TextAreaModel} from "./component/text-area.component";
import {DropdownInputComponent, DropdownInputModel} from "./component/dropdown-input.component";
import {CheckboxInputComponent, CheckboxInputModel} from "./component/checkbox-input.component";
import {RadioInputComponent, RadioInputModel} from "./component/radio-input.component";
import {DateInputComponent, DateInputModel} from "./component/date-input.component";
import {FormFieldBaseComponent, FormFieldModel} from "@researchdatabox/portal-ng-common";
import {
  StaticComponentClassMapGenType,
  StaticModelClassMapGenType,
  StaticLayoutClassMapGenType, RepeatableModelName, TextAreaModelName, SimpleInputModelName, CheckboxInputModelName,
  DropdownInputModelName, RadioInputModelName, DateInputModelName, GroupFieldModelName,
  RepeatableComponentName, SaveButtonComponentName, TextAreaComponentName, ContentComponentName,
  SimpleInputComponentName, ValidationSummaryComponentName, TabContentComponentName, TabComponentName,
  CheckboxInputComponentName, DropdownInputComponentName, RadioInputComponentName, DateInputComponentName,
  GroupFieldComponentName,
  TabLayoutName, TabContentLayoutName, RepeatableElementLayoutName, DefaultLayoutName, StaticClassMapType,
  QuestionTreeModelName, QuestionTreeComponentName,
} from "@researchdatabox/sails-ng-common";
import {QuestionTreeComponent, QuestionTreeModel} from "./component/question-tree.component";

/*
 * The Component classes.
 */

export type StaticComponentClassMapType = StaticComponentClassMapGenType<typeof FormFieldBaseComponent<unknown>>;
export type AllComponentClassMapType = StaticClassMapType<string, typeof FormFieldBaseComponent<unknown>>;
export const StaticComponentClassMap: StaticComponentClassMapType = {
  [RepeatableComponentName]: RepeatableComponent,
  [GroupFieldComponentName]: GroupFieldComponent,
  [SaveButtonComponentName]: SaveButtonComponent,
  [TextAreaComponentName]: TextAreaComponent,
  [ContentComponentName]: ContentComponent,
  [SimpleInputComponentName]: SimpleInputComponent,
  [ValidationSummaryComponentName]: ValidationSummaryFieldComponent,
  [TabContentComponentName]: TabContentComponent,
  [TabComponentName]: TabComponent,
  [CheckboxInputComponentName]: CheckboxInputComponent,
  [DropdownInputComponentName]: DropdownInputComponent,
  [RadioInputComponentName]: RadioInputComponent,
  [DateInputComponentName]: DateInputComponent,
  [QuestionTreeComponentName]: QuestionTreeComponent,
};

/*
 * The Model classes.
 */

export type StaticModelClassMapType = StaticModelClassMapGenType<typeof FormFieldModel<unknown>>;
export type AllModelClassMapType = StaticClassMapType<string, typeof FormFieldModel<unknown>>;
export const StaticModelClassMap: StaticModelClassMapType = {
  [RepeatableModelName]: RepeatableComponentModel,
  [GroupFieldModelName]: GroupFieldModel,
  [TextAreaModelName]: TextAreaModel,
  [SimpleInputModelName]: SimpleInputModel,
  [CheckboxInputModelName]: CheckboxInputModel,
  [DropdownInputModelName]: DropdownInputModel,
  [RadioInputModelName]: RadioInputModel,
  [DateInputModelName]: DateInputModel,
  [QuestionTreeModelName]: QuestionTreeModel,
};

/*
 * The Layout classes.
 */

export type StaticLayoutClassMapType = StaticLayoutClassMapGenType<typeof FormFieldBaseComponent<unknown> | null>;
export type AllLayoutClassMapType = StaticClassMapType<string,typeof FormFieldBaseComponent<unknown> | null>;
export const StaticLayoutClassMap: StaticLayoutClassMapType = {
  [DefaultLayoutName]: DefaultLayoutComponent,
  [RepeatableElementLayoutName]: RepeatableElementLayoutComponent,
  // The tab content layout is only used in the form config, it is not an angular component.
  [TabContentLayoutName]: null,
  [TabLayoutName]: TabComponentLayout
};
