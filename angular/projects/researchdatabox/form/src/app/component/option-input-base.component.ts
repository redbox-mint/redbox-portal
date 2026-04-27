import { FormFieldBaseComponent } from '@researchdatabox/portal-ng-common';
import { FieldDefinitionFrame, isTypeFieldDefinitionName } from '@researchdatabox/sails-ng-common';

type OptionInputConfig<TOption extends { value: string; disabled?: boolean }> = {
    options?: TOption[];
    tooltip?: string;
};

export abstract class OptionInputBaseComponent<
    TValue,
    TOption extends { value: string; disabled?: boolean },
    TConfig extends OptionInputConfig<TOption> | undefined,
    TFieldComponent extends FieldDefinitionFrame & { config?: TConfig }
> extends FormFieldBaseComponent<TValue> {
    public tooltip: string = '';
    public options: TOption[] = [];

    protected getOptionInputConfig(expectedComponentName: string): TConfig | undefined {
        const formComponentFrame = this.componentDefinition;
        if (!isTypeFieldDefinitionName<TFieldComponent>(formComponentFrame, expectedComponentName)) {
            throw new Error(`${this.logName}: Expected ${expectedComponentName} but got ${JSON.stringify(formComponentFrame)}`);
        }
        return formComponentFrame.config;
    }

    protected setSharedOptionConfig(config: OptionInputConfig<TOption> | undefined): void {
        this.options = config?.options ?? [];
        this.tooltip = config?.tooltip ?? '';
    }

    protected setControlValue(value: TValue): void {
        this.formControl.setValue(value);
        this.formControl.markAsDirty();
        this.formControl.markAsTouched();
    }

    public isOptionDisabled(option: TOption): boolean {
        return option.disabled === true;
    }

    public getOptionId(opt: TOption): string {
        return `${this.name}-${opt.value}`;
    }

    public getOptionName(index: number): string {
        return this.name ?? index?.toString();
    }
}