import {cloneDeep as _cloneDeep} from 'lodash';
import {SimpleInputComponentName, SimpleInputFormComponentDefinitionFrame} from "../component/simple-input.outline";
import {ContentComponentName, ContentFormComponentDefinitionFrame} from "../component/content.outline";
import {FormComponentDefinitionFrame} from "../form-component.outline";
import {FormModesConfig} from "../shared.outline";
import {AllFormComponentDefinitionFrames} from "../dictionary.outline";
import {AvailableClassNamesType} from "../dictionary.model";
import {ReusableComponentName} from "../component/reusable.outline";

// TODO: use 'distributive' type to build proper type
//   e.g. type Test<U> = U extends any ? Partial<{... : never;
export type TransformMapType = Partial<{
    [key in AvailableClassNamesType]: Partial<{
        [key in AvailableClassNamesType]: any;
    }>
}>;

export class ConstructOverrides {

    private transformMap: TransformMapType = {
        [ContentComponentName]: {
            [SimpleInputComponentName]: this.sourceSimpleInputComponentTargetContentComponent
        },
        [SimpleInputComponentName]: {
            [ContentComponentName]: this.sourceContentComponentTargetSimpleInputComponent
        },
    }

    public transform(source: AllFormComponentDefinitionFrames, formMode: FormModesConfig): FormComponentDefinitionFrame {
        const result = _cloneDeep(source);
        const classes = result?.overrides?.formModeClasses?.[formMode];
        const map = this.transformMap;

        const componentOriginalClass = result?.component?.class;
        const componentNewClass = classes?.component;
        if (componentOriginalClass) {
            if (componentOriginalClass !== ReusableComponentName) {
                if (componentNewClass) {
                    if (componentOriginalClass in map) {
                        const originalMap = map[componentOriginalClass];
                        if (originalMap && componentNewClass in originalMap) {
                            result.component = originalMap[componentNewClass](result);
                        }
                    }
                }
            }
        }

        const modelOriginalClass = result?.model?.class;
        const modelNewClass = classes?.model;
        if (modelOriginalClass) {
            if (modelOriginalClass) {
                if (modelNewClass) {
                    if (modelOriginalClass in map) {
                        const originalMap = map[modelOriginalClass];
                        if (originalMap && modelNewClass in originalMap) {
                            result.model = originalMap[modelNewClass](result);
                        }
                    }
                }
            }
        }

        const layoutOriginalClass = result?.layout?.class;
        const layoutNewClass = classes?.layout;
        if (layoutOriginalClass) {
            if (layoutOriginalClass) {
                if (layoutNewClass) {
                    if (layoutOriginalClass in map) {
                        const originalMap = map[layoutOriginalClass];
                        if (originalMap && layoutNewClass in originalMap) {
                            result.layout = originalMap[layoutNewClass](result);
                        }
                    }
                }
            }
        }

        return result;
    }

    /**
     * Create a ContentComponent from the SimpleInputComponent.
     * @param source The existing SimpleInputComponent.
     */
    public sourceSimpleInputComponentTargetContentComponent(source: SimpleInputFormComponentDefinitionFrame): ContentFormComponentDefinitionFrame {
        // Start with the properties that are simple to define.
        const item: ContentFormComponentDefinitionFrame = {
            name: source.name,
            component: {
                class: "ContentComponent",
                config: { }
            },
            module: source.module,
            expressions: source.expressions,
            constraints: source.constraints,
        };

        // The SimpleInputComponent has a model.
        // The ContentComponent has no model.
        // Use the source model to construct the target 'content' property.
        // at this

        // Set the layout only if the source has a layout.
        if (source.layout) {
            item.layout = source.layout;
        }

        return item;
    }

    public sourceContentComponentTargetSimpleInputComponent(source: ContentFormComponentDefinitionFrame): SimpleInputFormComponentDefinitionFrame {
        // Start with the properties that are simple to define.
        const item: SimpleInputFormComponentDefinitionFrame = {
            name: source.name,
            component: {
                class: "SimpleInputComponent",
                config: { }
            },
            module: source.module,
            expressions: source.expressions,
            constraints: source.constraints,
        };
        return item;
    }


}