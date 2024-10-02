import { TestBed } from '@angular/core/testing';
import { HeaderSortComponent } from './header-sort.component';
import {LoggerService} from "./logger.service";

describe('HeaderSortComponent', () => {

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [
        HeaderSortComponent ,
      ],
      providers: [
        LoggerService,
      ]
    })
      .compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(HeaderSortComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('headerSortClicked should toggle sort', () => {
    const fixture = TestBed.createComponent(HeaderSortComponent);
    const component = fixture.componentInstance;
    expect(component.sort)
      .withContext('Empty at first')
      .toBe('');
    component.headerSortClicked();
    expect(component.sort)
      .withContext('asc after click')
      .toBe('asc');
    component.headerSortClicked();
    expect(component.sort)
      .withContext('desc after second click')
      .toBe('desc');
  });
});
