import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RvaImportComponent } from './rva-import.component';

describe('RvaImportComponent', () => {
  let fixture: ComponentFixture<RvaImportComponent>;
  let component: RvaImportComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [RvaImportComponent],
      imports: [FormsModule]
    }).compileComponents();

    fixture = TestBed.createComponent(RvaImportComponent);
    component = fixture.componentInstance;
  });

  it('emits trimmed rva id and clears input', () => {
    let emitted = '';
    component.importRequested.subscribe((value: string) => emitted = value);

    component.rvaId = '  rva:test  ';
    component.runImport();

    expect(emitted).toBe('rva:test');
    expect(component.rvaId).toBe('');
  });
});
