import { ChangeDetectorRef } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { MenuEditorTypeComponent } from './menu-editor.type';
import { MenuItem } from './menu-item.interface';

describe('MenuEditorTypeComponent', () => {
  const setup = (items: MenuItem[] = []) => {
    const cdr = { detectChanges: jasmine.createSpy('detectChanges') } as unknown as ChangeDetectorRef;
    const component = new MenuEditorTypeComponent(cdr);
    Object.defineProperty(component, 'key', { value: 'items' });
    Object.defineProperty(component, 'model', { value: { showSearch: true, items } });

    const itemsControl = new FormControl(items);
    new FormGroup({
      items: itemsControl,
      showSearch: new FormControl(true)
    });

    Object.defineProperty(component, 'formControl', { value: itemsControl });

    return { component };
  };

  it('initializes with an empty array when model is missing', () => {
    const cdr = { detectChanges: jasmine.createSpy('detectChanges') } as unknown as ChangeDetectorRef;
    const component = new MenuEditorTypeComponent(cdr);
    Object.defineProperty(component, 'key', { value: 'items' });
    Object.defineProperty(component, 'model', { value: {} });
    Object.defineProperty(component, 'formControl', { value: new FormControl(null) });

    component.ngOnInit();

    expect(component.formControl.value).toEqual([]);
  });

  it('updates showSearch in the parent control and model', () => {
    const { component } = setup([]);

    component.onShowSearchToggle(false);

    expect(component.formControl.parent?.get('showSearch')?.value).toBe(false);
    expect((component.model as any).showSearch).toBe(false);
  });

  it('adds and removes menu items while tracking expansion', () => {
    const { component } = setup([]);

    component.addItem();

    expect(component.items.length).toBe(1);
    expect(component.isExpanded(0)).toBeTrue();

    component.removeItem(0);

    expect(component.items.length).toBe(0);
  });

  it('duplicates items and preserves child identifiers', () => {
    const { component } = setup([
      {
        id: 'item-1',
        labelKey: 'menu-home',
        href: '/',
        requiresAuth: true,
        children: [
          { id: 'child-1', labelKey: 'child', href: '/child' }
        ]
      }
    ]);

    component.duplicateItem(0);

    expect(component.items.length).toBe(2);
    expect(component.items[1].id).toContain('item-1-copy-');
    expect(component.items[1].children?.[0].id).toBe('child-1-copy');
  });

  it('moves items and updates expanded state', () => {
    const { component } = setup([
      { id: 'first', labelKey: 'first', href: '/' },
      { id: 'second', labelKey: 'second', href: '/second' }
    ]);

    component.expandedItems = new Set([0]);
    component.moveItem(0, 'down');

    expect(component.items[0].id).toBe('second');
    expect(component.isExpanded(1)).toBeTrue();
  });

  it('manages roles and child items', () => {
    const { component } = setup([
      { id: 'parent', labelKey: 'parent', href: '/', requiresAuth: true, children: [] }
    ]);

    component.toggleRole(0, 'Admin');
    expect(component.hasRole(0, 'Admin')).toBeTrue();

    component.openChildEditor(0);
    component.childEditorState.item.labelKey = 'child';
    component.childEditorState.item.href = '/child';
    component.saveChildItem();

    expect(component.items[0].children?.length).toBe(1);

    component.removeChild(0, 0);
    expect(component.items[0].children?.length).toBe(0);
  });

  it('filters authenticated and anonymous items for preview', () => {
    const { component } = setup([
      { id: 'auth', labelKey: 'auth', href: '/', requiresAuth: true },
      { id: 'anon', labelKey: 'anon', href: '/home', requiresAuth: false, hideWhenAuth: true }
    ]);

    const authItems = component.getAuthenticatedItems();
    const anonItems = component.getAnonymousItems();

    expect(authItems.length).toBe(1);
    expect(anonItems.length).toBe(1);
    expect(authItems[0].id).toBe('auth');
    expect(anonItems[0].id).toBe('anon');
  });
});
