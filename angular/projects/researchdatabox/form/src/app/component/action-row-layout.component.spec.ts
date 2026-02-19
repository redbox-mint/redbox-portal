import { TestBed } from '@angular/core/testing';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { ActionRowLayoutComponent } from './action-row-layout.component';
import { GroupFieldComponent } from './group.component';
import { SimpleInputComponent } from './simple-input.component';

describe('ActionRowLayoutComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        ActionRowLayoutComponent,
        GroupFieldComponent,
        SimpleInputComponent,
      },
    });
  });

  it('should create component', () => {
    const fixture = TestBed.createComponent(ActionRowLayoutComponent);
    const component = fixture.componentInstance;
    expect(component).toBeDefined();
  });

  it('should render action-row layout contract around group content', async () => {
    const formConfig: FormConfigFrame = {
      name: 'action-row-layout-test',
      componentDefinitions: [
        {
          name: 'action_group',
          component: {
            class: 'GroupComponent',
            config: {
              componentDefinitions: [
                {
                  name: 'action_a',
                  component: {
                    class: 'SimpleInputComponent',
                  },
                  model: {
                    class: 'SimpleInputModel',
                    config: {
                      value: 'A',
                    },
                  },
                },
                {
                  name: 'action_b',
                  component: {
                    class: 'SimpleInputComponent',
                  },
                  model: {
                    class: 'SimpleInputModel',
                    config: {
                      value: 'B',
                    },
                  },
                },
              ],
            },
          },
          model: {
            class: 'GroupModel',
            config: {
              value: {},
            },
          },
          layout: {
            class: 'ActionRowLayout',
            config: {
              containerCssClass: 'rb-form-action-row action-row-custom',
              alignment: 'space-between',
              wrap: false,
              slotCssClass: 'action-slot-custom',
            },
          },
        },
      ],
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;

    const rowContainer = compiled.querySelector('.action-row-custom') as HTMLElement;
    expect(rowContainer).toBeTruthy();
    expect(rowContainer.style.justifyContent).toBe('space-between');
    expect(rowContainer.style.flexWrap).toBe('nowrap');
    expect(compiled.querySelector('.rb-form-action-row .rb-form-group')).toBeTruthy();
    expect(compiled.querySelectorAll('.action-slot-custom').length).toBe(2);
    expect(compiled.querySelector('.rb-form-action-group')).toBeFalsy();
  });
});
