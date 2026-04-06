// import {ComponentHarness, ContentContainerComponentHarness} from "@angular/cdk/testing";
import { TestBed } from "@angular/core/testing";
import { FormComponent } from "./form.component";
import {
  ConfigService,
  getStubConfigService,
  getStubTranslationService,
  I18NextPipe,
  LoggerService,
  providePortalI18nTesting,
  RedboxPortalCoreModule,
  TranslationService,
  UtilityService
} from '@researchdatabox/portal-ng-common';
import { ReactiveFormsModule } from "@angular/forms";
import { APP_BASE_HREF, CommonModule } from "@angular/common";
import { BrowserModule, Title } from "@angular/platform-browser";
import { FormService } from "./form.service";
import {
  buildKeyString,
  FormConfigFrame,
  formValidatorsSharedDefinitions,
} from "@researchdatabox/sails-ng-common";
import { DefaultLayoutComponent } from "./component/default-layout.component";
import { InlineLayoutComponent } from "./component/inline-layout.component";
import { FormBaseWrapperComponent } from "./component/base-wrapper.component";
import { FormBaseWrapperDirective } from "./component/base-wrapper.directive";
import { FieldErrorSummaryComponent } from "./component/field-error-summary.component";
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { provideFormFeature } from './form-state/providers';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { FormStateFacade } from './form-state/facade/form-state.facade';
import { FormComponentEventBus } from './form-state/events/form-component-event-bus.service';
import { FormComponentFocusRequestCoordinator } from './form-state/events/form-component-focus-request-coordinator.service';
import { TiptapEditorDirective } from "ngx-tiptap";
import { A11yModule } from "@angular/cdk/a11y";
import { FormDebugPanelComponent } from "./form-debug/form-debug-panel.component";
import { FormDebugModelTabComponent } from "./form-debug/form-debug-model-tab.component";
import { FormDebugConfigTabComponent } from "./form-debug/form-debug-config-tab.component";
import { FormDebugEventsTabComponent } from "./form-debug/form-debug-events-tab.component";
import { ConfirmationDialogComponent } from "./component/confirmation-dialog.component";
import { ConfirmationDialogService } from "./confirmation-dialog.service";

// provide to test the same way as provided to browser
(window as any).redboxClientScript = { formValidatorDefinitions: formValidatorsSharedDefinitions };

export interface FormComponentProps {
  oid: string;
  recordType: string;
  editMode: boolean;
  formName: string;
  downloadAndCreateOnInit: boolean;
}

export interface FormDebugUrlOptions {
  formDebugParam?: string | boolean;
}

function shouldLogFormTestHelper(): boolean {
  if (typeof (globalThis as any).__REDBOX_FORM_TEST_HELPER_DEBUG__ !== 'undefined') {
    return !!(globalThis as any).__REDBOX_FORM_TEST_HELPER_DEBUG__;
  }
  if (typeof (globalThis as any).__REDBOX_CI_MODE__ !== 'undefined') {
    return !(globalThis as any).__REDBOX_CI_MODE__;
  }
  if (typeof window !== 'undefined' && (window as any).__karma__) {
    return false;
  }
  return true;
}

function logFormTestHelper(message: string, data?: unknown): void {
  if (!shouldLogFormTestHelper()) {
    return;
  }
  if (typeof data === 'undefined') {
    console.log(message);
    return;
  }
  console.log(message, data);
}

function setFormDebugUrl(opts?: FormDebugUrlOptions): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('formDebug');
  const formDebugParam = opts?.formDebugParam;
  if (typeof formDebugParam === 'boolean') {
    if (formDebugParam) {
      url.searchParams.set('formDebug', '1');
    }
  } else if (typeof formDebugParam === 'string' && formDebugParam.trim()) {
    url.searchParams.set('formDebug', formDebugParam.trim());
  }
  window.history.replaceState({}, '', url.toString());
}

export async function createFormAndWaitForReady(formConfig: FormConfigFrame, formComponentProps?: FormComponentProps, formDebugUrlOptions?: FormDebugUrlOptions) {
  logFormTestHelper('createFormAndWaitForReady - starting');
  if (formDebugUrlOptions) {
    setFormDebugUrl(formDebugUrlOptions);
  }
  // Set up the basic angular testing requirements.
  const fixture = TestBed.createComponent(FormComponent);
  const formComponent = fixture.componentInstance;

  // set the attributes on the nativeElement
  // this is necessary to properly initialise the form component
  formComponentProps = Object.assign({}, {
    oid: `oid-generated-${Date.now()}`,
    recordType: 'rdmp',
    editMode: false,
    formName: 'default-1.0-draft',
    downloadAndCreateOnInit: false,
  }, formComponentProps);

  // Set the form component to not download the form config on init.
  // Each test will provide a form config.
  formComponent.downloadAndCreateOnInit.set(formComponentProps['downloadAndCreateOnInit']);

  // Set the form component properties needed for initialisation.
  formComponent.oid.set(formComponentProps['oid']);
  formComponent.recordType.set(formComponentProps['recordType']);
  formComponent.editMode.set(formComponentProps['editMode']);
  formComponent.formName.set(formComponentProps['formName']);

  // Turn on angular's automatic change detection.
  // This reduces the need to call fixture.detectChanges,
  // but fixture.whenStable is still required.
  fixture.autoDetectChanges();

  // Wait until changes have occurred
  // and no more changes are detected.
  await fixture.whenStable();

  // Create the form component and field components from the form config.
  await formComponent.downloadAndCreateFormComponents(formConfig);

  await fixture.whenStable();

  logFormTestHelper('createFormAndWaitForReady - finished', {
    debugInfo: formComponent.getDebugInfo(),
    validationErrors: formComponent.getValidationErrors()
  });

  return {
    fixture: fixture,
    formComponent: formComponent,
    componentDefinitions: formConfig?.componentDefinitions ? formConfig?.componentDefinitions[0] : undefined
  }
}

export interface CreateTestbedModuleArgs {
  declarations?: Record<string, any>;
  providers?: Record<string, any>;
  imports?: Record<string, any>;
}

async function createTestBedModuleConfig(defaults: Record<string, any>, custom: Record<string, any>) {
  const result: any[] = [];
  const merged = Object.assign({}, defaults, custom);
  const includedKeys: string[] = [];
  Object.entries(merged).forEach(([key, value]) => {
    if (key && value) {
      // Add the value to the array if both the key and value exist.
      // This allows for removing items from the defaults by adding an entry with the same key and null value.
      includedKeys.push(key);
      result.push(value);
    }
  });
  logFormTestHelper('createTestBedModuleConfig', {
    defaults: Object.keys(defaults),
    custom: Object.keys(custom),
    result: includedKeys
  });
  return result;
}

export async function createTestbedModule(testConfig: CreateTestbedModuleArgs) {
  const configService = getStubConfigService();
  const translationService = getStubTranslationService();
  await TestBed.configureTestingModule({
    declarations: await createTestBedModuleConfig({
      "DefaultLayoutComponent": DefaultLayoutComponent,
      "InlineLayoutComponent": InlineLayoutComponent,
      "FormBaseWrapperComponent": FormBaseWrapperComponent,
      "FormBaseWrapperDirective": FormBaseWrapperDirective,
      "FieldErrorSummaryComponent": FieldErrorSummaryComponent,
      "FormComponent": FormComponent,
      "FormDebugPanelComponent": FormDebugPanelComponent,
      "FormDebugModelTabComponent": FormDebugModelTabComponent,
      "FormDebugConfigTabComponent": FormDebugConfigTabComponent,
      "FormDebugEventsTabComponent": FormDebugEventsTabComponent,
      "ConfirmationDialogComponent": ConfirmationDialogComponent,
    }, testConfig.declarations ?? {}),
    imports: await createTestBedModuleConfig({
      "CommonModule": CommonModule,
      "BrowserModule": BrowserModule,
      "ReactiveFormsModule": ReactiveFormsModule,
      "RedboxPortalCoreModule": RedboxPortalCoreModule,
      "I18NextPipe": I18NextPipe,
      "TiptapEditorDirective": TiptapEditorDirective,
      "A11yModule": A11yModule,
    }, testConfig.imports ?? {}),
    providers: await createTestBedModuleConfig({
      "APP_BASE_HREF": { provide: APP_BASE_HREF, useValue: 'http://localhost' },
      "LoggerService": LoggerService,
      "UtilityService": UtilityService,
      "TranslationService": { provide: TranslationService, useValue: translationService },
      "ConfigService": { provide: ConfigService, useValue: configService },
      "Title": Title,
      "FormService": FormService,
      "providePortalI18nTesting": providePortalI18nTesting(),
      "FormComponent": FormComponent,
      "provideHttpClient": provideHttpClient(),
      "provideHttpClientTesting": provideHttpClientTesting(),
      "provideStore": provideStore(),  // Root store provider required for NgRx
      "provideEffects": provideEffects(),  // Root effects provider required for NgRx
      "provideFormFeature": provideFormFeature(),  // Add form state providers
      "FormStateFacade": FormStateFacade,  // Provide the facade service
      "FormComponentEventBus": FormComponentEventBus,  // Provide the event bus service
      "FormComponentFocusRequestCoordinator": FormComponentFocusRequestCoordinator,
      "ConfirmationDialogService": ConfirmationDialogService,
    }, testConfig.providers ?? {}),
  }).compileComponents();
  return {
    configService: configService,
    translationService: translationService,
  }
}

export function setUpDynamicAssets(opts?: {
  urlKeyStart?: string,
  callable?: (keyString: string, key: (string | number)[], context: any, extra?: any) => void
}) {
  if (!opts) {
    opts = {};
  }
  if (!opts.urlKeyStart) {
    opts.urlKeyStart = "http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/oid-generated-";
  }
  const utilityService = TestBed.inject(UtilityService);
  spyOn(utilityService, "getDynamicImport").and.callFake(
    async (brandingAndPortalUrl: string, urlPath: string[], params?: { [key: string]: any }) => {
      const urlKey = `${brandingAndPortalUrl}/${(urlPath ?? []).join("/")}`;
      if (!opts.urlKeyStart || !urlKey.startsWith(opts.urlKeyStart)) {
        throw new Error(`Expected url key '${opts.urlKeyStart}', but got unknown url key: ${urlKey}`);
      }

      return {
        evaluate: (key: (string | number)[], context: any, extra: any) => {
          const keyStr = buildKeyString(key as string[]);
          if (opts.callable) {
            return opts.callable(keyStr, key, context, extra);
          }
          throw new Error(`Unknown key: ${keyStr}`);
        }
      };
    });
}
