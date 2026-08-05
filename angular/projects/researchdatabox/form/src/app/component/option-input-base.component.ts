import { FormFieldBaseComponent } from '@researchdatabox/portal-ng-common';
import { FieldDefinitionFrame, isTypeFieldDefinitionName } from '@researchdatabox/sails-ng-common';
import { get as _get } from 'lodash-es';

type OptionInputConfig<TOption extends { value: string; disabled?: boolean }> = {
    options?: TOption[];
    tooltip?: string;
    placeholder?: string;
};

export abstract class OptionInputBaseComponent<
    TValue,
    TOption extends { value: string; disabled?: boolean },
    TConfig extends OptionInputConfig<TOption> | undefined,
    TFieldComponent extends FieldDefinitionFrame & { config?: TConfig }
> extends FormFieldBaseComponent<TValue> {
    /**
     * The config is the single source of truth for these properties, so that changes
     * applied via `setProperty` (e.g. from a form expression) are picked up by the
     * template without each component having to keep a copy in sync.
     */
    public get options(): TOption[] {
        const configOptions: unknown = _get(this.componentDefinition?.config, 'options');
        return Array.isArray(configOptions) ? configOptions as TOption[] : [];
    }

    public set options(value: TOption[]) {
        this.setProperty('options', value);
    }

    public get tooltip(): string {
        return this.getStringProperty('tooltip');
    }

    public set tooltip(value: string) {
        this.setProperty('tooltip', value);
    }

    public get placeholder(): string {
        return this.getStringProperty('placeholder');
    }

    public set placeholder(value: string) {
        this.setProperty('placeholder', value);
    }

    protected getOptionInputConfig(expectedComponentName: string): TConfig | undefined {
        const formComponentFrame = this.componentDefinition;
        if (!isTypeFieldDefinitionName<TFieldComponent>(formComponentFrame, expectedComponentName)) {
            throw new Error(`${this.logName}: Expected ${expectedComponentName} but got ${JSON.stringify(formComponentFrame)}`);
        }
        return formComponentFrame.config;
    }

    protected setControlValue(value: TValue): void {
        if (!this.formControl || this.isDisabled || this.isReadonly) {
            return;
        }
        this.formControl.setValue(value);
        this.formControl.markAsDirty();
        this.formControl.markAsTouched();
    }

    public isOptionDisabled(option: TOption): boolean {
        return this.isDisabled || this.isReadonly || option.disabled === true;
    }

    public getOptionId(opt: TOption): string {
        return `${this.name}-${opt.value}`;
    }

    public getOptionName(index: number): string {
        return this.name ?? index?.toString();
    }
}
