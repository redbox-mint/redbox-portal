import { TestBed } from '@angular/core/testing';
import { AdminPagerComponent } from './admin-pager.component';
import { TranslationService } from './translation.service';
import { getStubTranslationService } from './helper.spec';

describe('AdminPagerComponent', () => {
  it('keeps both ends reachable across a long list and labels the current page', () => {
    TestBed.configureTestingModule({ imports: [AdminPagerComponent], providers: [{ provide: TranslationService, useValue: getStubTranslationService() }] });
    const fixture = TestBed.createComponent(AdminPagerComponent);
    const pager = fixture.componentInstance;
    pager.totalPages = 72;
    fixture.detectChanges();
    expect(pager.items).toEqual([1, 2, 3, null, 72]);
    const changed = spyOn(pager.pageChange, 'emit');
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    buttons.find(button => button.textContent?.trim() === '72')!.click();
    expect(changed).toHaveBeenCalledOnceWith(72);
    pager.page = 36;
    fixture.detectChanges();
    expect(pager.items).toEqual([1, null, 35, 36, 37, null, 72]);
    expect(fixture.nativeElement.querySelector('[aria-current="page"]').textContent.trim()).toBe('36');
    pager.page = 72;
    expect(pager.items).toEqual([1, null, 70, 71, 72]);
    fixture.destroy();
  });

  it('does not navigate out of range, to the current page, or while disabled', () => {
    const pager = new AdminPagerComponent();
    pager.totalPages = 3;
    const changed = spyOn(pager.pageChange, 'emit');
    [0, 1, 4].forEach(page => pager.go(page));
    pager.disabled = true;
    pager.go(2);
    expect(changed).not.toHaveBeenCalled();
    expect(pager.items).toEqual([1, 2, 3]);
  });
});
