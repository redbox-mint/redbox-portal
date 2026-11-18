import { FormPathHelper, type FormComponentDefinitionOutline, type FormConfigFrame, type ProfileField, type GenerationProfileOutput } from '@researchdatabox/sails-ng-common';

type FieldNode = { name?: string; component?: { class?: string; config?: Record<string, unknown> }; layout?: { config?: Record<string, unknown> }; validators?: { maxLength?: { value?: number } } };

/** Use the same metadata lineage as GenerationSchemaService; display only form labels. */
export function profileFormFields(form: FormConfigFrame, translate: (text: string) => string): ProfileField[] {
  const fields: ProfileField[] = [];
  const visit = (items: unknown[], parents: string[], group: string, blocked = false) => {
    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as FieldNode;
      const config = item.component?.config ?? {};
      const layout = item.layout?.config ?? {};
      const tokens = [...parents, ...FormPathHelper.metadataTokensForComponent(raw as FormComponentDefinitionOutline)];
      const rawLabel = String(layout.label ?? config.label ?? 'ai-profiles-unnamed-field');
      const translated = translate(rawLabel);
      const label = (translated === rawLabel && /^@|^[a-z]+(?:-[a-z0-9]+){2,}$/i.test(rawLabel)
        ? String(item.name ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').replace(/^./, (c: string) => c.toUpperCase())
        : translated).replace(/<[^>]*>/g, '').trim() || translate('ai-profiles-unnamed-field');
      const component = String(item.component?.class ?? '');
      const disabled = blocked || config.disabled === true || config.readonly === true || config.editMode === false;
      const options = Array.isArray(config.options) ? config.options.flatMap((option: unknown) => {
        if (!option || typeof option !== 'object') return [];
        const value: unknown = Reflect.get(option, 'value');
        return typeof value === 'string' ? [{ value, label: translate(String(Reflect.get(option, 'label') ?? value)) }] : [];
      }) : [];
      let output: GenerationProfileOutput | undefined;
      const maxLength = config.maxLength ?? item.validators?.maxLength?.value;
      if (['SimpleInputComponent', 'TextAreaComponent', 'RichTextEditorComponent'].includes(component)) output = { kind: component === 'RichTextEditorComponent' ? 'richText' : 'string', ...(typeof maxLength === 'number' && Number.isInteger(maxLength) ? { maxLength } : {}) };
      else if (component === 'DateInputComponent') output = { kind: 'date' };
      else if (component === 'CheckboxInputComponent' && !options.length) output = { kind: 'boolean' };
      else if (['RadioInputComponent', 'DropdownInputComponent', 'CheckboxInputComponent', 'TypeaheadInputComponent'].includes(component) && options.length) {
        output = component === 'CheckboxInputComponent' || config.multipleValues === true || config.multiple === true
          ? { kind: 'enumArray', values: options.map((o) => o.value), maxItems: options.length }
          : { kind: 'enum', values: options.map((o) => o.value) };
      }
      const children = ['componentDefinitions', 'tabs', 'panels'].flatMap(key => Array.isArray(config[key]) ? config[key] : []);
      if (tokens.length && component && !children.length && !/button|heading|spacer|static|container/i.test(component)) {
        fields.push({ pointer: '/' + tokens.map(t => t.replaceAll('~', '~0').replaceAll('/', '~1')).join('/'), label, group,
          component, ...(!disabled && output ? { output } : {}), ...(options.length ? { options } : {}),
          ...(config.personal === true || config.personalInformation === true ? { personal: true } : {}), ...(config.sensitive === true ? { sensitive: true } : {}) });
      }
      if (children.length) visit(children, tokens, layout.label ? label : group, disabled);
    }
  };
  visit(form.componentDefinitions ?? [], [], translate('ai-profiles-source-other-fields'));
  return fields;
}
