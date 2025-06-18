// import {ComponentHarness, ContentContainerComponentHarness} from "@angular/cdk/testing";
import {TestBed} from "@angular/core/testing";
import {FormComponent} from "./form.component";
import {
  ConfigService,
  getStubConfigService,
  getStubTranslationService,
  LoggerService,
  RedboxPortalCoreModule,
  TranslationService,
  UtilityService
} from '@researchdatabox/portal-ng-common';
import {ReactiveFormsModule} from "@angular/forms";
import {APP_BASE_HREF, CommonModule} from "@angular/common";
import {BrowserModule, Title} from "@angular/platform-browser";
import {I18NextPipe, provideI18Next} from "angular-i18next";
import {FormService} from "./form.service";
import {FormStatus, FormConfig} from "@researchdatabox/sails-ng-common";
import {DefaultLayoutComponent} from "./component/default-layout.component";
import {FormBaseWrapperComponent} from "./component/base-wrapper.component";
import {FormBaseWrapperDirective} from "./component/base-wrapper.directive";

export async function createFormAndWaitForReady(formConfig: FormConfig) {
  const fixture = TestBed.createComponent(FormComponent);
  const formComponent = fixture.componentInstance;
  formComponent.downloadAndCreateOnInit = false;

  await fixture.whenStable();
  fixture.detectChanges();

  await formComponent.downloadAndCreateFormComponents(formConfig);

  await fixture.whenStable();
  fixture.detectChanges();


  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject('Timeout waiting for componentsLoaded'), 3000);
    const check = () => {
      fixture.detectChanges();
      if (formComponent.status() === FormStatus.READY && formComponent.componentsLoaded()) {
        clearTimeout(timeout);
        resolve();
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });

  await fixture.whenStable();
  // Ensure DOM is updated
  fixture.detectChanges();

  console.log('Components Loaded:', formComponent.componentsLoaded());

  return {
    fixture: fixture,
    formComponent: formComponent,
  }
}

export async function createTestbedModule(moreDeclarations: any[] = []) {
  const configService = getStubConfigService();
  const translationService = getStubTranslationService();
  await TestBed.configureTestingModule({
    declarations: [
      DefaultLayoutComponent,
      FormBaseWrapperComponent,
      FormBaseWrapperDirective,
      FormComponent,
      ...moreDeclarations,
    ],
    imports: [
      CommonModule,
      BrowserModule,
      ReactiveFormsModule,
      RedboxPortalCoreModule,
      I18NextPipe,
    ],
    providers: [
      {
        provide: APP_BASE_HREF,
        useValue: 'base'
      },
      LoggerService,
      UtilityService,
      {
        provide: TranslationService,
        useValue: translationService
      },
      {
        provide: ConfigService,
        useValue: configService
      },
      Title,
      FormService,
      provideI18Next(),
    ]
  }).compileComponents();
  return {
    configService: configService,
    translationService: translationService,
  }
}

/*
export class FormComponentHarness extends ComponentHarness {
  static hostSelector = 'redbox-form';
}

export class TextFieldComponentHarness extends ComponentHarness {
  static hostSelector = 'redbox-textfield';
}

export class RepeatableComponentHarness extends ContentContainerComponentHarness<string> {
  static hostSelector = 'redbox-form-repeatable';
}

export class GroupFieldComponentHarness extends ContentContainerComponentHarness<string> {
  static hostSelector = 'redbox-groupfield';
}
*/
