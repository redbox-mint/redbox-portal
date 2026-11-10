import { ChangeDetectorRef, Pipe } from '@angular/core';
import { CommonModule } from '@angular/common';
import { createInstance } from 'i18next';
import { A11yModule } from '@angular/cdk/a11y';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { TranslationService } from '@researchdatabox/portal-ng-common';
import { MenuEditorTypeComponent } from '../menu-editor';
import { HomePanelsEditorTypeComponent } from '../home-panels-editor';
import { AdminSidebarEditorTypeComponent } from '../admin-sidebar-editor';
import { NavigationRowComponent } from './navigation-row.component';
import { NavigationFieldsComponent } from './navigation-fields.component';
import { NavigationLinkDialogComponent } from './navigation-link-dialog.component';

@Pipe({ name: 'i18next', standalone: false })
class TestTranslations {
  private readonly translator = createInstance();
  constructor() {
    this.translator.init({ initAsync: false, lng: 'en', resources: { en: { translation: {
      'admin-navigation-remove-title': 'Remove “{{label}}”?' }
    } } });
  }
  transform(key: string, options?: any): string { return this.translator.t(key, options) as string; }
}

const cdr = { detectChanges: () => {} } as ChangeDetectorRef;
const translations = { t: (key: string) => key } as TranslationService;

describe('Navigation config preservation', () => {
  const link = { id: 'child', labelKey: 'child-label', href: '/child', external: true,
    requiresAuth: false, hideWhenAuth: true, requiredRoles: ['Custom role'], featureFlag: 'custom',
    visibleWhenTranslationExists: true, hookProperty: { keep: ['all', 'values'] } };
  const configurations = [
    { type: MenuEditorTypeComponent, key: 'items', collection: 'items', expanded: 'isExpanded', move: 'moveItem',
      parent: { ...link, id: 'parent', labelKey: 'parent-label', href: '/', children: [link] } },
    { type: HomePanelsEditorTypeComponent, key: 'panels', collection: 'panels', expanded: 'isPanelExpanded', move: 'movePanel',
      parent: { id: 'panel', titleKey: 'panel-title', iconClass: 'fa fa-test', columnClass: 'custom-columns', items: [link] } },
    { type: AdminSidebarEditorTypeComponent, key: 'header', collection: 'sections', expanded: 'isSectionExpanded', move: 'moveSection',
      parent: { id: 'section', titleKey: 'section-title', defaultExpanded: false, requiredRoles: ['Custom role'],
        requiresAuth: false, hideWhenAuth: true, featureFlag: 'section-flag', items: [link] } }
  ];
  for (const config of configurations) {
    function setup(): any {
      const parents = JSON.parse(JSON.stringify([config.parent, { ...config.parent, id: 'second' }]));
      const model = { [config.collection]: parents, showSearch: false, header: { titleKey: 'custom-title', iconClass: 'fa fa-star' }, footerLinks: [JSON.parse(JSON.stringify(link))] };
      const component: any = new config.type(cdr, translations);
      const control = new FormControl(model[config.key]);
      new FormGroup({ [config.key]: control, [config.collection]: config.key === config.collection ? control : new FormControl(parents), footerLinks: new FormControl(model.footerLinks) });
      Object.defineProperty(component, 'model', { value: model });
      Object.defineProperty(component, 'formControl', { value: control });
      return component;
    }
    it(`${config.collection}: starts preview closed below 1200px and open on desktop`, () => {
      const media = spyOn(window, 'matchMedia').and.returnValue({ matches: false } as MediaQueryList);
      expect(setup().previewInitiallyOpen).toBeFalse();
      expect(media).toHaveBeenCalledWith('(min-width: 1200px)');
      media.and.returnValue({ matches: true } as MediaQueryList);
      expect(setup().previewInitiallyOpen).toBeTrue();
    });
    it(`${config.collection}: reordering follows the selected item and preserves every property`, () => {
      const component = setup();
      const original = JSON.parse(JSON.stringify(component[config.collection]));
      component.selectParent(0);
      component[config.move](0, 'down');
      expect(component[config.expanded](1)).toBeTrue();
      expect(component[config.expanded](0)).toBeFalse();
      expect(component[config.collection]).toEqual([original[1], original[0]]);
      component[config.move](1, 'up');
      expect(JSON.parse(JSON.stringify(component[config.collection]))).toEqual(original);
    });
    it(`${config.collection}: child duplication, movement and removal preserve flags and unknown properties`, () => {
      const component = setup();
      const childrenKey = config.collection === 'items' ? 'children' : 'items';
      const original = JSON.parse(JSON.stringify(component[config.collection][0][childrenKey][0]));
      component.childAction(0, 0, 'duplicate');
      const duplicate = component[config.collection][0][childrenKey][1];
      expect(duplicate.id).toContain('child-copy-');
      expect({ ...duplicate, id: original.id }).toEqual(original);
      component.childAction(0, 1, 'up');
      component.childAction(0, 0, 'remove');
      expect(component[config.collection][0][childrenKey]).toEqual([original]);
    });
  }
});

describe('Navigation row and detail controls', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NavigationRowComponent, NavigationFieldsComponent, NavigationLinkDialogComponent, TestTranslations],
      imports: [CommonModule, A11yModule]
    }).compileComponents();
  });
  it('requires confirmation before removing a parent or child and leaves cancellation unchanged', () => {
    const fixture = TestBed.createComponent(NavigationRowComponent);
    fixture.componentInstance.label = 'Parent';
    const actions: string[] = [];
    fixture.componentInstance.action.subscribe(action => actions.push(action));
    fixture.componentInstance.run('remove');
    fixture.detectChanges();
    expect(actions).toEqual([]);
    expect(fixture.nativeElement.querySelector('[role="alertdialog"]')).not.toBeNull();
    fixture.nativeElement.querySelector('.modal-footer .btn-outline-secondary').click();
    fixture.detectChanges();
    expect(actions).toEqual([]);
    fixture.componentInstance.run('remove');
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.rb-admin-danger-confirm').click();
    expect(actions).toEqual(['remove']);
  });
  it('renders confirmation labels as escaped Angular text without showing HTML entities', () => {
    const fixture = TestBed.createComponent(NavigationRowComponent);
    fixture.componentInstance.label = 'Records & reporting <img>';
    fixture.componentInstance.run('remove');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.modal-title').textContent).toBe('Remove “Records & reporting <img>”?');
    expect(fixture.nativeElement.querySelector('.modal-title img')).toBeNull();
  });
  it('treats absent requiresAuth as signed in, matching NavigationService, without adding defaults to JSON', () => {
    const fixture = TestBed.createComponent(NavigationFieldsComponent);
    const item = { labelKey: 'label', href: '/' };
    fixture.componentInstance.item = item;
    fixture.detectChanges();
    expect(fixture.componentInstance.audienceValue).toBe('in');
    expect(item).toEqual({ labelKey: 'label', href: '/' });
  });
  it('exposes custom stored roles and emits audience flags without dropping other properties', () => {
    const fixture = TestBed.createComponent(NavigationFieldsComponent);
    fixture.componentInstance.item = { requiredRoles: ['Custom'], featureFlag: 'keep', requiresAuth: true };
    fixture.componentInstance.fieldChange.subscribe(({ field, value }) => fixture.componentInstance.item[field] = value);
    fixture.componentInstance.audience('out');
    expect(fixture.componentInstance.item).toEqual({ requiredRoles: ['Custom'], featureFlag: 'keep', requiresAuth: false, hideWhenAuth: true });
    expect(fixture.componentInstance.roles).toContain('Custom');
    fixture.componentInstance.toggleRole('Custom');
    expect(fixture.componentInstance.item.requiredRoles).toEqual([]);
  });
  it('blocks blank child labels and URLs and preserves the Menu child ID requirement', () => {
    const fixture = TestBed.createComponent(NavigationLinkDialogComponent);
    fixture.componentInstance.item = { labelKey: ' ', href: '/path' };
    expect(fixture.componentInstance.valid).toBeFalse();
    fixture.componentInstance.item.labelKey = 'label';
    expect(fixture.componentInstance.valid).toBeTrue();
    fixture.componentInstance.requireId = true;
    expect(fixture.componentInstance.valid).toBeFalse();
    fixture.componentInstance.item.id = 'child';
    expect(fixture.componentInstance.valid).toBeTrue();
  });
  it('gives preset icons translated label keys instead of CSS class names', () => {
    const fixture = TestBed.createComponent(NavigationFieldsComponent);
    fixture.componentInstance.kind = 'panel';
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('.rb-navigation-icon-options button') as NodeListOf<HTMLButtonElement>;
    expect(buttons.length).toBe(10);
    for (const button of Array.from(buttons)) {
      expect(button.getAttribute('aria-label')).toMatch(/^admin-navigation-icon-/);
      expect(button.title).toBe(button.getAttribute('aria-label')!);
      expect(button.getAttribute('aria-label')).not.toContain('fa ');
    }
  });

});
