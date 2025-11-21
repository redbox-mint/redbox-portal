import {cloneDeep as _cloneDeep} from 'lodash';
import {
    SimpleInputComponentName,
    SimpleInputFormComponentDefinitionFrame,
} from "../component/simple-input.outline";
import {ContentComponentName, ContentFormComponentDefinitionFrame} from "../component/content.outline";
import {FormModesConfig} from "../shared.outline";
import {AllFormComponentDefinitionFrames} from "../dictionary.outline";
import {ReusableComponentName} from "../component/reusable.outline";
import {PopulateProperties} from "./base.model";
import {ComponentClassNamesType} from "../dictionary.model";
import {FormOverrideModesClassConfigFrame} from "../form-component.outline";
import {TextAreaComponentName, TextAreaFormComponentDefinitionFrame} from "../component/text-area.outline";
import {DropdownInputComponentName} from "../component/dropdown-input.outline";
import {
    CheckboxInputComponentName,
    CheckboxInputFormComponentDefinitionFrame
} from "../component/checkbox-input.outline";
import {RadioInputComponentName, RadioInputFormComponentDefinitionFrame} from "../component/radio-input.outline";
import {DateInputComponentName, DateInputFormComponentDefinitionFrame} from "../component/date-input.outline";

/**
 * The type that specifies the known transformations.
 */
export type KnownTransformsType = Partial<{
    /**
     * The source component class name.
     */
    [key in ComponentClassNamesType]: Partial<{
        /**
         * The target component class name.
         * TODO: fix types
         */
        [key in ComponentClassNamesType]: (source: any, formMode: FormModesConfig) => AllFormComponentDefinitionFrames
    }>
}>;

export type DefaultTransformsType = Partial<{
    /**
     * The source component class name.
     */
    [key in ComponentClassNamesType]: FormOverrideModesClassConfigFrame
}>;

export class ConstructOverrides {
    protected sharedProps: PopulateProperties;

    /**
     * Defines the known transforms between two form components.
     * @private
     */
    private knownTransforms: KnownTransformsType = {
        [SimpleInputComponentName]: {
            [ContentComponentName]: this.sourceSimpleInputComponentTargetContentComponent,
        },
        [ContentComponentName]: {
            [SimpleInputComponentName]: this.sourceContentComponentTargetSimpleInputComponent,
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
    }

    constructor() {
        this.sharedProps = new PopulateProperties();
    }

    public transform(source: AllFormComponentDefinitionFrames, formMode: FormModesConfig): AllFormComponentDefinitionFrames {
        const result = _cloneDeep(source);

        // Get the component class name, this is also used as the form component identifier.
        const componentClassName = result.component.class;

        // Do not transform ReusableComponents.
        if (componentClassName == ReusableComponentName) {
            return result;
        }

        // Get the provided transforms for the provided form mode.
        let transforms = result?.overrides?.formModeClasses?.[formMode] ?? {};

        // Apply any default transform for the provided form mode.
        if (componentClassName in this.defaultTransforms) {
            const defaultTransform = this.defaultTransforms[componentClassName] ?? {};
            if (formMode in defaultTransform) {
                const defaultTransformClasses = defaultTransform[formMode] ?? {};
                transforms = Object.assign({}, defaultTransformClasses, transforms);
            }
        }

        // Check that the transform is valid.
        if (!transforms.component && (transforms.model || transforms.layout)) {
            throw new Error("A transform must specify the component class when specifying other classes." +
                `Form component name '${source.name}' model class '${transforms.model}' layout class '${transforms.layout}'.`);
        }

        // Get the known transformations for the source form component definition.
        const sourceKnownTransforms = this.knownTransforms[componentClassName] ?? {};

        // Return the source unmodified if there are no transforms specified.
        if (!transforms?.component || Object.keys(transforms).length === 0) {
            return result;
        }

        // Return the source unmodified if the transformation is to the same component
        if (transforms?.component === componentClassName){
            return result;
        }

        // If a transform was provided, check that it is a known transform.
        if (!(transforms?.component in sourceKnownTransforms)) {
            throw new Error(`Invalid form config override config. ` +
                `The source component class '${componentClassName}' does ` +
                `not define a transform to target component class '${transforms?.component}'.`)
        }

        // Apply the transform.
        const sourceTargetTransform = sourceKnownTransforms[transforms?.component];
        if (!sourceTargetTransform) {
            throw new Error("The known form mode override component class transforms are invalid. " +
                "The function to execute for a target and source must be set.");
        }

        return sourceTargetTransform.call(this, result, formMode);
    }

    public sourceSimpleInputComponentTargetContentComponent(
        source: SimpleInputFormComponentDefinitionFrame,
        formMode: FormModesConfig
    ): ContentFormComponentDefinitionFrame {
        const target = this.commonTargetContentComponent(source, formMode);

        // Use the source model value to construct the target 'content' property.
        if (source.model?.config?.value !== undefined && target.component.config !== undefined) {
            target.component.config.content = source.model.config.value;
        }

        // TODO: The default values don't usually make sense to apply to the ContentComponent:
        //   Do we want to be able to show a form, with the default values, where the values can't be edited? Unlikely, but possible?
        //   Don't set the default value as the content for now.

        return target;
    }

    public sourceContentComponentTargetSimpleInputComponent(
        source: ContentFormComponentDefinitionFrame,
        formMode: FormModesConfig
    ): SimpleInputFormComponentDefinitionFrame {
        // Start with the properties that are simple to define.
        const target: SimpleInputFormComponentDefinitionFrame = {
            name: source.name,
            component: {
                class: "SimpleInputComponent",
                config: {}
            },
            model: {
                class: "SimpleInputModel",
                config: {},
            },
            module: source.module,
            expressions: source.expressions,
            constraints: source.constraints,
            overrides: source.overrides,
        };

        if (source.component.config) {
            this.sharedProps.sharedPopulateFieldComponentConfig(source.component.config, target.component.config);
        }

        // Set the layout only if the source has a layout.
        if (source.layout) {
            target.layout = source.layout;
        }

        // Set the model value from the ContentComponent's content or template.
        if (source.component.config?.content !== undefined && target.model?.config !== undefined) {
            target.model.config.value = source.component.config.content;
        } else if (source.component.config?.template !== undefined && target.model?.config !== undefined) {
            // TODO: What to do about the ContentComponent's 'template'?
            //   Does it need to be rendered and used as the model value?
            target.model.config.value = source.component.config.template;
        }

        return target;
    }

    private sourceTextAreaComponentTargetContentComponent(
        source: TextAreaFormComponentDefinitionFrame,
        formMode: FormModesConfig
    ): ContentFormComponentDefinitionFrame {
        const target = this.commonTargetContentComponent(source, formMode);

        // Use the source model value to construct the target 'content' property.
        if (source.model?.config?.value !== undefined && target.component.config !== undefined) {
            target.component.config.content = source.model.config.value;
        }

        return target;
    }

    private sourceDropdownInputComponentTargetContentComponent(
        source: TextAreaFormComponentDefinitionFrame,
        formMode: FormModesConfig
    ): ContentFormComponentDefinitionFrame {
        const target = this.commonTargetContentComponent(source, formMode);

        // Use the source model value to construct the target 'content' property.
        if (source.model?.config?.value !== undefined && target.component.config !== undefined) {
            target.component.config.content = source.model.config.value;
        }

        return target;
    }

    private sourceCheckboxInputComponentTargetContentComponent(
        source: CheckboxInputFormComponentDefinitionFrame,
        formMode: FormModesConfig
    ): ContentFormComponentDefinitionFrame {
        const target = this.commonTargetContentComponent(source, formMode);

        // Use the source model value to construct the target 'content' property.
        if (source.model?.config?.value !== undefined && target.component.config !== undefined) {
            // Checkbox value can be string, null, array. If string or array, get the labels.
            const values = source.model.config.value === null
                ? ["(no value)"]
                : Array.isArray(source.model.config.value) ? source.model.config.value : [source.model.config.value];
            const options = source.component.config?.options ?? [];
            const displayValues = values
                .map(value => {
                    const option = options.find(option => option.value === value);
                    return option ?? {label: value, value: value};
                });
            target.component.config.content = displayValues;
            target.component.config.template = `<ul>{{#each content}}<li data-value="{{this.value}}">{{this.label}}</li>{{/each}}</ul>`;
        }

        return target;
    }

    private sourceRadioInputComponentTargetContentComponent(
        source: RadioInputFormComponentDefinitionFrame,
        formMode: FormModesConfig
    ): ContentFormComponentDefinitionFrame {
        const target = this.commonTargetContentComponent(source, formMode);

        // Use the source model value to construct the target 'content' property.
        if (source.model?.config?.value !== undefined && target.component.config !== undefined) {
            // Radio value can be string, null, array. If string or array, get the labels.
            const values = source.model.config.value === null
                ? ["(no value)"]
                : Array.isArray(source.model.config.value) ? source.model.config.value : [source.model.config.value];
            const options = source.component.config?.options ?? [];
            const displayValues = values
                .map(value => {
                    const option = options.find(option => option.value === value);
                    return option ?? {label: value, value: value};
                });
            target.component.config.content = displayValues;
            target.component.config.template = `<ul>{{#each content}}<li data-value="{{this.value}}">{{this.label}}</li>{{/each}}</ul>`;
        }

        return target;
    }

    private sourceDateInputComponentTargetContentComponent(
        source: DateInputFormComponentDefinitionFrame,
        formMode: FormModesConfig
    ): ContentFormComponentDefinitionFrame {
        const target = this.commonTargetContentComponent(source, formMode);

        // Use the source model value to construct the target 'content' property.
        if (source.model?.config?.value !== undefined && target.component.config !== undefined) {
            // TODO: create a handlebars partial helper to render dates: https://handlebarsjs.com/guide/partials.html
            target.component.config.content = source.model.config.value?.toString() ?? "(no value)";
        }

        return target;
    }

    private commonTargetContentComponent(
        source: AllFormComponentDefinitionFrames,
        formMode: FormModesConfig
    ): ContentFormComponentDefinitionFrame {
        // Start with the properties that are simple to define.
        const target: ContentFormComponentDefinitionFrame = {
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

        // Set the layout only if the source has a layout.
        if (source.layout) {
            target.layout = source.layout;
        }

        if (source.component.config) {
            // TODO: does it make sense to copy all shared properties? The css classes might need to be different?
            this.sharedProps.sharedPopulateFieldComponentConfig(source.component.config, target.component.config);
        }

        return target;
    }
}
