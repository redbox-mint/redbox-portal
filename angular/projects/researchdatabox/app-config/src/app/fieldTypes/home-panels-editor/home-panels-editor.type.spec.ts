import { ChangeDetectorRef } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { HomePanelsEditorTypeComponent } from './home-panels-editor.type';
import { HomePanel } from './home-panel.interface';

describe('HomePanelsEditorTypeComponent', () => {
  const setup = (panels: HomePanel[] = []) => {
    const cdr = { detectChanges: jasmine.createSpy('detectChanges') } as unknown as ChangeDetectorRef;
    const component = new HomePanelsEditorTypeComponent(cdr);
    Object.defineProperty(component, 'key', { value: 'panels' });
    Object.defineProperty(component, 'model', { value: { panels } });

    const panelsControl = new FormControl(panels);

    Object.defineProperty(component, 'formControl', { value: panelsControl });

    return { component };
  };

  it('initializes with an empty array when model is missing', () => {
    const cdr = { detectChanges: jasmine.createSpy('detectChanges') } as unknown as ChangeDetectorRef;
    const component = new HomePanelsEditorTypeComponent(cdr);
    Object.defineProperty(component, 'key', { value: 'panels' });
    Object.defineProperty(component, 'model', { value: {} });
    Object.defineProperty(component, 'formControl', { value: new FormControl(null) });

    component.ngOnInit();

    expect(component.formControl.value).toEqual([]);
  });

  it('adds, duplicates, and moves panels', () => {
    const { component } = setup([]);

    component.addPanel();
    expect(component.panels.length).toBe(1);

    component.duplicatePanel(0);
    expect(component.panels.length).toBe(2);
    expect(component.panels[1].id).toContain('-copy-');

    const firstId = component.panels[0].id;
    const secondId = component.panels[1].id;
    component.expandedPanels = new Set([0]);
    component.movePanel(0, 'down');
    expect(component.panels[0].id).toBe(secondId);
    expect(component.panels[1].id).toBe(firstId);
    expect(component.isPanelExpanded(1)).toBeTrue();
  });

  it('adds and removes panel items via the editor', () => {
    const { component } = setup([
      {
        id: 'panel-1',
        titleKey: 'panel-1',
        iconClass: 'fa fa-folder fa-3x',
        columnClass: 'col-md-3 homepanel',
        items: []
      }
    ]);

    component.openItemEditor(0);
    component.itemEditorState.item.labelKey = 'item-1';
    component.itemEditorState.item.href = '/item-1';
    component.saveItem();

    expect(component.panels[0].items.length).toBe(1);

    component.removeItem(0, 0);
    expect(component.panels[0].items.length).toBe(0);
  });

  it('toggles item roles and filters preview panels', () => {
    const { component } = setup([
      {
        id: 'panel-auth',
        titleKey: 'panel-auth',
        iconClass: 'fa fa-folder fa-3x',
        columnClass: 'col-md-3 homepanel',
        items: [
          { id: 'auth', labelKey: 'auth', href: '/auth', requiresAuth: true },
          { id: 'anon', labelKey: 'anon', href: '/anon', requiresAuth: false, hideWhenAuth: true }
        ]
      }
    ]);

    component.openItemEditor(0, 0);
    component.toggleItemRole('Admin');
    expect(component.hasItemRole('Admin')).toBeTrue();

    const authPanels = component.getAuthenticatedPanels();
    const anonPanels = component.getAnonymousPanels();

    expect(authPanels.length).toBe(1);
    expect(anonPanels.length).toBe(1);
    expect(authPanels[0].panel.items[0].id).toBe('auth');
    expect(anonPanels[0].panel.items[0].id).toBe('anon');
  });

  it('converts icon class size for preview', () => {
    const { component } = setup([]);

    expect(component.getIconPreviewClass('fa fa-rocket fa-3x')).toBe('fa fa-rocket fa-lg');
    expect(component.getIconPreviewClass('icon-checklist icon-3x')).toBe('icon-checklist icon-lg');
  });
});
