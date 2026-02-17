import { SimpleInputModel, SimpleInputComponent } from './component/simple-input.component';
import {
  RepeatableComponent,
  RepeatableComponentModel,
  RepeatableElementLayoutComponent,
} from './component/repeatable.component';
import { DefaultLayoutComponent } from './component/default-layout.component';
import { InlineLayoutComponent } from './component/inline-layout.component';
import { ValidationSummaryFieldComponent } from './component/validation-summary.component';
import { GroupFieldModel, GroupFieldComponent } from './component/group.component';
import { ContentComponent } from './component/content.component';
import { TabComponent, TabComponentLayout, TabContentComponent } from './component/tab.component';
import { SaveButtonComponent } from './component/save-button.component';
import { CancelButtonComponent } from './component/cancel-button.component';
import { TabNavButtonComponent } from './component/tab-nav-button.component';
import { TextAreaComponent, TextAreaModel } from './component/text-area.component';
import { DropdownInputComponent, DropdownInputModel } from './component/dropdown-input.component';
import { CheckboxInputComponent, CheckboxInputModel } from './component/checkbox-input.component';
import { RadioInputComponent, RadioInputModel } from './component/radio-input.component';
import { DateInputComponent, DateInputModel } from './component/date-input.component';
import { CheckboxTreeComponent, CheckboxTreeModel } from './component/checkbox-tree.component';
import { TypeaheadInputComponent, TypeaheadInputModel } from './component/typeahead-input.component';
import { RichTextEditorComponent, RichTextEditorModel } from './component/rich-text-editor.component';
import { MapComponent, MapModel } from './component/map.component';
import { FileUploadComponent, FileUploadModel } from './component/file-upload.component';
import { FormFieldBaseComponent, FormFieldModel } from '@researchdatabox/portal-ng-common';
import {
  StaticComponentClassMapGenType,
  StaticModelClassMapGenType,
  StaticLayoutClassMapGenType,
  RepeatableModelName,
  TextAreaModelName,
  SimpleInputModelName,
  CheckboxInputModelName,
  DropdownInputModelName,
  RadioInputModelName,
  DateInputModelName,
  GroupFieldModelName,
  CheckboxTreeModelName,
  TypeaheadInputModelName,
  RichTextEditorModelName,
  MapModelName,
  FileUploadModelName,
  RepeatableComponentName,
  SaveButtonComponentName,
  TextAreaComponentName,
  ContentComponentName,
  SimpleInputComponentName,
  ValidationSummaryComponentName,
  TabContentComponentName,
  TabComponentName,
  CheckboxInputComponentName,
  DropdownInputComponentName,
  RadioInputComponentName,
  DateInputComponentName,
  CheckboxTreeComponentName,
  TypeaheadInputComponentName,
  RichTextEditorComponentName,
  MapComponentName,
  FileUploadComponentName,
  CancelButtonComponentName,
  TabNavButtonComponentName,
  GroupFieldComponentName,
  TabLayoutName,
  TabContentLayoutName,
  RepeatableElementLayoutName,
  DefaultLayoutName,
  InlineLayoutName,
  StaticClassMapType,
} from '@researchdatabox/sails-ng-common';

/*
 * The Component classes.
 */

export type StaticComponentClassMapType = StaticComponentClassMapGenType<typeof FormFieldBaseComponent<unknown>>;
export type AllComponentClassMapType = StaticClassMapType<string, typeof FormFieldBaseComponent<unknown>>;
export const getStaticComponentClassMap = (): StaticComponentClassMapType => ({
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
  [CheckboxTreeComponentName]: CheckboxTreeComponent,
  [TypeaheadInputComponentName]: TypeaheadInputComponent,
  [RichTextEditorComponentName]: RichTextEditorComponent,
  [MapComponentName]: MapComponent,
  [FileUploadComponentName]: FileUploadComponent,
  [CancelButtonComponentName]: CancelButtonComponent,
  [TabNavButtonComponentName]: TabNavButtonComponent,
});

/*
 * The Model classes.
 */

export type StaticModelClassMapType = StaticModelClassMapGenType<typeof FormFieldModel<unknown>>;
export type AllModelClassMapType = StaticClassMapType<string, typeof FormFieldModel<unknown>>;
export const getStaticModelClassMap = (): StaticModelClassMapType => ({
  [RepeatableModelName]: RepeatableComponentModel,
  [GroupFieldModelName]: GroupFieldModel,
  [TextAreaModelName]: TextAreaModel,
  [SimpleInputModelName]: SimpleInputModel,
  [CheckboxInputModelName]: CheckboxInputModel,
  [DropdownInputModelName]: DropdownInputModel,
  [RadioInputModelName]: RadioInputModel,
  [DateInputModelName]: DateInputModel,
  [CheckboxTreeModelName]: CheckboxTreeModel,
  [TypeaheadInputModelName]: TypeaheadInputModel,
  [RichTextEditorModelName]: RichTextEditorModel,
  [MapModelName]: MapModel,
  [FileUploadModelName]: FileUploadModel,
});

/*
 * The Layout classes.
 */

export type StaticLayoutClassMapType = StaticLayoutClassMapGenType<typeof FormFieldBaseComponent<unknown> | null>;
export type AllLayoutClassMapType = StaticClassMapType<string, typeof FormFieldBaseComponent<unknown> | null>;
export const getStaticLayoutClassMap = (): StaticLayoutClassMapType => ({
  [DefaultLayoutName]: DefaultLayoutComponent,
  [InlineLayoutName]: InlineLayoutComponent,
  [RepeatableElementLayoutName]: RepeatableElementLayoutComponent,
  // The tab content layout is only used in the form config, it is not an angular component.
  [TabContentLayoutName]: null,
  [TabLayoutName]: TabComponentLayout,
});
