import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AdminListFooterComponent } from './admin-list-footer.component';
import { TranslationService } from './translation.service';
import { getStubTranslationService } from './helper.spec';

@Component({
  standalone: true,
  imports: [AdminListFooterComponent],
  template: `<rb-admin-list-footer [total]="total()" [end]="total()" [pageCount]="pages()"><nav>Pager</nav></rb-admin-list-footer>`
})
class Host { total = signal(0); pages = signal(1); }

describe('AdminListFooterComponent', () => {
  it('hides empty footers and single-page pagers, retaining counts and multi-page navigation', () => {
    TestBed.configureTestingModule({ imports: [Host], providers: [{ provide: TranslationService, useValue: getStubTranslationService() }] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.card-footer')).toBeNull();
    fixture.componentInstance.total.set(3);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.card-footer')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('nav')).toBeNull();
    fixture.componentInstance.pages.set(2);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('nav')).toBeTruthy();
    fixture.destroy();
  });
});
