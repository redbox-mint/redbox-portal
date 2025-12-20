import { ChangeDetectorRef } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { AdminSidebarEditorTypeComponent } from './admin-sidebar-editor.type';
import { AdminSidebarHeader, AdminSidebarSection, AdminSidebarItem } from './admin-sidebar-item.interface';

describe('AdminSidebarEditorTypeComponent', () => {
  const setup = (model: { header?: AdminSidebarHeader; sections?: AdminSidebarSection[]; footerLinks?: any[] } = {}) => {
    const cdr = { detectChanges: jasmine.createSpy('detectChanges') } as unknown as ChangeDetectorRef;
    const component = new AdminSidebarEditorTypeComponent(cdr);
    Object.defineProperty(component, 'key', { value: 'header' });
    Object.defineProperty(component, 'model', { value: model });

    const headerControl = new FormControl(model.header);
    const sectionsControl = new FormControl(model.sections || []);
    const footerLinksControl = new FormControl(model.footerLinks || []);

    const parentForm = new FormGroup({
      header: headerControl,
      sections: sectionsControl,
      footerLinks: footerLinksControl
    });

    Object.defineProperty(component, 'formControl', { value: headerControl });

    return { component, parentForm };
  };

  it('initializes default header when missing', () => {
    const { component } = setup({ sections: [], footerLinks: [] });

    component.ngOnInit();

    expect(component.header?.titleKey).toBe('menu-admin');
    expect(component.formControl.parent?.get('header')?.value.titleKey).toBe('menu-admin');
  });

  it('updates header field', () => {
    const { component } = setup({ header: { titleKey: 'menu-admin', iconClass: 'fa fa-cog' } });
    
    component.updateHeaderField('titleKey', 'new-title');
    
    expect(component.header?.titleKey).toBe('new-title');
  });

  it('adds, removes, and toggles section roles', () => {
    const { component } = setup({ header: { titleKey: 'menu-admin', iconClass: 'fa fa-cog' } });

    component.addSection();
    expect(component.sections.length).toBe(1);

    component.toggleSectionRole(0, 'Admin');
    expect(component.sectionHasRole(0, 'Admin')).toBeTrue();

    component.toggleSectionRole(0, 'Admin');
    expect(component.sectionHasRole(0, 'Admin')).toBeFalse();

    component.removeSection(0);
    expect(component.sections.length).toBe(0);
  });

  it('duplicates a section', () => {
    const { component } = setup({ 
      header: { titleKey: 'menu-admin', iconClass: 'fa fa-cog' },
      sections: [{ id: 's1', titleKey: 's1', items: [] }]
    });

    component.duplicateSection(0);
    expect(component.sections.length).toBe(2);
    expect(component.sections[1].titleKey).toBe('s1');
    expect(component.sections[1].id).not.toBe('s1');
  });

  it('moves a section', () => {
    const { component } = setup({ 
      header: { titleKey: 'menu-admin', iconClass: 'fa fa-cog' },
      sections: [
        { id: 's1', titleKey: 's1', items: [] },
        { id: 's2', titleKey: 's2', items: [] }
      ]
    });

    component.moveSection(0, 'down');
    expect(component.sections[0].id).toBe('s2');
    expect(component.sections[1].id).toBe('s1');

    component.moveSection(1, 'up');
    expect(component.sections[0].id).toBe('s1');
    expect(component.sections[1].id).toBe('s2');

    // Boundary checks
    component.moveSection(0, 'up');
    expect(component.sections[0].id).toBe('s1');
    
    component.moveSection(1, 'down');
    expect(component.sections[1].id).toBe('s2');
  });

  it('updates section field', () => {
    const { component } = setup({ 
      header: { titleKey: 'menu-admin', iconClass: 'fa fa-cog' },
      sections: [{ id: 's1', titleKey: 's1', items: [] }]
    });

    component.updateSectionField(0, 'titleKey', 'new-title');
    expect(component.sections[0].titleKey).toBe('new-title');
  });

  it('toggles section expansion', () => {
    const { component } = setup({ header: { titleKey: 'menu-admin', iconClass: 'fa fa-cog' } });
    
    // Initially 0 is expanded by default in component
    expect(component.isSectionExpanded(0)).toBeTrue();
    
    component.toggleSection(0);
    expect(component.isSectionExpanded(0)).toBeFalse();
    
    component.toggleSection(0);
    expect(component.isSectionExpanded(0)).toBeTrue();
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

  it('edits section items via the editor', () => {
    const { component } = setup({ 
      header: { titleKey: 'menu-admin', iconClass: 'fa fa-cog' },
      sections: [{ 
        id: 's1', 
        titleKey: 's1', 
        items: [{ id: 'i1', labelKey: 'old', href: '/old', requiresAuth: true }] 
      }]
    });

    component.openItemEditor(0, 0);
    expect(component.itemEditorState.mode).toBe('edit');
    
    component.itemEditorState.item.labelKey = 'new';
    component.saveItem();

    expect(component.sections[0].items[0].labelKey).toBe('new');
  });

  it('removes section items', () => {
    const { component } = setup({ 
      header: { titleKey: 'menu-admin', iconClass: 'fa fa-cog' },
      sections: [{ 
        id: 's1', 
        titleKey: 's1', 
        items: [{ id: 'i1', labelKey: 'i1', href: '/i1', requiresAuth: true }] 
      }]
    });

    component.removeItem(0, 0);
    expect(component.sections[0].items.length).toBe(0);
  });

  it('moves section items', () => {
    const { component } = setup({ 
      header: { titleKey: 'menu-admin', iconClass: 'fa fa-cog' },
      sections: [{ 
        id: 's1', 
        titleKey: 's1', 
        items: [
          { id: 'i1', labelKey: 'i1', href: '/i1', requiresAuth: true },
          { id: 'i2', labelKey: 'i2', href: '/i2', requiresAuth: true }
        ] 
      }]
    });

    component.moveItem(0, 0, 'down');
    expect(component.sections[0].items[0].id).toBe('i2');
    expect(component.sections[0].items[1].id).toBe('i1');

    component.moveItem(0, 1, 'up');
    expect(component.sections[0].items[0].id).toBe('i1');
    expect(component.sections[0].items[1].id).toBe('i2');
    
    // Boundary checks
    component.moveItem(0, 0, 'up');
    expect(component.sections[0].items[0].id).toBe('i1');
    
    component.moveItem(0, 1, 'down');
    expect(component.sections[0].items[1].id).toBe('i2');
  });

  it('closes item editor', () => {
    const { component } = setup();
    component.itemEditorState.visible = true;
    component.closeItemEditor();
    expect(component.itemEditorState.visible).toBeFalse();
  });

  it('adds footer links via the editor', () => {
    const { component } = setup({ header: { titleKey: 'menu-admin', iconClass: 'fa fa-cog' } });

    component.openFooterLinkEditor();
    component.itemEditorState.item.labelKey = 'help';
    component.itemEditorState.item.href = '/help';
    component.saveItem();

    expect(component.footerLinks.length).toBe(1);
  });

  it('edits footer links via the editor', () => {
    const { component } = setup({ 
      header: { titleKey: 'menu-admin', iconClass: 'fa fa-cog' },
      footerLinks: [{ id: 'f1', labelKey: 'old', href: '/old', requiresAuth: true }]
    });

    component.openFooterLinkEditor(0);
    expect(component.itemEditorState.mode).toBe('edit');
    
    component.itemEditorState.item.labelKey = 'new';
    component.saveItem();

    expect(component.footerLinks[0].labelKey).toBe('new');
  });

  it('manages footer links directly', () => {
    const { component } = setup({ header: { titleKey: 'menu-admin', iconClass: 'fa fa-cog' } });

    component.addFooterLink();
    expect(component.footerLinks.length).toBe(1);
    // Newly added link is auto-expanded
    expect(component.isFooterLinkExpanded(0)).toBeTrue();

    component.updateFooterLinkField(0, 'labelKey', 'updated');
    expect(component.footerLinks[0].labelKey).toBe('updated');

    component.toggleFooterLink(0);
    expect(component.isFooterLinkExpanded(0)).toBeFalse();

    component.removeFooterLink(0);
    expect(component.footerLinks.length).toBe(0);
  });

  it('moves footer links', () => {
    const { component } = setup({ 
      header: { titleKey: 'menu-admin', iconClass: 'fa fa-cog' },
      footerLinks: [
        { id: 'f1', labelKey: 'f1', href: '/f1', requiresAuth: true },
        { id: 'f2', labelKey: 'f2', href: '/f2', requiresAuth: true }
      ]
    });

    component.moveFooterLink(0, 'down');
    expect(component.footerLinks[0].id).toBe('f2');
    expect(component.footerLinks[1].id).toBe('f1');

    component.moveFooterLink(1, 'up');
    expect(component.footerLinks[0].id).toBe('f1');
    expect(component.footerLinks[1].id).toBe('f2');
    
    // Boundary checks
    component.moveFooterLink(0, 'up');
    expect(component.footerLinks[0].id).toBe('f1');
    
    component.moveFooterLink(1, 'down');
    expect(component.footerLinks[1].id).toBe('f2');
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
    
    // Test with resolveTranslations = false
    component.resolveTranslations = false;
    expect(component.getResolvedLabel('menu-admin')).toBe('menu-admin');
  });

  it('tracks items correctly', () => {
    const { component } = setup();
    expect(component.trackByIndex(1)).toBe(1);
    expect(component.trackById(0, { id: 'test' } as any)).toBe('test');
    expect(component.trackById(0, {} as any)).toBe('0');
  });

  it('checks section roles safely', () => {
    const { component } = setup({ sections: [] });
    expect(component.sectionHasRole(0, 'Admin')).toBeFalse();
    
    // Manually add a section without requiredRoles to test safety
    (component.sections as any).push({ id: 's1', titleKey: 's1', items: [] });
    expect(component.sectionHasRole(0, 'Admin')).toBeFalse();
  });

  it('updates header without parent control', () => {
    const cdr = { detectChanges: jasmine.createSpy('detectChanges') } as unknown as ChangeDetectorRef;
    const component = new AdminSidebarEditorTypeComponent(cdr);
    Object.defineProperty(component, 'key', { value: 'header' });
    Object.defineProperty(component, 'model', { value: { header: { titleKey: 'menu-admin', iconClass: 'fa fa-cog' } } });
    Object.defineProperty(component, 'formControl', { value: new FormControl() }); // No parent
    
    component.updateHeader({ titleKey: 'new', iconClass: 'new' });
    expect(component.header?.titleKey).toBe('new');
  });
});
