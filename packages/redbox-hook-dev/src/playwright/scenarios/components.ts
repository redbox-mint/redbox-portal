import type { FormConfigFrame, RecordSelectorFormComponentDefinitionFrame } from '@researchdatabox/sails-ng-common';
import { scenarioForm, textField } from '../fields';
import type { ScenarioNames } from '../types';

export function integrationComponentForm(names: ScenarioNames, id: string): FormConfigFrame {
  const fields: FormConfigFrame['componentDefinitions'] = [textField('title', 'Title', 'Integration components')];
  if (id === 'components-vocabulary') {
    fields.push(
      { name: 'term', layout: { class: 'DefaultLayout', config: { label: 'Vocabulary term' } }, component: { class: 'TypeaheadInputComponent', config: { sourceType: 'static', minChars: 2, debounceMs: 150, requireSelection: true, valueMode: 'optionObject', staticOptions: [
        { label: 'Coastal ecology', value: 'term-coast' }, { label: 'Forest ecology', value: 'term-forest' },
      ] } }, model: { class: 'TypeaheadInputModel' } },
      { name: 'subjects', component: { class: 'CheckboxTreeComponent', config: { leafOnly: true, treeData: [
        { id: 'science', value: 'science', label: 'Science', children: [
          { id: 'ecology', value: 'ecology', label: 'Ecology', children: [
            { id: 'coast', value: 'coast', notation: '101', label: 'Coastal systems' },
            { id: 'forest', value: 'forest', notation: '102', label: 'Forest systems' },
          ] },
        ] },
      ] } }, model: { class: 'CheckboxTreeModel', config: { defaultValue: [] } } },
    );
  } else if (id === 'components-record-relations') {
    const selector: RecordSelectorFormComponentDefinitionFrame = { name: '', component: { class: 'RecordSelectorComponent', config: { columnTitle: 'Related records', recordType: 'e2e-initialisation-modes', filterMode: 'default' } }, model: { class: 'RecordSelectorModel' } };
    fields.push({ ...selector, name: 'reference' },
      { name: 'related', component: { class: 'RepeatableComponent', config: { allowZeroRows: true, elementTemplate: { ...selector, layout: { class: 'RepeatableElementLayout', config: { label: 'Related object' } } } } }, model: { class: 'RepeatableModel', config: { defaultValue: [] } } },
      { name: 'relatedDetails', component: { class: 'RelatedObjectDataComponent', config: { dataPath: 'related', oidProperty: 'oid', relatedFields: ['translated'], template: '{{#each relatedObjects}}<p>{{title}}: {{fields.translated}}</p>{{/each}}' } } },
    );
  } else if (id === 'components-rich-text') {
    fields.push({ name: 'description', component: { class: 'RichTextEditorComponent', config: { toolbar: ['bold', 'italic', 'bulletList', 'undo', 'redo'] } }, model: { class: 'RichTextEditorModel', config: { defaultValue: '' } } });
  } else if (id === 'components-map') {
    fields.push({ name: 'geometry', component: { class: 'MapComponent', config: {
      center: [-34.9, 138.6], zoom: 8, enabledModes: ['point', 'polygon', 'select'], enableImport: true,
      tileLayers: [{ name: 'Local tiles', url: `${process.env.PLAYWRIGHT_BROWSER_STUB_URL ?? 'http://playwright-stubs:8787'}/tiles/{z}/{x}/{y}.png` }],
    } }, model: { class: 'MapModel', config: { defaultValue: { type: 'FeatureCollection', features: [] } } } });
    fields.push({ name: 'geometrySummary', component: { class: 'ContentComponent', config: { content: '', template: '<ul aria-label="Captured geometry">{{#each formData.geometry.features}}<li>{{geometry.type}}: {{geometry.coordinates}}</li>{{/each}}</ul>' } } });
  } else {
    fields.push({ name: 'files', component: { class: 'FileUploadComponent', config: { enabledSources: [], allowUploadWithoutSave: false } }, model: { class: 'FileUploadModel', config: { defaultValue: [] } } });
  }
  const form = scenarioForm(names, fields);
  if (id === 'components-files') form.attachmentFields = ['files'];
  return form;
}
