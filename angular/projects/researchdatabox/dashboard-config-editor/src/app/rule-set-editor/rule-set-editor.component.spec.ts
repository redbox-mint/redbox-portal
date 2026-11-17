import { Component, Pipe } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TranslationService } from '@researchdatabox/portal-ng-common';
import { RuleSetEditorComponent } from './rule-set-editor.component';
import { RuleEditorComponent } from './rule-editor.component';

@Pipe({ name: 'i18next', standalone: false })
class TestTranslationPipe { transform(key: string) { return key; } }

@Component({ standalone: false, template: `
  <h3>Row rules</h3><rule-set-editor [ruleSets]="sets"></rule-set-editor>
  <h4>Group rules</h4><rule-set-editor [headingLevel]="5" [ruleSets]="sets"></rule-set-editor>
` })
class TestEditorsHost {
  sets = [0, 1].map(() => ({ ruleSetName: 'Set', applyRuleSet: true, rules: [
    { name: 'Rule', action: 'show' as const, renderItemTemplate: '' },
    { name: 'Another', action: 'hide' as const, renderItemTemplate: '' }
  ] }));
}

describe('Dashboard rule editor labels', () => {
  it('keeps every label bound to its control across repeated sets and group-row editors', async () => {
    await TestBed.configureTestingModule({
      declarations: [TestEditorsHost, RuleSetEditorComponent, RuleEditorComponent, TestTranslationPipe],
      imports: [FormsModule],
      providers: [{ provide: TranslationService, useValue: { t: (key: string) => key } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(TestEditorsHost);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const controls = Array.from(host.querySelectorAll<HTMLInputElement>('input, select, textarea'));
    expect(new Set(controls.map((control) => control.id)).size).toBe(controls.length);
    for (const control of controls) {
      expect(control.id).toBeTruthy();
      expect(host.querySelector(`label[for="${control.id}"]`)).toBeTruthy();
    }
    expect(host.querySelectorAll('input[role="switch"].form-check-input').length).toBe(4);
    const editors = host.querySelectorAll('rule-set-editor');
    expect(editors[0].querySelector('h4')).toBeTruthy();
    expect(editors[0].querySelectorAll('h5').length).toBe(4);
    expect(editors[1].querySelector('h5')).toBeTruthy();
    expect(editors[1].querySelectorAll('h6').length).toBe(4);
  });
});
