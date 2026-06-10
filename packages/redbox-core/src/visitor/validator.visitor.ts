import {
  FormConfigVisitor,
  FormValidatorConfig,
  FormValidatorControl,
  FormValidatorDefinition,
  FormValidatorSummaryErrors,
  SimpleServerFormValidatorControl,
  FormConfigOutline,
  ILogger,
  SimpleInputFieldComponentDefinitionOutline,
  SimpleInputFieldModelDefinitionOutline,
  SimpleInputFormComponentDefinitionOutline,
  guessType,
  FormComponentDefinitionOutline,
  ValidatorsSupport,
  ContentFieldComponentDefinitionOutline,
  ContentFormComponentDefinitionOutline,
  RepeatableFieldComponentDefinitionOutline,
  RepeatableFieldModelDefinitionOutline,
  RepeatableElementFieldLayoutDefinitionOutline,
  RepeatableFormComponentDefinitionOutline,
  ValidationSummaryFieldComponentDefinitionOutline,
  ValidationSummaryFormComponentDefinitionOutline,
  SuggestedValidationSummaryFieldComponentDefinitionOutline,
  SuggestedValidationSummaryFormComponentDefinitionOutline,
  SaveStatusFieldComponentDefinitionOutline,
  SaveStatusFormComponentDefinitionOutline,
  GroupFieldComponentDefinitionOutline,
  GroupFieldModelDefinitionOutline,
  GroupFormComponentDefinitionOutline,
  TabFieldComponentDefinitionOutline,
  TabFieldLayoutDefinitionOutline,
  TabFormComponentDefinitionOutline,
  TabContentFieldComponentDefinitionOutline,
  TabContentFieldLayoutDefinitionOutline,
  TabContentFormComponentDefinitionOutline,
  AccordionFieldComponentDefinitionOutline,
  AccordionFieldLayoutDefinitionOutline,
  AccordionFormComponentDefinitionOutline,
  AccordionPanelFieldComponentDefinitionOutline,
  AccordionPanelFieldLayoutDefinitionOutline,
  AccordionPanelFormComponentDefinitionOutline,
  SaveButtonFieldComponentDefinitionOutline,
  SaveButtonFormComponentDefinitionOutline,
  CancelButtonFieldComponentDefinitionOutline,
  CancelButtonFormComponentDefinitionOutline,
  DeleteButtonFieldComponentDefinitionOutline,
  DeleteButtonFormComponentDefinitionOutline,
  TabNavButtonFieldComponentDefinitionOutline,
  TabNavButtonFormComponentDefinitionOutline,
  TextAreaFieldComponentDefinitionOutline,
  TextAreaFieldModelDefinitionOutline,
  TextAreaFormComponentDefinitionOutline,
  DefaultFieldLayoutDefinitionOutline,
  CheckboxInputFieldComponentDefinitionOutline,
  CheckboxInputFieldModelDefinitionOutline,
  CheckboxInputFormComponentDefinitionOutline,
  CheckboxTreeFieldComponentDefinitionOutline,
  CheckboxTreeFieldModelDefinitionOutline,
  CheckboxTreeFormComponentDefinitionOutline,
  RecordSelectorFieldComponentDefinitionOutline,
  RecordSelectorFieldModelDefinitionOutline,
  RecordSelectorFormComponentDefinitionOutline,
  DropdownInputFieldComponentDefinitionOutline,
  DropdownInputFieldModelDefinitionOutline,
  DropdownInputFormComponentDefinitionOutline,
  TypeaheadInputFieldComponentDefinitionOutline,
  TypeaheadInputFieldModelDefinitionOutline,
  TypeaheadInputFormComponentDefinitionOutline,
  RichTextEditorFieldComponentDefinitionOutline,
  RichTextEditorFieldModelDefinitionOutline,
  RichTextEditorFormComponentDefinitionOutline,
  MapDrawingMode,
  MapFieldComponentDefinitionOutline,
  MapFieldModelDefinitionOutline,
  MapFormComponentDefinitionOutline,
  FileUploadFieldComponentDefinitionOutline,
  FileUploadFieldModelDefinitionOutline,
  FileUploadFormComponentDefinitionOutline,
  PDFListFieldComponentDefinitionOutline,
  PDFListFieldModelDefinitionOutline,
  PDFListFormComponentDefinitionOutline,
  RecordMetadataRetrieverFieldComponentDefinitionOutline,
  RecordMetadataRetrieverFormComponentDefinitionOutline,
  DataLocationFieldComponentDefinitionOutline,
  DataLocationFieldModelDefinitionOutline,
  DataLocationFormComponentDefinitionOutline,
  PublishDataLocationRefreshFieldComponentDefinitionOutline,
  PublishDataLocationRefreshFormComponentDefinitionOutline,
  PublishDataLocationSelectorFieldComponentDefinitionOutline,
  PublishDataLocationSelectorFieldModelDefinitionOutline,
  PublishDataLocationSelectorFormComponentDefinitionOutline,
  FormPathHelper,
  RadioInputFieldComponentDefinitionOutline,
  RadioInputFieldModelDefinitionOutline,
  RadioInputFormComponentDefinitionOutline,
  DateInputFieldComponentDefinitionOutline,
  DateInputFieldModelDefinitionOutline,
  DateInputFormComponentDefinitionOutline,
  QuestionTreeFieldComponentDefinitionOutline,
  QuestionTreeFieldModelDefinitionOutline,
  QuestionTreeFormComponentDefinitionOutline,
  FormConfig,
  buildLineagePaths,
  jsonataEvaluateFunc,
} from "@researchdatabox/sails-ng-common";
import { DataValueFormConfigVisitor } from "./data-value.visitor";


declare const sails: Sails.Application;

declare const DomSanitizerService: {
    sanitizeWithProfile: (value: string, profile?: string) => string;
};

/**
 * Visit each form config component and run its validators.
 *
 * This visitor is for the server-side.
 * On the client, use the standard angular component validator methods.
 *
 * By default, all validators are run: ['all'].
 * Specify which validators are run by providing enabledValidationGroups.
 */
export class ValidatorFormConfigVisitor extends FormConfigVisitor {
    private validatorSupport: ValidatorsSupport;

    private form: FormConfigOutline;
    private enabledValidationGroups: string[];
    private validatorDefinitionsMap: Map<string, FormValidatorDefinition>;

    private validationErrors: FormValidatorSummaryErrors[];

    private formPathHelper: FormPathHelper;

    constructor(logger: ILogger) {
        super(logger);

        this.validatorSupport = new ValidatorsSupport();

        this.form = new FormConfig();
        this.enabledValidationGroups = [];
        this.validatorDefinitionsMap = new Map<string, FormValidatorDefinition>();

        this.validationErrors = [];

        this.formPathHelper = new FormPathHelper(logger, this);
    }

    /**
     * Start the visitor.
     * @param options Configure the visitor.
     * @param options.form The constructed form.
     * @param options.enabledValidationGroups The validation groups to enable.
     * @param options.validatorDefinitions The validation definitions to make available.
     */
    async start(options: {
        form: FormConfigOutline;
        enabledValidationGroups?: string[];
        validatorDefinitions?: FormValidatorDefinition[];
    }
    ): Promise<FormValidatorSummaryErrors[]> {
        this.formPathHelper.reset();

        this.form = options.form;

        // use the first non-null, non-undefined value - empty array is a valid value
        this.enabledValidationGroups = options.enabledValidationGroups ?? this.form.enabledValidationGroups ?? ['all'];
        this.validatorDefinitionsMap = this.validatorSupport.createValidatorDefinitionMapping(options.validatorDefinitions || []);

        this.validationErrors = [];

        await this.form.accept(this);

        return this.validationErrors;
    }

    /* Form Config */

    async visitFormConfig(item: FormConfigOutline): Promise<void> {
        for (const [index, componentDefinition] of (item?.componentDefinitions ?? []).entries()) {
            // Visit children
            await this.formPathHelper.acceptFormPath(
                componentDefinition,
                this.formPathHelper.lineagePathsForFormConfigComponentDefinition(componentDefinition, index),
            );
        }

        // Run form-level validators using the full form data model.
        // There are various reasons a validator is at form level, e.g. they involve more than one field.
        const dataValueVisitor = new DataValueFormConfigVisitor(this.logger);
        const value = await dataValueVisitor.start({ form: item });
        const itemName = item?.name ?? "";
        this.validationErrors.push(...await this.validateFormComponent(itemName, value, item?.validators));
    }

    /* SimpleInput */

    async visitSimpleInputFieldComponentDefinition(_item: SimpleInputFieldComponentDefinitionOutline): Promise<void> {
    }

    async visitSimpleInputFieldModelDefinition(_item: SimpleInputFieldModelDefinitionOutline): Promise<void> {
    }

    async visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    /* Content */

    async visitContentFieldComponentDefinition(_item: ContentFieldComponentDefinitionOutline): Promise<void> {
    }

    async visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    /* Repeatable  */

    async visitRepeatableFieldComponentDefinition(_item: RepeatableFieldComponentDefinitionOutline): Promise<void> {
    }

    async visitRepeatableFieldModelDefinition(_item: RepeatableFieldModelDefinitionOutline): Promise<void> {
    }

    async visitRepeatableElementFieldLayoutDefinition(_item: RepeatableElementFieldLayoutDefinitionOutline): Promise<void> {
    }

    async visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    /* Validation Summary */

    async visitValidationSummaryFieldComponentDefinition(_item: ValidationSummaryFieldComponentDefinitionOutline): Promise<void> {
    }

    async visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    async visitSuggestedValidationSummaryFieldComponentDefinition(_item: SuggestedValidationSummaryFieldComponentDefinitionOutline): Promise<void> {
    }

    async visitSuggestedValidationSummaryFormComponentDefinition(item: SuggestedValidationSummaryFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    async visitSaveStatusFieldComponentDefinition(_item: SaveStatusFieldComponentDefinitionOutline): Promise<void> {
    }

    async visitSaveStatusFormComponentDefinition(item: SaveStatusFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    /* Group */

    async visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): Promise<void> {
        for (const [index, componentDefinition] of (item.config?.componentDefinitions ?? []).entries()) {
            // Visit children
            await this.formPathHelper.acceptFormPath(
                componentDefinition,
                this.formPathHelper.lineagePathsForGroupFieldComponentDefinition(componentDefinition, index),
            );
        }
    }

    async visitGroupFieldModelDefinition(_item: GroupFieldModelDefinitionOutline): Promise<void> {
    }

    async visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    /* Tab  */

    async visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): Promise<void> {
        for (const [index, componentDefinition] of (item.config?.tabs ?? []).entries()) {
            // Visit children
            await this.formPathHelper.acceptFormPath(
                componentDefinition,
                this.formPathHelper.lineagePathsForTabFieldComponentDefinition(componentDefinition, index),
            );
        }
    }

    async visitTabFieldLayoutDefinition(_item: TabFieldLayoutDefinitionOutline): Promise<void> {
    }

    async visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    /* Accordion */

    async visitAccordionFieldComponentDefinition(item: AccordionFieldComponentDefinitionOutline): Promise<void> {
        for (const [index, componentDefinition] of (item.config?.panels ?? []).entries()) {
            await this.formPathHelper.acceptFormPath(
                componentDefinition,
                this.formPathHelper.lineagePathsForAccordionFieldComponentDefinition(componentDefinition, index)
            );
        }
    }

    async visitAccordionFieldLayoutDefinition(_item: AccordionFieldLayoutDefinitionOutline): Promise<void> {
    }

    async visitAccordionFormComponentDefinition(item: AccordionFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    async visitAccordionPanelFieldComponentDefinition(item: AccordionPanelFieldComponentDefinitionOutline): Promise<void> {
        for (const [index, componentDefinition] of (item.config?.componentDefinitions ?? []).entries()) {
            await this.formPathHelper.acceptFormPath(
                componentDefinition,
                this.formPathHelper.lineagePathsForAccordionPanelFieldComponentDefinition(componentDefinition, index)
            );
        }
    }

    async visitAccordionPanelFieldLayoutDefinition(_item: AccordionPanelFieldLayoutDefinitionOutline): Promise<void> {
    }

    async visitAccordionPanelFormComponentDefinition(item: AccordionPanelFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    /*  Tab Content */

    async visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): Promise<void> {
        for (const [index, componentDefinition] of (item.config?.componentDefinitions ?? []).entries()) {
            // Visit children
            await this.formPathHelper.acceptFormPath(
                componentDefinition,
                this.formPathHelper.lineagePathsForTabContentFieldComponentDefinition(componentDefinition, index),
            );
        }
    }

    async visitTabContentFieldLayoutDefinition(_item: TabContentFieldLayoutDefinitionOutline): Promise<void> {
    }

    async visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    /* Save Button  */

    async visitSaveButtonFieldComponentDefinition(_item: SaveButtonFieldComponentDefinitionOutline): Promise<void> {
    }

    async visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    /* Cancel Button  */

    async visitCancelButtonFieldComponentDefinition(_item: CancelButtonFieldComponentDefinitionOutline): Promise<void> {
    }

    async visitCancelButtonFormComponentDefinition(item: CancelButtonFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    async visitDeleteButtonFieldComponentDefinition(_item: DeleteButtonFieldComponentDefinitionOutline): Promise<void> {
    }

    async visitDeleteButtonFormComponentDefinition(item: DeleteButtonFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    /* Tab Nav Button  */

    async visitTabNavButtonFieldComponentDefinition(_item: TabNavButtonFieldComponentDefinitionOutline): Promise<void> {
    }

    async visitTabNavButtonFormComponentDefinition(item: TabNavButtonFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    /* Text Area */

    async visitTextAreaFieldComponentDefinition(_item: TextAreaFieldComponentDefinitionOutline): Promise<void> {
    }

    async visitTextAreaFieldModelDefinition(_item: TextAreaFieldModelDefinitionOutline): Promise<void> {
    }

    async visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    /* Default Layout  */

    async visitDefaultFieldLayoutDefinition(_item: DefaultFieldLayoutDefinitionOutline): Promise<void> {
    }

    /* Checkbox Input */

    async visitCheckboxInputFieldComponentDefinition(_item: CheckboxInputFieldComponentDefinitionOutline): Promise<void> {
    }

    async visitCheckboxInputFieldModelDefinition(_item: CheckboxInputFieldModelDefinitionOutline): Promise<void> {
    }

    async visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    /* Question Tree */

    async visitQuestionTreeFieldComponentDefinition(item: QuestionTreeFieldComponentDefinitionOutline): Promise<void> {
        for (const [index, componentDefinition] of (item.config?.componentDefinitions ?? []).entries()) {
            await this.formPathHelper.acceptFormPath(
                componentDefinition,
                this.formPathHelper.lineagePathsForQuestionTreeFieldComponentDefinition(componentDefinition, index)
            );
        }
    }

    async visitQuestionTreeFieldModelDefinition(_item: QuestionTreeFieldModelDefinitionOutline): Promise<void> {
    }

    async visitQuestionTreeFormComponentDefinition(item: QuestionTreeFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    /* Checkbox Tree */

    async visitCheckboxTreeFieldComponentDefinition(_item: CheckboxTreeFieldComponentDefinitionOutline): Promise<void> {
    }

    async visitCheckboxTreeFieldModelDefinition(_item: CheckboxTreeFieldModelDefinitionOutline): Promise<void> {
    }

    async visitCheckboxTreeFormComponentDefinition(item: CheckboxTreeFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    async visitRecordSelectorFieldComponentDefinition(_item: RecordSelectorFieldComponentDefinitionOutline): Promise<void> {
    }

    async visitRecordSelectorFieldModelDefinition(_item: RecordSelectorFieldModelDefinitionOutline): Promise<void> {
    }

    async visitRecordSelectorFormComponentDefinition(item: RecordSelectorFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    /* Dropdown Input */

    async visitDropdownInputFieldComponentDefinition(_item: DropdownInputFieldComponentDefinitionOutline): Promise<void> {
    }

    async visitDropdownInputFieldModelDefinition(_item: DropdownInputFieldModelDefinitionOutline): Promise<void> {
    }

    async visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    /* Typeahead Input */

    async visitTypeaheadInputFieldComponentDefinition(item: TypeaheadInputFieldComponentDefinitionOutline): Promise<void> {
        const configErrors: FormValidatorSummaryErrors["errors"] = [];
        const config = item.config;
        const sourceType = String(config?.sourceType ?? "");

        if (!sourceType || !["static", "vocabulary", "namedQuery", "external", "service"].includes(sourceType)) {
            configErrors.push({
                class: "typeaheadSourceType",
                message: "@validator-error-typeahead-source-type",
                params: { sourceType }
            });
        }

        if (sourceType === "static" && (!Array.isArray(config?.staticOptions) || config.staticOptions.length === 0)) {
            configErrors.push({
                class: "typeaheadStaticOptions",
                message: "@validator-error-typeahead-static-options",
                params: { sourceType }
            });
        }
        if (sourceType === "vocabulary" && !String(config?.vocabRef ?? "").trim()) {
            configErrors.push({
                class: "typeaheadVocabRef",
                message: "@validator-error-typeahead-vocab-ref",
                params: { sourceType }
            });
        }
        if (sourceType === "namedQuery" && !String(config?.queryId ?? "").trim()) {
            configErrors.push({
                class: "typeaheadQueryId",
                message: "@validator-error-typeahead-query-id",
                params: { sourceType }
            });
        }
        const serviceId = String((config as Record<string, unknown> | undefined)?.["serviceId"] ?? "").trim();
        if (sourceType === "service" && !serviceId) {
            configErrors.push({
                class: "typeaheadServiceId",
                message: "@validator-error-typeahead-service-id",
                params: { sourceType }
            });
        }
        if (sourceType === "external" && !String(config?.provider ?? "").trim()) {
            configErrors.push({
                class: "typeaheadProvider",
                message: "@validator-error-typeahead-provider",
                params: { sourceType }
            });
        }
        if (config?.multiSelect === true) {
            configErrors.push({
                class: "typeaheadMultiSelect",
                message: "@validator-error-typeahead-multi-select-unsupported",
                params: { multiSelect: true }
            });
        }

        if (configErrors.length > 0) {
            this.validationErrors.push({
                id: String(this.formPathHelper.formPath.angularComponents?.[this.formPathHelper.formPath.angularComponents.length - 1] ?? ""),
                message: item?.config?.label ?? "TypeaheadInput configuration",
                errors: configErrors,
                lineagePaths: buildLineagePaths(this.formPathHelper.formPath)
            });
        }
    }

    async visitTypeaheadInputFieldModelDefinition(_item: TypeaheadInputFieldModelDefinitionOutline): Promise<void> {
    }


    async visitTypeaheadInputFormComponentDefinition(item: TypeaheadInputFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    /* Rich Text Editor */

    async visitRichTextEditorFieldComponentDefinition(_item: RichTextEditorFieldComponentDefinitionOutline): Promise<void> {
    }

    async visitRichTextEditorFieldModelDefinition(item: RichTextEditorFieldModelDefinitionOutline): Promise<void> {
        const value = item?.config?.value;
        if (typeof value !== 'string' || !value) {
            return;
        }


        const sanitized = DomSanitizerService.sanitizeWithProfile(value, 'html');
        // TODO: Validating this way that the html/markdown content has been sanitized is likely to be brittle
        // Initial implementation is to silently sanitize and warn, but may want to change to rejecting the content in future if sanitization issues are common.
        // This will likely need to hook more into domPurify to be more robust to detect when it is sanitizing content.
        // When we do this, we should also consider how to best report the issue to the user so they can fix their content - e.g. include details of what is not allowed in the error message.
        if (this.normalizeHtmlForComparison(sanitized) === this.normalizeHtmlForComparison(value)) {
            return;
        }

        const mode = sails?.config?.record?.form?.htmlSanitizationMode ?? 'sanitize';

        const componentName = String(this.formPathHelper.formPath.angularComponents?.[this.formPathHelper.formPath.angularComponents.length - 1] ?? "Rich text content");

        if (mode === 'reject') {
            // Report validation error, do NOT mutate
            this.validationErrors.push({
                id: componentName,
                message: componentName,
                errors: [{
                    class: "htmlUnsafe",
                    message: "@validator-error-html-unsafe",
                    params: { actual: value }
                }],
                lineagePaths: buildLineagePaths(this.formPathHelper.formPath)
            });
        } else {
            // Default: sanitize in-place, report as warning
            if (item.config) {
                item.config.value = sanitized;
            }
            this.validationErrors.push({
                id: componentName,
                message: componentName,
                errors: [{
                    class: "htmlSanitized",
                    message: "@validator-warning-html-sanitized",
                    params: {}
                }],
                lineagePaths: buildLineagePaths(this.formPathHelper.formPath)
            });
        }
    }

    async visitRichTextEditorFormComponentDefinition(item: RichTextEditorFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    /* Map */

    async visitMapFieldComponentDefinition(item: MapFieldComponentDefinitionOutline): Promise<void> {
        const configErrors: FormValidatorSummaryErrors["errors"] = [];
        const enabledModes = Array.isArray(item.config?.enabledModes) ? item.config?.enabledModes : [];
        const validModes: MapDrawingMode[] = ['point', 'polygon', 'linestring', 'rectangle', 'select'];
        const invalidModes = enabledModes.filter(mode => !validModes.includes(mode));
        if (invalidModes.length > 0) {
            configErrors.push({
                class: 'mapEnabledModes',
                message: '@validator-error-map-enabled-modes',
                params: { invalidModes }
            });
        }
        if (configErrors.length > 0) {
            this.validationErrors.push({
                id: String(
                    this.formPathHelper.formPath.angularComponents?.[this.formPathHelper.formPath.angularComponents.length - 1] ?? ''
                ),
                message: item?.config?.label ?? 'MapComponent configuration',
                errors: configErrors,
                lineagePaths: buildLineagePaths(this.formPathHelper.formPath)
            });
        }
    }

    async visitMapFieldModelDefinition(_item: MapFieldModelDefinitionOutline): Promise<void> {
    }

    async visitMapFormComponentDefinition(item: MapFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    /* File Upload */

    async visitFileUploadFieldComponentDefinition(_item: FileUploadFieldComponentDefinitionOutline): Promise<void> {
    }

    async visitFileUploadFieldModelDefinition(_item: FileUploadFieldModelDefinitionOutline): Promise<void> {
    }

    async visitFileUploadFormComponentDefinition(item: FileUploadFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    async visitPDFListFieldComponentDefinition(_item: PDFListFieldComponentDefinitionOutline): Promise<void> {
    }

    async visitPDFListFieldModelDefinition(_item: PDFListFieldModelDefinitionOutline): Promise<void> {
    }

    async visitPDFListFormComponentDefinition(item: PDFListFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    async visitRecordMetadataRetrieverFieldComponentDefinition(_item: RecordMetadataRetrieverFieldComponentDefinitionOutline): Promise<void> {
    }

    async visitRecordMetadataRetrieverFormComponentDefinition(item: RecordMetadataRetrieverFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    /* Data Location */

    async visitDataLocationFieldComponentDefinition(_item: DataLocationFieldComponentDefinitionOutline): Promise<void> {
    }

    async visitDataLocationFieldModelDefinition(_item: DataLocationFieldModelDefinitionOutline): Promise<void> {
    }

    async visitDataLocationFormComponentDefinition(item: DataLocationFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    // Validation is intentionally empty because there is no persisted refresh
    // value to validate.
    async visitPublishDataLocationRefreshFieldComponentDefinition(_item: PublishDataLocationRefreshFieldComponentDefinitionOutline): Promise<void> {
    }

    async visitPublishDataLocationRefreshFormComponentDefinition(item: PublishDataLocationRefreshFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    async visitPublishDataLocationSelectorFieldComponentDefinition(_item: PublishDataLocationSelectorFieldComponentDefinitionOutline): Promise<void> {
    }

    async visitPublishDataLocationSelectorFieldModelDefinition(_item: PublishDataLocationSelectorFieldModelDefinitionOutline): Promise<void> {
    }

    async visitPublishDataLocationSelectorFormComponentDefinition(item: PublishDataLocationSelectorFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    /* Radio Input */

    async visitRadioInputFieldComponentDefinition(_item: RadioInputFieldComponentDefinitionOutline): Promise<void> {
    }

    async visitRadioInputFieldModelDefinition(_item: RadioInputFieldModelDefinitionOutline): Promise<void> {
    }

    async visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    /* Date Input */

    async visitDateInputFieldComponentDefinition(_item: DateInputFieldComponentDefinitionOutline): Promise<void> {
    }

    async visitDateInputFieldModelDefinition(_item: DateInputFieldModelDefinitionOutline): Promise<void> {
    }

    async visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): Promise<void> {
        await this.acceptFormComponentDefinition(item);
    }

    /* Shared */

    protected createFormControlFromRecordValue(recordValue: unknown): FormValidatorControl {
        const guessedType = guessType(recordValue);
        let result;
        if (guessedType === "object") {
            result = new SimpleServerFormValidatorControl(
                Object.fromEntries(
                    Object.entries(recordValue as Record<string, unknown>)
                        .map(([key, value]) => [key, this.createFormControlFromRecordValue(value)])
                )
            );
        } else if (guessedType === "array") {
            result = new SimpleServerFormValidatorControl(
                (recordValue as Array<unknown>).map(i => this.createFormControlFromRecordValue(i))
            );
        } else {
            result = new SimpleServerFormValidatorControl(recordValue);
        }
        return result;
    }

    protected async acceptFormComponentDefinition(item: FormComponentDefinitionOutline) {
        const validationErrors = await this.validateFormComponent(
            item?.name,
            item?.model?.config?.value,
            item?.model?.config?.validators,
            item?.layout?.config?.label,
        );
        this.validationErrors.push(...validationErrors);
        await this.formPathHelper.acceptFormComponentDefinition(item);
    }

    protected async validateFormComponent(itemName: string, value: unknown, validators?: FormValidatorConfig[], message?: string): Promise<FormValidatorSummaryErrors[]> {
        const createFormValidatorFns = this.validatorSupport.createFormValidatorInstancesFromMapping;

        const availableValidatorGroups = this.form?.validationGroups ?? {};
        const result: FormValidatorSummaryErrors[] = [];
        if (Array.isArray(validators) && validators.length > 0) {
            // ensure jsonata-expression validators can be evaluated
            this.validatorSupport.assignJsonataEvaluators(validators, function (validator: FormValidatorConfig, index: number): unknown {
              const expr = validator?.config?.['expression']?.toString() ?? "";
              return jsonataEvaluateFunc(expr);
            });
            const filteredValidators = this.validatorSupport.enabledValidators(availableValidatorGroups, this.enabledValidationGroups, validators);

            const formValidatorFns = createFormValidatorFns(this.validatorDefinitionsMap, filteredValidators);
            const recordFormControl = this.createFormControlFromRecordValue(value);
            const summaryErrors: FormValidatorSummaryErrors = {
                id: itemName,
                message: message || null,
                errors: [],
                lineagePaths: buildLineagePaths(this.formPathHelper.formPath)
            }

            // async
            for (const formValidatorFn of formValidatorFns.asyncDefs) {
              const funcResult = await formValidatorFn(recordFormControl);
              const compErrors = this.validatorSupport.getFormValidatorComponentErrors(funcResult);
              summaryErrors.errors.push(...compErrors);
            }

            // sync
            for (const formValidatorFn of formValidatorFns.syncDefs) {
              const funcResult = formValidatorFn(recordFormControl);
              const compErrors = this.validatorSupport.getFormValidatorComponentErrors(funcResult);
              summaryErrors.errors.push(...compErrors);
            }

            // add the summary only if there are errors
            if (summaryErrors.errors.length > 0) {
              result.push(summaryErrors)
            }
        }

        return result;
    }


    private normalizeHtmlForComparison(value: string): string {
        return value
            .replace(/>\s+</g, '><')
            .replace(/\s+/g, ' ')
            .trim();
    }
}
