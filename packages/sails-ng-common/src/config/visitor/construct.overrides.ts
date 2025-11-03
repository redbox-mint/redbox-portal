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
     * Also specifies the 'default' transforms that will be done without needing to be specified.
     * The defaults can be overridden by specifying the transform in overrides.formModeClasses.
     * @private
     */
    private knownTransforms: KnownTransformsType = {
        [SimpleInputComponentName]: {
            [SimpleInputComponentName]: this.sourceSimpleInputComponentTargetSimpleInputComponent,
            [ContentComponentName]: this.sourceSimpleInputComponentTargetContentComponent,
        },
        [ContentComponentName]: {
            [ContentComponentName]: this.sourceContentComponentTargetContentComponent,
            [SimpleInputComponentName]: this.sourceContentComponentTargetSimpleInputComponent,
        }
    };

    private defaultTransforms: DefaultTransformsType = {
        [SimpleInputComponentName]: {
            "view": {
                component: ContentComponentName,
            }
        }
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

    public sourceSimpleInputComponentTargetSimpleInputComponent(
        source: SimpleInputFormComponentDefinitionFrame,
        formMode: FormModesConfig
    ): SimpleInputFormComponentDefinitionFrame {
        return source;
    }

    public sourceSimpleInputComponentTargetContentComponent(
        source: SimpleInputFormComponentDefinitionFrame,
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

        if (source.component.config) {
            // TODO: does it make sense to copy all shared properties? The css classes might need to be different?
            this.sharedProps.sharedPopulateFieldComponentConfig(source.component.config, target.component.config);
        }

        // The SimpleInputComponent has a model.
        // The ContentComponent has no model.
        // Use the source model to construct the target 'content' property.
        if (source.model?.config?.value !== undefined && target.component.config) {
            target.component.config.content = source.model.config.value;
        }

        // TODO: The default values don't usually make sense to apply to the ContentComponent:
        //   Do we want to be able to show a form, with the default values, where the values can't be edited? Unlikely, but possible?
        //   Don't set the default value as the content for now.

        // Set the layout only if the source has a layout.
        if (source.layout) {
            target.layout = source.layout;
        }

        return target;
    }

    public sourceContentComponentTargetContentComponent(
        source: ContentFormComponentDefinitionFrame,
        formMode: FormModesConfig
    ): ContentFormComponentDefinitionFrame {
        return source;
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

        // Set the model value from the ContentComponent's component.config.content.
        // TODO: What to do about the ContentComponent's 'template'?
        //   Does it need to be rendered and used as the model value?
        if (source.component.config?.content !== undefined && target.model?.config) {
            target.model.config.value = source.component.config.content;
        }

        return target;
    }
}