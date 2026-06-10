import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { SimpleInputComponent } from './simple-input.component';
import { GroupFieldComponent } from './group.component';
import { EditTableComponent } from './edit-table.component';
import { createFormAndWaitForReady, createTestbedModule } from "../helpers.spec";
import { TestBed, ComponentFixture } from "@angular/core/testing";

function editTableFormConfig(overrides?: {
  componentConfig?: Record<string, unknown>,
  modelConfig?: Record<string, unknown>,
}): FormConfigFrame {
  return {
    name: 'testing_edit_table',
    componentDefinitions: [
      {
        name: 'contributors',
        model: {
          class: 'EditTableModel',
          config: {
            value: [
              { name: 'Ada', contact: { email: 'ada@example.com' } },
              { name: 'Grace', contact: { email: 'grace@example.com' } },
            ],
            ...(overrides?.modelConfig ?? {}),
          }
        },
        component: {
          class: 'EditTableComponent',
          config: {
            label: 'Contributors',
            columns: [
              { label: 'Name', path: 'name' },
              { label: 'Email', path: 'contact.email' },
            ],
            componentDefinitions: [
              {
                name: 'name',
                model: {
                  class: 'SimpleInputModel',
                  config: {
                    validators: [{ class: 'required' }],
                  }
                },
                component: { class: 'SimpleInputComponent' }
              },
              {
                name: 'contact',
                model: {
                  class: 'GroupModel',
                  config: { value: {} }
                },
                component: {
                  class: 'GroupComponent',
                  config: {
                    componentDefinitions: [
                      {
                        name: 'email',
                        model: { class: 'SimpleInputModel', config: {} },
                        component: { class: 'SimpleInputComponent' }
                      }
                    ]
                  }
                }
              },
            ],
            ...(overrides?.componentConfig ?? {}),
          }
        }
      }
    ]
  };
}

function queryAll(fixture: ComponentFixture<unknown>, selector: string): HTMLElement[] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll(selector));
}

function query(fixture: ComponentFixture<unknown>, selector: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(selector);
}

async function openAddDialog(fixture: ComponentFixture<unknown>) {
  const addButton = query(fixture, '.rb-edit-table__add') as HTMLButtonElement;
  expect(addButton).toBeTruthy();
  addButton.click();
  await fixture.whenStable();
}

async function setDialogInputValue(fixture: ComponentFixture<unknown>, index: number, value: string) {
  const inputs = queryAll(fixture, '.modal-body input[type="text"]') as unknown as HTMLInputElement[];
  expect(inputs.length).toBeGreaterThan(index);
  inputs[index].value = value;
  inputs[index].dispatchEvent(new Event('input'));
  await fixture.whenStable();
}

describe('EditTableComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        "SimpleInputComponent": SimpleInputComponent,
        "GroupFieldComponent": GroupFieldComponent,
        "EditTableComponent": EditTableComponent,
      }
    });
  });

  it('should create component', () => {
    const fixture = TestBed.createComponent(EditTableComponent);
    expect(fixture.componentInstance).toBeDefined();
  });

  it('should render rows with configured columns, including dot-path cells', async () => {
    const { fixture } = await createFormAndWaitForReady(editTableFormConfig());

    const headers = queryAll(fixture, '.rb-edit-table thead th').map(th => th.textContent?.trim());
    expect(headers).toContain('Name');
    expect(headers).toContain('Email');

    const bodyRows = queryAll(fixture, '.rb-edit-table tbody tr');
    expect(bodyRows.length).toBe(2);
    const firstRowCells = Array.from(bodyRows[0].querySelectorAll('td')).map(td => td.textContent?.trim());
    expect(firstRowCells).toContain('Ada');
    expect(firstRowCells).toContain('ada@example.com');
  });

  it('should hide add/edit/delete actions when not in edit mode', async () => {
    const { fixture } = await createFormAndWaitForReady(editTableFormConfig(), { editMode: false } as any);

    expect(query(fixture, '.rb-edit-table__add')).toBeNull();
    expect(query(fixture, '.rb-edit-table__edit')).toBeNull();
    expect(query(fixture, '.rb-edit-table__delete')).toBeNull();
  });

  it('should show the empty message when there are no rows', async () => {
    const { fixture } = await createFormAndWaitForReady(
      editTableFormConfig({ modelConfig: { value: [] } }), { editMode: true } as any);

    expect(query(fixture, '.rb-edit-table__empty')).toBeTruthy();
  });

  it('should add a valid row through the dialog and update the form value', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(editTableFormConfig(), { editMode: true } as any);

    await openAddDialog(fixture);
    expect(query(fixture, '.modal-content')).toBeTruthy();

    // The save button is disabled while the required 'name' field is empty.
    const saveButton = query(fixture, '.rb-edit-table__dialog-save') as HTMLButtonElement;
    expect(saveButton.disabled).toBeTrue();

    await setDialogInputValue(fixture, 0, 'Hedy');
    await setDialogInputValue(fixture, 1, 'hedy@example.com');
    expect(saveButton.disabled).toBeFalse();

    saveButton.click();
    await fixture.whenStable();

    // The dialog is closed and the row is appended.
    expect(query(fixture, '.modal-content')).toBeNull();
    const value = formComponent.form?.getRawValue()['contributors'];
    expect(value.length).toBe(3);
    expect(value[2]).toEqual({ name: 'Hedy', contact: { email: 'hedy@example.com' } });
    expect(formComponent.form?.get('contributors')?.dirty).toBeTrue();
  });

  it('should pre-populate the dialog on edit and replace the row on save', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(editTableFormConfig(), { editMode: true } as any);

    const editButtons = queryAll(fixture, '.rb-edit-table__edit') as unknown as HTMLButtonElement[];
    editButtons[1].click();
    await fixture.whenStable();

    const inputs = queryAll(fixture, '.modal-body input[type="text"]') as unknown as HTMLInputElement[];
    expect(inputs[0].value).toBe('Grace');
    expect(inputs[1].value).toBe('grace@example.com');

    await setDialogInputValue(fixture, 0, 'Grace Hopper');
    (query(fixture, '.rb-edit-table__dialog-save') as HTMLButtonElement).click();
    await fixture.whenStable();

    const value = formComponent.form?.getRawValue()['contributors'];
    expect(value.length).toBe(2);
    expect(value[1]).toEqual({ name: 'Grace Hopper', contact: { email: 'grace@example.com' } });
  });

  it('should discard dialog edits on cancel', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(editTableFormConfig(), { editMode: true } as any);

    const editButtons = queryAll(fixture, '.rb-edit-table__edit') as unknown as HTMLButtonElement[];
    editButtons[0].click();
    await fixture.whenStable();

    await setDialogInputValue(fixture, 0, 'Changed Name');
    (query(fixture, '.rb-edit-table__dialog-cancel') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(query(fixture, '.modal-content')).toBeNull();
    const value = formComponent.form?.getRawValue()['contributors'];
    expect(value[0]).toEqual({ name: 'Ada', contact: { email: 'ada@example.com' } });
    expect(formComponent.form?.get('contributors')?.dirty).toBeFalse();
  });

  it('should close the dialog without changes on escape', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(editTableFormConfig(), { editMode: true } as any);

    await openAddDialog(fixture);
    const modal = query(fixture, '.modal.fade.show') as HTMLElement;
    expect(modal).toBeTruthy();

    modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(query(fixture, '.modal-content')).toBeNull();
    const value = formComponent.form?.getRawValue()['contributors'];
    expect(value.length).toBe(2);
  });

  it('should delete a row', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(editTableFormConfig(), { editMode: true } as any);

    const deleteButtons = queryAll(fixture, '.rb-edit-table__delete') as unknown as HTMLButtonElement[];
    deleteButtons[0].click();
    await fixture.whenStable();

    const value = formComponent.form?.getRawValue()['contributors'];
    expect(value.length).toBe(1);
    expect(value[0]).toEqual({ name: 'Grace', contact: { email: 'grace@example.com' } });
    expect(formComponent.form?.get('contributors')?.dirty).toBeTrue();
  });

  it('should hide the add button when maxRows is reached', async () => {
    const { fixture } = await createFormAndWaitForReady(
      editTableFormConfig({ componentConfig: { maxRows: 2 } }), { editMode: true } as any);

    expect(query(fixture, '.rb-edit-table__add')).toBeNull();
    // Edit and delete remain available.
    expect(queryAll(fixture, '.rb-edit-table__edit').length).toBe(2);
  });
});
