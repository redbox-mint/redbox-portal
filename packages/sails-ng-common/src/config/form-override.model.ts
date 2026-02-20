import {
    SimpleInputComponentName,
    SimpleInputFormComponentDefinitionOutline
} from "./component/simple-input.outline";
import {
    ContentComponentName,
    ContentFormComponentDefinitionFrame,
    ContentFormComponentDefinitionOutline
} from "./component/content.outline";
import {
    AllFormComponentDefinitionOutlines,
    AvailableFormComponentDefinitionFrames,
    ReusableFormDefinitions
} from "./dictionary.outline";
import {TextAreaComponentName, TextAreaFormComponentDefinitionOutline} from "./component/text-area.outline";
import {
    CheckboxInputComponentName,
    CheckboxInputFormComponentDefinitionOutline
} from "./component/checkbox-input.outline";
import {
    RadioInputComponentName,

    RadioInputFormComponentDefinitionOutline
} from "./component/radio-input.outline";
import {
    DateInputComponentName,
    DateInputFormComponentDefinitionOutline
} from "./component/date-input.outline";
import {DefaultTransformsType, KnownTransformsType} from "./form-override.outline";
import {cloneDeep as _cloneDeep, merge as _merge} from "lodash";

import {
    DropdownInputComponentName,
    DropdownInputFormComponentDefinitionOutline,
} from "./component/dropdown-input.outline";
import {TabContentComponentName} from "./component/tab-content.outline";

import {ReusableComponentName, ReusableFormComponentDefinitionFrame} from "./component/reusable.outline";
import {FormModesConfig} from "./shared.outline";
import {
    isTypeFormComponentDefinitionName,
    isTypeReusableComponent
} from "./form-types.outline";
import {PropertiesHelper} from "./visitor/common.model";
import {ILogger} from "../logger.interface";
import {ContentFieldComponentConfig} from "./component/content.model";
import {TabFormComponentDefinitionOutline, TabComponentName} from "./component/tab.outline";
import {
    AccordionComponentName,
    AccordionFormComponentDefinitionFrame,
    AccordionFormComponentDefinitionOutline,
    AccordionLayoutName,
    AccordionPanelComponentName,
    AccordionPanelFormComponentDefinitionFrame,
    AccordionPanelFormComponentDefinitionOutline,
    AccordionPanelLayoutName
} from "./component/accordion.outline";
import {
    AccordionFieldComponentConfig,
    AccordionFieldLayoutConfig,
    AccordionPanelFieldComponentConfig,
    AccordionPanelFieldLayoutConfig
} from "./component/accordion.model";
import {
    RepeatableComponentName,
    RepeatableFormComponentDefinitionOutline
} from "./component/repeatable.outline";
import {
    GroupFieldComponentName,
    GroupFormComponentDefinitionOutline
} from "./component/group.outline";
import {CheckboxTreeComponentName} from "./component/checkbox-tree.outline";
import {TypeaheadInputComponentName} from "./component/typeahead-input.outline";
import {RichTextEditorComponentName} from "./component/rich-text-editor.outline";
import {MapComponentName} from "./component/map.outline";
import {FileUploadComponentName} from "./component/file-upload.outline";


export class FormOverride {
    private propertiesHelper: PropertiesHelper;
    private logger: ILogger;

    constructor(logger: ILogger) {
        this.logger = logger;
        this.propertiesHelper = new PropertiesHelper();
    }

    /**
     * Defines the known transforms between two form components.
     * @private
     */
    private knownTransforms: KnownTransformsType = {
        [SimpleInputComponentName]: {
            [ContentComponentName]: this.sourceSimpleInputComponentTargetContentComponent,
        },
        [TextAreaComponentName]: {
            [ContentComponentName]: this.sourceTextAreaComponentTargetContentComponent,
        },
        [DropdownInputComponentName]: {
            [ContentComponentName]: this.sourceDropdownInputComponentTargetContentComponent,
        },
        [CheckboxInputComponentName]: {
            [ContentComponentName]: this.sourceCheckboxInputComponentTargetContentComponent,
        },
        [RadioInputComponentName]: {
            [ContentComponentName]: this.sourceRadioInputComponentTargetContentComponent,
        },
        [DateInputComponentName]: {
            [ContentComponentName]: this.sourceDateInputComponentTargetContentComponent,
        },
        [RepeatableComponentName]: {
            [ContentComponentName]: this.sourceRepeatableComponentTargetContentComponent,
        },
        [GroupFieldComponentName]: {
            [ContentComponentName]: this.sourceGroupComponentTargetContentComponent,
        },
        [TabComponentName]: {
            [AccordionComponentName]: this.sourceTabComponentTargetAccordionComponent,
        }
    };

    /**
     * Specifies the 'default' transforms that will be done without needing to be specified.
     * The defaults can be overridden by specifying the transform in overrides.formModeClasses.
     * @private
     */
    private defaultTransforms: DefaultTransformsType = {
        [SimpleInputComponentName]: {
            "view": {
                component: ContentComponentName,
            }
        },
        [TextAreaComponentName]: {
            "view": {
                component: ContentComponentName,
            }
        },
        [DropdownInputComponentName]: {
            "view": {
                component: ContentComponentName,
            }
        },
        [CheckboxInputComponentName]: {
            "view": {
                component: ContentComponentName,
            }
        },
        [RadioInputComponentName]: {
            "view": {
                component: ContentComponentName,
            }
        },
        [DateInputComponentName]: {
            "view": {
                component: ContentComponentName,
            }
        },
        [RepeatableComponentName]: {
            "view": {
                component: ContentComponentName,
            }
        },
        [GroupFieldComponentName]: {
            "view": {
                component: ContentComponentName,
            }
        },
        [TabComponentName]: {
            "view": {
                component: AccordionComponentName,
                layout: AccordionLayoutName,
            }
        },
    }

    private readonly tableCompatibleLeafComponentNames = new Set<string>([
        SimpleInputComponentName,
        TextAreaComponentName,
        DateInputComponentName,
        DropdownInputComponentName,
        CheckboxInputComponentName,
        RadioInputComponentName,
        TypeaheadInputComponentName,
        RichTextEditorComponentName,
        MapComponentName,
        ContentComponentName,
        CheckboxTreeComponentName,
    ]);

    /**
     * Apply any reusable form configs in the form component definitions.
     * @param items The form component definitions.
     * @param reusableFormDefs
     * @protected
     */
    public applyOverridesReusable(items: AvailableFormComponentDefinitionFrames[], reusableFormDefs: ReusableFormDefinitions): AvailableFormComponentDefinitionFrames[] {
        const reusableFormDefNames = Object.keys(reusableFormDefs ?? {}).sort();
        // Expanding the reusable form name to the associated form config requires replacing the item in the array.
        // Changing the array that's currently being iterated can result in unstable or undefined behaviour.
        // Instead, find the index of the first item that is a reusable component.
        const index = items.findIndex((item) => isTypeReusableComponent(item, reusableFormDefNames));

        // When there are no more items to expand, return the updated items array.
        if (index === -1) {
            return items;
        }

        // Update the items array to remove the reusable component and replace it with the form config it represents.
        const item = items[index];
        if (isTypeReusableComponent(item, reusableFormDefNames)) {
            const expandedItems = this.applyOverrideReusableExpand(item, reusableFormDefs);
            const newItems = [...items];
            newItems.splice(index, 1, ...expandedItems);
            items = newItems;
        } else {
            throw new Error(`Somehow the isReusableComponent was true earlier, but is now false, for the same item. Logic error?`);
        }

        // Continue until there are no more reusable components to expand.
        return this.applyOverridesReusable(items, reusableFormDefs);
    }


    /**
     * Expand a reusable form config definition to the actual form component definition(s).
     * @param item The reusable form component definition.
     * @param reusableFormDefs
     * @protected
     */
    protected applyOverrideReusableExpand(item: ReusableFormComponentDefinitionFrame, reusableFormDefs: ReusableFormDefinitions): AvailableFormComponentDefinitionFrames[] {
        const reusableFormName = item?.overrides?.reusableFormName ?? "";
        const expandedItemsRaw = Object.keys(reusableFormDefs).includes(reusableFormName) ? reusableFormDefs[reusableFormName] : [];
        const expandedItems = this.applyOverridesReusable(expandedItemsRaw, reusableFormDefs);
        const additionalItemsRaw = item.component.config?.componentDefinitions ?? [];
        const additionalItems = this.applyOverridesReusable(additionalItemsRaw, reusableFormDefs);

        const expandedItemNames = expandedItems.map(i => i.name);
        const extraAdditionalItems = additionalItems.filter((i) => !expandedItemNames.includes(i.name));
        if (extraAdditionalItems.length > 0) {
            throw new Error("Invalid usage of reusable form config. " +
                `Each item in the ${ReusableComponentName} componentDefinitions must have a name that matches an item in the reusable form config '${reusableFormName}'. ` +
                `Names '${extraAdditionalItems.map(i => i.name)}' did not match any reusable form config items. ` +
                `Available names are '${expandedItems.map((i) => i.name).sort().join(', ')}'.`);
        }

        const result = [];
        for (const expandedItem of expandedItems) {
            const additionalItemsMatched = additionalItems.filter((additionalItem) => expandedItem.name === additionalItem.name);
            if (additionalItemsMatched.length > 1) {
                throw new Error("Invalid usage of reusable form config. " +
                    `Each item in the ${ReusableComponentName} componentDefinitions must have a unique name. ` +
                    `These names were not unique '${Array.from(new Set(additionalItemsMatched.map(i => i.name))).sort().join(', ')}'.`);
            }

            if (additionalItemsMatched.length === 1) {
                const additionalItem = additionalItemsMatched[0];
                const known = {
                    component: {reusable: expandedItem.component.class, additional: additionalItem.component.class},
                    model: {reusable: expandedItem.model?.class, additional: additionalItem.model?.class},
                    layout: {reusable: expandedItem.layout?.class, additional: additionalItem.layout?.class},
                };
                for (const [key, values] of Object.entries(known)) {
                    const reusableValue = values.reusable;
                    const additionalValue = values.additional;
                    if (reusableValue && additionalValue && reusableValue !== additionalValue) {
                        throw new Error(
                            "Invalid usage of reusable form config. The class must match the reusable form config. " +
                            "To change the class, use 'formModeClasses'. " +
                            `The ${key} class in reusable form config '${reusableFormName}' item '${expandedItem.name}' ` +
                            `is '${reusableValue}' given class was '${additionalValue}'.`);
                    }
                }
            }

            const newItem = _merge({}, expandedItem, additionalItemsMatched.length === 1 ? additionalItemsMatched[0] : {});
            result.push(newItem);
        }
        return result;
    }

    /**
     * Apply any overrides that transform a component into another component.
     * @param source The original component.
     * @param formMode The current form mode.
     * @returns The transformed form component.
     */
    public applyOverrideTransform(
        source: AllFormComponentDefinitionOutlines,
        formMode: FormModesConfig,
        options?: { phase?: "construct" | "client" }
    ): AllFormComponentDefinitionOutlines {
        const original: AllFormComponentDefinitionOutlines = _cloneDeep(source);
        const phase = options?.phase ?? "construct";

        // Get the component class name, this is also used as the form component identifier.
        const originalComponentClassName = original.component.class;

        // Get the provided transforms for the provided form mode.
        let transforms = original?.overrides?.formModeClasses?.[formMode] ?? {};

        // Apply any default transform for the provided form mode.
        const deferViewModeContentFlatteningAtConstruct = phase === "construct" &&
            formMode === "view" &&
            new Set<string>([RepeatableComponentName, GroupFieldComponentName]).has(originalComponentClassName);

        if (originalComponentClassName in this.defaultTransforms && !deferViewModeContentFlatteningAtConstruct) {
            const defaultTransform = this.defaultTransforms[originalComponentClassName] ?? {};
            if (formMode in defaultTransform) {
                const defaultTransformClasses = defaultTransform[formMode] ?? {};
                transforms = _merge({}, defaultTransformClasses, transforms);
            }
        }
        const transformComponentClassName = transforms?.component;

        // Check that the transform is valid.
        if (!transformComponentClassName && (transforms.model || transforms.layout)) {
            throw new Error("A transform must specify the component class when specifying other classes." +
                `Form component name '${source.name}' model class '${transforms.model}' layout class '${transforms.layout}'.`);
        }

        // Get the known transformations for the source form component definition.
        const sourceKnownTransforms = this.knownTransforms[originalComponentClassName] ?? {};

        // Return the source unmodified if there are no transforms specified.
        // Return the source unmodified if the transformation is to the same component
        const isTransformExpected = transformComponentClassName &&
            transformComponentClassName !== originalComponentClassName &&
            Object.keys(transforms).length > 0;

        // If a transform was provided, check that it is a known transform.
        if (isTransformExpected && !(transformComponentClassName in sourceKnownTransforms)) {
            throw new Error(`Invalid form config override config. ` +
                `The source component class '${originalComponentClassName}' does ` +
                `not define a transform to target component class '${transformComponentClassName}'.`)
        }

        // Check the transform function specified.
        const transformFunc = isTransformExpected ? sourceKnownTransforms[transformComponentClassName] : null;
        if (isTransformExpected && !transformFunc) {
            throw new Error("The known form mode override component class transforms are invalid. " +
                `The function to execute must be provided for source component class '${originalComponentClassName}' ` +
                `and target component class '${transformComponentClassName}'.`);
        }

        // Apply the transform.
        const hasTransform = !!transformComponentClassName && !!transformFunc;
        const result = hasTransform ? transformFunc.call(this, original, formMode) : original;

        // Use 'replaceName' to update the form component name.
        if (original.overrides?.replaceName !== undefined) {
            result.name = original.overrides?.replaceName;
        }

        // Remove the 'overrides' property, as it has been applied and so should not be present in the form config.
        if ('overrides' in result) {
            delete result['overrides'];
        }

        if (isTransformExpected) {
            this.logger.info(`Component '${source?.name}' ${hasTransform ? 'transformed' : 'unmodified'} ` +
                `from '${originalComponentClassName}' to '${transformComponentClassName}'.`);
        }

        return result;
    }

    private sourceSimpleInputComponentTargetContentComponent(
        source: SimpleInputFormComponentDefinitionOutline,
        formMode: FormModesConfig
    ): ContentFormComponentDefinitionOutline {
        const target = this.commonContentComponent(source, formMode);
        this.commonContentPlain(source, target);
        return target;
    }

    private sourceTextAreaComponentTargetContentComponent(
        source: TextAreaFormComponentDefinitionOutline,
        formMode: FormModesConfig
    ): ContentFormComponentDefinitionOutline {
        const target = this.commonContentComponent(source, formMode);
        this.commonContentPlain(source, target);
        return target;
    }

    private sourceDropdownInputComponentTargetContentComponent(
        source: DropdownInputFormComponentDefinitionOutline,
        formMode: FormModesConfig
    ): ContentFormComponentDefinitionOutline {
        const target = this.commonContentComponent(source, formMode);
        this.commonContentPlain(source, target);
        return target;
    }

    private sourceCheckboxInputComponentTargetContentComponent(
        source: CheckboxInputFormComponentDefinitionOutline,
        formMode: FormModesConfig
    ): ContentFormComponentDefinitionOutline {
        const target = this.commonContentComponent(source, formMode);

        if (
            target.component.config !== undefined
            && source.model?.config?.value !== undefined
        ) {
            // Checkbox value can be string, null, array. If string or array, get the labels.
            // Can have 0, 1, or more values.
            const values = source.model.config.value === null
                ? []
                : Array.isArray(source.model.config.value) ? source.model.config.value : [source.model.config.value];
            const options = source.component.config?.options ?? [];

            this.commonContentOptionList(target, values, options);
        }

        return target;
    }

    private sourceRadioInputComponentTargetContentComponent(
        source: RadioInputFormComponentDefinitionOutline,
        formMode: FormModesConfig
    ): ContentFormComponentDefinitionOutline {
        const target = this.commonContentComponent(source, formMode);

        if (
            target.component.config !== undefined
            && source.model?.config?.value !== undefined
        ) {
            // Radio value can be string, null, array. If string or array, get the labels.
            // Can have 0 or 1 values.
            const values = source.model.config.value === null
                ? []
                : (Array.isArray(source.model.config.value) ? source.model.config.value : [source.model.config.value]);
            const options = source.component.config?.options ?? [];

            this.commonContentOptionList(target, values, options);
        }

        return target;
    }

    private sourceDateInputComponentTargetContentComponent(
        source: DateInputFormComponentDefinitionOutline,
        formMode: FormModesConfig
    ): ContentFormComponentDefinitionOutline {
        const target = this.commonContentComponent(source, formMode);

        if (
            target.component.config !== undefined
            && source.model?.config?.value !== undefined
        ) {
            target.component.config.content = source.model.config.value;
            // The content is provided via the context as a 'content' variable.
            // Use the common handlebars formatDate helper
            target.component.config.template = `<span data-value="{{content}}">{{formatDate content}}</span>`
        }

        return target;
    }

    private sourceRepeatableComponentTargetContentComponent(
        source: RepeatableFormComponentDefinitionOutline,
        formMode: FormModesConfig
    ): ContentFormComponentDefinitionOutline {
        const target = this.commonContentComponent(source, formMode);
        if (target.component.config) {
            target.component.config.content = Array.isArray(source.model?.config?.value) ? source.model?.config?.value : [];
            target.component.config.template = this.generateTemplateForComponent(source, "content");
        }
        return target;
    }

    private sourceGroupComponentTargetContentComponent(
        source: GroupFormComponentDefinitionOutline,
        formMode: FormModesConfig
    ): ContentFormComponentDefinitionOutline {
        const target = this.commonContentComponent(source, formMode);
        if (target.component.config) {
            const contentValue = source.model?.config?.value;
            target.component.config.content = contentValue && typeof contentValue === "object" ? contentValue : {};
            target.component.config.template = this.generateTemplateForComponent(source, "content");
        }
        return target;
    }

    private generateTemplateForComponent(component: AllFormComponentDefinitionOutlines, rootExpr: string): string {
        const className = component?.component?.class;
        if (className === RepeatableComponentName) {
            return this.generateRepeatableTemplate(component as RepeatableFormComponentDefinitionOutline, rootExpr);
        }
        if (className === GroupFieldComponentName) {
            return this.generateGroupTemplate(component as GroupFormComponentDefinitionOutline, rootExpr);
        }
        return this.renderLeafValue(component, rootExpr, []);
    }

    private generateRepeatableTemplate(component: RepeatableFormComponentDefinitionOutline, rootExpr: string): string {
        const elementTemplate = component?.component?.config?.elementTemplate;
        if (!elementTemplate) {
            return `<div class="rb-view-repeatable"></div>`;
        }

        const groupChildren = this.getGroupChildren(elementTemplate);
        const tableEligible = !!groupChildren && this.isTableEligibleGroupChildren(groupChildren);
        this.logger.debug(`Repeatable view transform '${component.name}' using ${tableEligible ? "table" : "fallback"} layout.`);

        if (tableEligible && groupChildren) {
            return this.renderRepeatableTable(groupChildren, rootExpr);
        }
        return this.renderRepeatableFallback(elementTemplate, rootExpr);
    }

    private generateGroupTemplate(component: GroupFormComponentDefinitionOutline, rootExpr: string): string {
        const children = component?.component?.config?.componentDefinitions ?? [];
        const rows = children.map(child => this.renderLabelValueRow(child, rootExpr)).join("");
        return `<div class="rb-view-group">${rows}</div>`;
    }

    private renderRepeatableTable(children: AllFormComponentDefinitionOutlines[], rootExpr: string): string {
        const headers = children.map(child => `<th>${this.resolveTranslatedLabel(child)}</th>`).join("");
        const cells = children.map(child => `<td>${this.renderLeafValue(child, "this", [child.name])}</td>`).join("");
        return `<div class="rb-view-repeatable rb-view-repeatable-table-wrapper"><table class="table table-striped table-sm rb-view-repeatable-table"><thead><tr>${headers}</tr></thead><tbody>{{#each ${rootExpr}}}<tr>${cells}</tr>{{/each}}</tbody></table></div>`;
    }

    private renderRepeatableFallback(
        elementTemplate: AllFormComponentDefinitionOutlines,
        rootExpr: string
    ): string {
        const itemBody = this.renderComponentBody(elementTemplate, "this");
        return `<div class="rb-view-repeatable rb-view-repeatable-list">{{#each ${rootExpr}}}<div class="rb-view-repeatable-card">${itemBody}</div>{{/each}}</div>`;
    }

    private renderComponentBody(component: AllFormComponentDefinitionOutlines, rootExpr: string): string {
        const className = component?.component?.class;
        if (className === GroupFieldComponentName) {
            const children = this.getGroupChildren(component) ?? [];
            return children.map(child => this.renderLabelValueRow(child, rootExpr)).join("");
        }
        if (className === RepeatableComponentName) {
            const nestedRoot = this.buildNestedExpression(rootExpr, component?.name);
            return this.generateRepeatableTemplate(component as RepeatableFormComponentDefinitionOutline, nestedRoot);
        }
        return this.renderLeafValue(component, rootExpr, component?.name ? [component.name] : []);
    }

    private renderLabelValueRow(component: AllFormComponentDefinitionOutlines, rootExpr: string): string {
        const label = this.resolveTranslatedLabel(component);
        const valueExpr = this.renderComponentBody(component, rootExpr);
        if (label.trim().length === 0) {
            return `<div class="rb-view-row"><div class="rb-view-value">${valueExpr}</div></div>`;
        }
        return `<div class="rb-view-row"><div class="rb-view-label">${label}</div><div class="rb-view-value">${valueExpr}</div></div>`;
    }

    private renderLeafValue(component: AllFormComponentDefinitionOutlines, rootExpr: string, pathParts: string[]): string {
        const className = component?.component?.class ?? "";
        const expression = this.safeValueExpression(rootExpr, pathParts);

        if (className === FileUploadComponentName) {
            return `<ul class="rb-view-file-upload">{{#each ${expression}}}<li>{{default this.name this.fileId}}</li>{{/each}}</ul>`;
        }
        if (className === ContentComponentName) {
            const template = component?.component?.config && "template" in component.component.config
                ? (component.component.config as { template?: string }).template
                : undefined;
            const trimmedTemplate = (template ?? "").trim();
            if (trimmedTemplate === "{{content}}" || trimmedTemplate === "{{{content}}}" || trimmedTemplate === "<span>{{content}}</span>") {
                return `{{default ${expression} ""}}`;
            }
            return `{{default ${expression} ""}}`;
        }
        if (className === CheckboxTreeComponentName) {
            return `{{join ${expression} ", "}}`;
        }
        return `{{default ${expression} ""}}`;
    }

    private getGroupChildren(component: AllFormComponentDefinitionOutlines): AllFormComponentDefinitionOutlines[] | null {
        if (component?.component?.class !== GroupFieldComponentName) {
            return null;
        }
        const componentDefinitions = component?.component?.config && "componentDefinitions" in component.component.config
            ? (component.component.config as { componentDefinitions?: AllFormComponentDefinitionOutlines[] }).componentDefinitions
            : [];
        return componentDefinitions ?? [];
    }

    private isTableEligibleGroupChildren(children: AllFormComponentDefinitionOutlines[]): boolean {
        const names = new Set<string>();
        for (const child of children) {
            const childName = child?.name?.trim?.() ?? "";
            if (childName.length === 0 || names.has(childName)) {
                this.logger.debug(`Repeatable view transform table eligibility failed due to duplicate/empty child name '${child?.name ?? ""}'.`);
                return false;
            }
            names.add(childName);

            const className = child?.component?.class ?? "";
            if (!this.tableCompatibleLeafComponentNames.has(className) || className === FileUploadComponentName) {
                this.logger.debug(`Repeatable view transform table eligibility failed for class '${className}'.`);
                return false;
            }
        }
        return children.length > 0;
    }

    private resolveTranslatedLabel(component: AllFormComponentDefinitionOutlines): string {
        const config = component?.component?.config as { label?: string } | undefined;
        const label = typeof config?.label === "string" ? config.label.trim() : "";
        if (label.length > 0) {
            return `{{t "${this.escapeForHandlebarsLiteral(label)}"}}`;
        }
        const name = typeof component?.name === "string" ? component.name.trim() : "";
        return this.escapeForHandlebarsLiteral(name);
    }

    private safeValueExpression(rootExpr: string, pathParts: string[]): string {
        const cleanedParts = (pathParts ?? []).filter(part => typeof part === "string" && part.trim().length > 0);
        if (cleanedParts.length === 0) {
            return rootExpr;
        }
        return `(get ${rootExpr} "${this.escapeForHandlebarsLiteral(cleanedParts.join("."))}" "")`;
    }

    private buildNestedExpression(rootExpr: string, part?: string): string {
        if (!part || part.trim().length === 0) {
            return rootExpr;
        }
        return `(get ${rootExpr} "${this.escapeForHandlebarsLiteral(part)}" "")`;
    }

    private escapeForHandlebarsLiteral(value: string): string {
        return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }

    private sourceTabComponentTargetAccordionComponent(
        source: TabFormComponentDefinitionOutline,
        formMode: FormModesConfig
    ): AccordionFormComponentDefinitionOutline {
        const frame: AccordionFormComponentDefinitionFrame = {
            name: source.name,
            component: {
                class: AccordionComponentName,
                config: {
                    panels: [],
                    startingOpenMode: "all-open",
                }
            },
            layout: {
                class: AccordionLayoutName,
                config: {},
            },
            module: source.module,
            expressions: source.expressions,
            constraints: source.constraints,
            overrides: source.overrides,
        };

        const target = this.propertiesHelper.sharedConstructFormComponent(frame);
        if (!isTypeFormComponentDefinitionName<AccordionFormComponentDefinitionOutline>(target, AccordionComponentName)) {
            throw new Error(`Could not create class for form component class name '${AccordionComponentName}': ${JSON.stringify(target)}.`);
        }

        target.component.config = new AccordionFieldComponentConfig();
        if (!target.layout) {
            throw new Error(`Could not create layout class for '${AccordionComponentName}'.`);
        }
        target.layout.config = target.layout.config ?? new AccordionFieldLayoutConfig();

        this.propertiesHelper.sharedPopulateFieldComponentConfig(target.component.config, source.component?.config);
        this.propertiesHelper.sharedPopulateFieldLayoutConfig(target.layout.config, source.layout?.config);
        target.component.config.startingOpenMode = "all-open";
        target.component.config.panels = [];

        const tabs = source.component?.config?.tabs ?? [];
        tabs.forEach((tab, index) => {
            if (!isTypeFormComponentDefinitionName(tab, TabContentComponentName)) {
                this.logger.warn(`Tab to accordion transform skipped invalid tab at index ${index} for component '${source.name}'.`);
                return;
            }

            const buttonLabelCandidate = tab.layout?.config?.buttonLabel;
            const tabNameCandidate = tab.name;
            const buttonLabel =
                (typeof buttonLabelCandidate === "string" && buttonLabelCandidate.trim().length > 0)
                    ? buttonLabelCandidate
                    : ((typeof tabNameCandidate === "string" && tabNameCandidate.trim().length > 0)
                        ? tabNameCandidate
                        : `${index}`);
            const panelFrame: AccordionPanelFormComponentDefinitionFrame = {
                name: tab.name ?? `panel-${index}`,
                component: {
                    class: AccordionPanelComponentName,
                    config: {
                        componentDefinitions: (tab.component?.config?.componentDefinitions ?? []).map(compDef => {
                            this.forceAllowModeForTransformedTree(compDef as any, formMode);
                            return compDef;
                        }),
                    }
                },
                layout: {
                    class: AccordionPanelLayoutName,
                    config: {
                        buttonLabel,
                    }
                },
            };

            const panel = this.propertiesHelper.sharedConstructFormComponent(panelFrame);
            if (!isTypeFormComponentDefinitionName<AccordionPanelFormComponentDefinitionOutline>(panel, AccordionPanelComponentName)) {
                this.logger.warn(`Tab to accordion transform skipped panel at index ${index} for component '${source.name}'.`);
                return;
            }

            panel.component.config = panel.component.config ?? new AccordionPanelFieldComponentConfig();
            if (!panel.layout) {
                throw new Error(`Could not create layout class for '${AccordionPanelComponentName}'.`);
            }
            panel.layout.config = panel.layout.config ?? new AccordionPanelFieldLayoutConfig();

            this.propertiesHelper.sharedPopulateFieldComponentConfig(panel.component.config, panelFrame.component.config);
            // sharedPopulateFieldComponentConfig only maps common fields, so preserve panel children explicitly.
            panel.component.config.componentDefinitions =
                (panelFrame.component.config?.componentDefinitions ?? []) as typeof panel.component.config.componentDefinitions;
            this.propertiesHelper.sharedPopulateFieldLayoutConfig(panel.layout.config, panelFrame.layout?.config);
            this.propertiesHelper.setPropOverride("buttonLabel", panel.layout.config, panelFrame.layout?.config);

            target.component.config?.panels.push(panel);
        });

        return target;
    }

    private forceAllowModeForTransformedTree(componentDefinition: any, formMode: FormModesConfig): void {
        if (!componentDefinition || typeof componentDefinition !== "object") {
            return;
        }

        const constraints = componentDefinition.constraints ?? { authorization: { allowRoles: [] }, allowModes: [] };
        constraints.allowModes = Array.isArray(constraints.allowModes) ? constraints.allowModes : [];
        if (!constraints.allowModes.includes(formMode)) {
            constraints.allowModes.push(formMode);
        }
        componentDefinition.constraints = constraints;

        const nested = componentDefinition?.component?.config;
        if (!nested || typeof nested !== "object") {
            return;
        }

        (nested.componentDefinitions ?? []).forEach((child: any) => this.forceAllowModeForTransformedTree(child, formMode));
        (nested.tabs ?? []).forEach((child: any) => this.forceAllowModeForTransformedTree(child, formMode));
        (nested.panels ?? []).forEach((child: any) => this.forceAllowModeForTransformedTree(child, formMode));
        if (nested.elementTemplate) {
            this.forceAllowModeForTransformedTree(nested.elementTemplate, formMode);
        }
    }

    private commonContentComponent(
        source: AllFormComponentDefinitionOutlines,
        formMode: FormModesConfig
    ): ContentFormComponentDefinitionOutline {
        const frame: ContentFormComponentDefinitionFrame = {
            name: source.name,
            component: {
                class: "ContentComponent",
                config: {}
            },
            module: source.module,
            expressions: source.expressions,
            constraints: source.constraints,
            overrides: source.overrides,
        };
        // Set the optional properties only if the source has them.
        if (source.layout) {
            frame.layout = source.layout;
        }

        const target = this.propertiesHelper.sharedConstructFormComponent(frame);
        if (!isTypeFormComponentDefinitionName<ContentFormComponentDefinitionOutline>(target, ContentComponentName)) {
            throw new Error(`Could not create class for form component class name 'ContentComponent': ${JSON.stringify(target)}.`);
        }

        target.component.config = new ContentFieldComponentConfig();

        // TODO: does it make sense to copy all shared properties? The css classes might need to be different?
        this.propertiesHelper.sharedPopulateFieldComponentConfig(target.component.config, source.component.config);
        if (target.layout) {
            target.layout.config = target.layout.config ?? {};
            this.propertiesHelper.sharedPopulateFieldLayoutConfig(target.layout.config, source.layout?.config);
        }

        return target;
    }

    private commonContentOptionList(
        target: ContentFormComponentDefinitionOutline,
        values: string[],
        options?: { label: string, value: string }[]
    ): void {
        if (!target.component.config) {
            return;
        }
        const targetCompConf = target.component.config;

        if (values.length === 0) {
            // Empty
            targetCompConf.content = undefined;
            targetCompConf.template = `<span></span>`;
        } else if (values.length === 1) {
            // One value
            const value = values[0];
            const label = options?.find(option => option.value === value)?.label ?? value;
            targetCompConf.content = {value, label};
            targetCompConf.template = `<span data-value="{{content.value}}">{{content.label}}</span>`;
        } else {
            // More than one value
            targetCompConf.content = values.map(value => options?.find(option => option.value === value) ?? {
                label: value,
                value: value
            });
            targetCompConf.template = `<ul>{{#each content}}<li data-value="{{this.value}}">{{this.label}}</li>{{/each}}</ul>`;
        }
    }

    private commonContentPlain(
        source: AllFormComponentDefinitionOutlines,
        target: ContentFormComponentDefinitionOutline
    ): void {
        if (
            target.component.config !== undefined
            && source.model?.config?.value !== undefined
        ) {
            target.component.config.content = source.model.config.value;
            target.component.config.template = `<span>{{content}}</span>`
        }
    }

}
