let expect: Chai.ExpectStatic;
import { cloneDeep, get } from 'lodash';
import {
  FormConfigFrame,
  FormModesConfig,
  QuestionTreeFieldComponentConfigFrame,
  QuestionTreeFormComponentDefinitionFrame,
  QuestionTreeFormComponentDefinitionOutline,
  QuestionTreeOutcomeInfoKey,
} from '@researchdatabox/sails-ng-common';
import { ConstructFormConfigVisitor } from '../../src/visitor/construct.visitor';
import { logger } from './helpers';

describe('Construct Visitor question tree optional config', () => {
  before(async () => {
    ({ expect } = await import('chai'));
  });
  const locations = ['root', 'tab', 'accordion'] as const;
  const modes: FormModesConfig[] = ['edit', 'view'];

  function makeForm(location: (typeof locations)[number], emptyConfig: boolean): FormConfigFrame {
    const tree: QuestionTreeFormComponentDefinitionFrame = {
      name: 'tree',
      component: { class: 'QuestionTreeComponent' },
    };
    if (emptyConfig) {
      // Exercise the minimal JSON config before the visitor supplies the required defaults.
      tree.component.config = {} as QuestionTreeFieldComponentConfigFrame;
    }
    if (location === 'root') {
      return { name: 'form', componentDefinitions: [tree] };
    }
    if (location === 'tab') {
      return {
        name: 'form',
        componentDefinitions: [
          {
            name: 'sections',
            component: {
              class: 'TabComponent',
              config: {
                tabs: [
                  {
                    name: 'section',
                    component: { class: 'TabContentComponent', config: { componentDefinitions: [tree] } },
                    layout: { class: 'TabContentLayout', config: { buttonLabel: 'Section' } },
                  },
                ],
              },
            },
            layout: { class: 'TabLayout' },
          },
        ],
      };
    }
    return {
      name: 'form',
      componentDefinitions: [
        {
          name: 'sections',
          component: {
            class: 'AccordionComponent',
            config: {
              panels: [
                {
                  name: 'section',
                  component: { class: 'AccordionPanelComponent', config: { componentDefinitions: [tree] } },
                  layout: { class: 'AccordionPanelLayout', config: { buttonLabel: 'Section' } },
                },
              ],
            },
          },
          layout: { class: 'AccordionLayout' },
        },
      ],
    };
  }

  for (const location of locations) {
    for (const formMode of modes) {
      it(`treats omitted config like empty config at ${location} in ${formMode} mode without changing input`, async () => {
        const omitted = makeForm(location, false);
        const empty = makeForm(location, true);
        const originalOmitted = cloneDeep(omitted);
        const originalEmpty = cloneDeep(empty);
        const visitor = new ConstructFormConfigVisitor(logger);
        const expected = await visitor.start({ data: empty, formMode });
        const actual = await visitor.start({ data: omitted, formMode });

        expect(actual).to.deep.equal(expected);
        const treePath =
          location === 'root'
            ? 'componentDefinitions[0]'
            : `componentDefinitions[0].component.config.${location === 'tab' && formMode === 'edit' ? 'tabs' : 'panels'}[0].component.config.componentDefinitions[0]`;
        const tree: QuestionTreeFormComponentDefinitionOutline = get(actual, treePath);
        expect(tree).to.have.nested.property('component.class', 'QuestionTreeComponent');
        expect(tree).to.have.nested.property('model.class', 'QuestionTreeModel');
        const config = tree.component.config;
        if (!config) {
          throw new Error('Expected constructed question tree config');
        }
        expect(config.questions).to.deep.equal([]);
        expect(config.availableOutcomes).to.deep.equal([]);
        const children = config.componentDefinitions;
        expect(children).to.have.length(1);
        expect(children[0]).to.have.property('name', QuestionTreeOutcomeInfoKey);
        expect(children[0]).to.have.nested.property('component.class', 'SimpleInputComponent');
        expect(children[0]).to.have.nested.property('component.config.type', 'hidden');
        expect(children[0]).to.have.nested.property('component.config.visible', false);
        expect(children[0]).to.have.nested.property('layout.config.visible', false);
        expect(children[0]).to.have.nested.property('model.class', 'SimpleInputModel');

        // Reusing the same definition must not accumulate generated outcome controls.
        expect(await visitor.start({ data: omitted, formMode })).to.deep.equal(actual);
        expect(omitted).to.deep.equal(originalOmitted);
        expect(empty).to.deep.equal(originalEmpty);
      });
    }
  }
});
