import { ChangeDetectorRef } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { AdminSidebarEditorTypeComponent } from './admin-sidebar-editor.type';
import { AdminSidebarHeader, AdminSidebarSection } from './admin-sidebar-item.interface';

describe('AdminSidebarEditorTypeComponent', () => {
  const setup = (model: { header?: AdminSidebarHeader; sections?: AdminSidebarSection[]; footerLinks?: any[] } = {}) => {
    const cdr = { detectChanges: jasmine.createSpy('detectChanges') } as unknown as ChangeDetectorRef;
    const component = new AdminSidebarEditorTypeComponent(cdr);
    Object.defineProperty(component, 'key', { value: 'header' });
    Object.defineProperty(component, 'model', { value: model });

    const headerControl = new FormControl(model.header);
    new FormGroup({
      header: headerControl,
      sections: new FormControl(model.sections || []),
      footerLinks: new FormControl(model.footerLinks || [])
    });

    Object.defineProperty(component, 'formControl', { value: headerControl });

    return { component };
  };

  it('initializes default header when missing', () => {
    const { component } = setup({ sections: [], footerLinks: [] });

    component.ngOnInit();

    expect(component.header?.titleKey).toBe('menu-admin');
    expect(component.formControl.parent?.get('header')?.value.titleKey).toBe('menu-admin');
  });

  it('adds, removes, and toggles section roles', () => {
    const { component } = setup({ header: { titleKey: 'menu-admin', iconClass: 'fa fa-cog' } });

    component.addSection();
    expect(component.sections.length).toBe(1);

    component.toggleSectionRole(0, 'Admin');
    expect(component.sectionHasRole(0, 'Admin')).toBeTrue();

    component.removeSection(0);
    expect(component.sections.length).toBe(0);
  });

  it('adds section items via the editor', () => {
    const { component } = setup({ header: { titleKey: 'menu-admin', iconClass: 'fa fa-cog' } });

    component.addSection();
    component.openItemEditor(0);
    component.itemEditorState.item.labelKey = 'roles';
    component.itemEditorState.item.href = '/admin/roles';
    component.saveItem();

    expect(component.sections[0].items.length).toBe(1);
  });

  it('adds footer links via the editor', () => {
    const { component } = setup({ header: { titleKey: 'menu-admin', iconClass: 'fa fa-cog' } });

    component.openFooterLinkEditor();
    component.itemEditorState.item.labelKey = 'help';
    component.itemEditorState.item.href = '/help';
    component.saveItem();

    expect(component.footerLinks.length).toBe(1);
  });

  it('filters visible sections/items and resolves labels', () => {
    const { component } = setup({
      header: { titleKey: 'menu-admin', iconClass: 'fa fa-cog' },
      sections: [
        {
          id: 'visible',
          titleKey: 'menu-admin',
          items: [
            { id: 'users', labelKey: 'menu-users', href: '/admin/users', requiresAuth: true }
          ]
        },
        {
          id: 'hidden',
          titleKey: 'menu-hidden',
          requiresAuth: false,
          hideWhenAuth: true,
          items: [
            { id: 'hidden-item', labelKey: 'hidden', href: '/hidden', requiresAuth: false, hideWhenAuth: true }
          ]
        }
      ],
      footerLinks: []
    });

    const visibleSections = component.getVisibleSections();

    expect(visibleSections.length).toBe(1);
    expect(component.getVisibleItems(visibleSections[0]).length).toBe(1);
    expect(component.getResolvedLabel('menu-admin')).toBe('Admin');
  });
});
