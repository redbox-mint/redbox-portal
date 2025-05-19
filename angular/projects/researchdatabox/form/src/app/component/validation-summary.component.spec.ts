import {TestBed} from '@angular/core/testing';
import {ValidationSummaryFieldComponent} from "./validation-summary.component";
import {ReactiveFormsModule} from '@angular/forms';
import {
  ConfigService,
  FormConfig,
  getStubConfigService,
  getStubTranslationService,
  LoggerService,
  RedboxPortalCoreModule,
  TranslationService,
  UtilityService
} from '@researchdatabox/portal-ng-common';
import {FormComponent} from "../form.component";

describe('ValidationSummaryFieldComponent (minimal)', () => {
  let configService: any;
  let translationService: any;
  beforeEach(async () => {
    configService = getStubConfigService();
    translationService = getStubTranslationService();
    await TestBed.configureTestingModule({
      imports: [
        ReactiveFormsModule,
        RedboxPortalCoreModule
      ],
      declarations: [
        FormComponent,
        ValidationSummaryFieldComponent
      ],
      providers: [
        LoggerService,
        UtilityService,
        {
          provide: TranslationService,
          useValue: translationService
        },
        {
          provide: ConfigService,
          useValue: configService
        }
      ]
    }).compileComponents();
  });
  it('should create component', () => {
    let fixture = TestBed.createComponent(ValidationSummaryFieldComponent);
    let component = fixture.componentInstance;
    expect(component).toBeDefined();
  });
  it('should contain "The form is valid."', async () => {
    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    formComponent.downloadAndCreateOnInit = false;


    await fixture.whenStable();
    fixture.detectChanges();

    const formConfig: FormConfig = {
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'validation_summary_1',
          model: {name: 'validation_summary_2', class: 'ValidationSummaryFieldModel'},
          component: {class: "ValidationSummaryFieldComponent"}
        },
      ]
    };
    formComponent.downloadAndCreateFormComponents(formConfig);
    await fixture.whenStable();
    fixture.detectChanges();

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject('Timeout waiting for componentsLoaded'), 3000);
      const check = () => {
        fixture.detectChanges();
        if (formComponent.componentsLoaded()) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });

    fixture.detectChanges(); // Ensure DOM is updated
    console.log('Components Loaded:', formComponent.componentsLoaded());

    const nativeEl: HTMLElement = fixture.nativeElement;
    const el = nativeEl.querySelector('div.alert-info')!;
    expect(el.textContent).toContain('The form is valid.');
  });
});
