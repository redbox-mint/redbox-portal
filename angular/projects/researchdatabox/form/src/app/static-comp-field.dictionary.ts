import { SimpleInputModel, SimpleInputComponent } from './component/simple-input.component';
import {
  RepeatableComponent,
  RepeatableComponentModel,
  RepeatableElementLayoutComponent,
} from './component/repeatable.component';
import { DefaultLayoutComponent } from './component/default-layout.component';
import { ActionRowLayoutComponent } from './component/action-row-layout.component';
import { InlineLayoutComponent } from './component/inline-layout.component';
import { ValidationSummaryFieldComponent } from './component/validation-summary.component';
import { SuggestedValidationSummaryFieldComponent } from './component/suggested-validation-summary.component';
import { GroupFieldModel, GroupFieldComponent } from './component/group.component';
import { ContentComponent } from './component/content.component';
import { TabComponent, TabComponentLayout, TabContentComponent } from './component/tab.component';
import { AccordionComponent, AccordionPanelComponent } from './component/accordion.component';
import { SaveButtonComponent } from './component/save-button.component';
import { SaveStatusComponent } from './component/save-status.component';
import { CancelButtonComponent } from './component/cancel-button.component';
import { DeleteButtonComponent } from './component/delete-button.component';
import { TabNavButtonComponent } from './component/tab-nav-button.component';
import { TextAreaComponent, TextAreaModel } from './component/text-area.component';
import { DropdownInputComponent, DropdownInputModel } from './component/dropdown-input.component';
import { CheckboxInputComponent, CheckboxInputModel } from './component/checkbox-input.component';
import { RadioInputComponent, RadioInputModel } from './component/radio-input.component';
import { DateInputComponent, DateInputModel } from './component/date-input.component';
import { QuestionTreeComponent, QuestionTreeModel } from './component/question-tree.component';
import { CheckboxTreeComponent, CheckboxTreeModel } from './component/checkbox-tree.component';
import { RecordSelectorComponent, RecordSelectorModel } from './component/record-selector.component';
import { TypeaheadInputComponent, TypeaheadInputModel } from './component/typeahead-input.component';
import { RichTextEditorComponent, RichTextEditorModel } from './component/rich-text-editor.component';
import { MapComponent, MapModel } from './component/map.component';
import { FileUploadComponent, FileUploadModel } from './component/file-upload.component';
import { PDFListComponent, PDFListModel } from './component/pdf-list.component';
import { DataLocationComponent, DataLocationModel } from './component/data-location.component';
import {
  PublishDataLocationSelectorComponent,
  PublishDataLocationSelectorModel,
} from './component/publish-data-location-selector.component';
import { PublishDataLocationRefreshComponent } from './component/publish-data-location-refresh.component';
import { RecordMetadataRetrieverComponent } from './component/record-metadata-retriever.component';
import { FormFieldBaseComponent, FormFieldComponentType, FormFieldModel } from '@researchdatabox/portal-ng-common';
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
  QuestionTreeModelName,
  GroupFieldModelName,
  CheckboxTreeModelName,
  RecordSelectorModelName,
  TypeaheadInputModelName,
  RichTextEditorModelName,
  MapModelName,
  FileUploadModelName,
  PDFListModelName,
  DataLocationModelName,
  PublishDataLocationRefreshComponentName,
  PublishDataLocationSelectorModelName,
  RecordMetadataRetrieverComponentName,
  RepeatableComponentName,
  SaveButtonComponentName,
  SaveStatusComponentName,
  TextAreaComponentName,
  ContentComponentName,
  SimpleInputComponentName,
  ValidationSummaryComponentName,
  SuggestedValidationSummaryComponentName,
  TabContentComponentName,
  TabComponentName,
  CheckboxInputComponentName,
  DropdownInputComponentName,
  RadioInputComponentName,
  DateInputComponentName,
  QuestionTreeComponentName,
  CheckboxTreeComponentName,
  RecordSelectorComponentName,
  TypeaheadInputComponentName,
  RichTextEditorComponentName,
  MapComponentName,
  FileUploadComponentName,
  PDFListComponentName,
  DataLocationComponentName,
  PublishDataLocationSelectorComponentName,
  CancelButtonComponentName,
  DeleteButtonComponentName,
  TabNavButtonComponentName,
  GroupFieldComponentName,
  TabLayoutName,
  TabContentLayoutName,
  AccordionComponentName,
  AccordionPanelComponentName,
  AccordionLayoutName,
  AccordionPanelLayoutName,
  RepeatableElementLayoutName,
  DefaultLayoutName,
  ActionRowLayoutName,
  InlineLayoutName,
  StaticClassMapType,
} from '@researchdatabox/sails-ng-common';

/*
 * The Component classes.
 */

export type StaticComponentClassMapType = StaticComponentClassMapGenType<FormFieldComponentType>;
export type AllComponentClassMapType = StaticClassMapType<string, FormFieldComponentType>;
export const getStaticComponentClassMap = (): StaticComponentClassMapType => ({
  [RepeatableComponentName]: RepeatableComponent,
  [GroupFieldComponentName]: GroupFieldComponent,
  [SaveButtonComponentName]: SaveButtonComponent,
  [SaveStatusComponentName]: SaveStatusComponent,
  [TextAreaComponentName]: TextAreaComponent,
  [ContentComponentName]: ContentComponent,
  [SimpleInputComponentName]: SimpleInputComponent,
  [ValidationSummaryComponentName]: ValidationSummaryFieldComponent,
  [SuggestedValidationSummaryComponentName]: SuggestedValidationSummaryFieldComponent,
  [TabContentComponentName]: TabContentComponent,
  [TabComponentName]: TabComponent,
  [AccordionComponentName]: AccordionComponent,
  [AccordionPanelComponentName]: AccordionPanelComponent,
  [CheckboxInputComponentName]: CheckboxInputComponent,
  [DropdownInputComponentName]: DropdownInputComponent,
  [RadioInputComponentName]: RadioInputComponent,
  [DateInputComponentName]: DateInputComponent,
  [QuestionTreeComponentName]: QuestionTreeComponent,
  [CheckboxTreeComponentName]: CheckboxTreeComponent,
  [RecordSelectorComponentName]: RecordSelectorComponent,
  [TypeaheadInputComponentName]: TypeaheadInputComponent,
  [RichTextEditorComponentName]: RichTextEditorComponent,
  [MapComponentName]: MapComponent,
  [FileUploadComponentName]: FileUploadComponent,
  [PDFListComponentName]: PDFListComponent,
  [RecordMetadataRetrieverComponentName]: RecordMetadataRetrieverComponent,
  // Register as component-only on purpose; refresh clicks should not create a
  // backing model object in submitted form data.
  [PublishDataLocationRefreshComponentName]: PublishDataLocationRefreshComponent,
  [DataLocationComponentName]: DataLocationComponent,
  [PublishDataLocationSelectorComponentName]: PublishDataLocationSelectorComponent,
  [CancelButtonComponentName]: CancelButtonComponent,
  [DeleteButtonComponentName]: DeleteButtonComponent,
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
  [QuestionTreeModelName]: QuestionTreeModel,
  [CheckboxTreeModelName]: CheckboxTreeModel,
  [RecordSelectorModelName]: RecordSelectorModel,
  [TypeaheadInputModelName]: TypeaheadInputModel,
  [RichTextEditorModelName]: RichTextEditorModel,
  [MapModelName]: MapModel,
  [FileUploadModelName]: FileUploadModel,
  [PDFListModelName]: PDFListModel,
  [DataLocationModelName]: DataLocationModel,
  [PublishDataLocationSelectorModelName]: PublishDataLocationSelectorModel,
});

/*
 * The Layout classes.
 */

export type StaticLayoutClassMapType = StaticLayoutClassMapGenType<FormFieldComponentType | null>;
export type AllLayoutClassMapType = StaticClassMapType<string, FormFieldComponentType | null>;
export const getStaticLayoutClassMap = (): StaticLayoutClassMapType => ({
  [DefaultLayoutName]: DefaultLayoutComponent,
  [ActionRowLayoutName]: ActionRowLayoutComponent,
  [InlineLayoutName]: InlineLayoutComponent,
  [RepeatableElementLayoutName]: RepeatableElementLayoutComponent,
  // The tab content layout is only used in the form config, it is not an angular component.
  [TabContentLayoutName]: null,
  [TabLayoutName]: TabComponentLayout,
  [AccordionLayoutName]: null,
  [AccordionPanelLayoutName]: null,
});
