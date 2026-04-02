import { TestBed } from '@angular/core/testing';
import { RecordService } from '@researchdatabox/portal-ng-common';
import { createTestbedModule } from '../helpers.spec';
import { FormComponentEventBus } from '../form-state/events/form-component-event-bus.service';
import { GroupFieldComponent } from './group.component';
import { PublishDataLocationRefreshComponent } from './publish-data-location-refresh.component';
import { PublishDataLocationSelectorComponent } from './publish-data-location-selector.component';
import { SimpleInputComponent } from './simple-input.component';

describe('PublishDataLocationRefreshComponent', () => {
  let recordService: jasmine.SpyObj<RecordService>;

  beforeEach(async () => {
    recordService = jasmine.createSpyObj<RecordService>('RecordService', ['getRecordMeta', 'waitForInit']);
    recordService.waitForInit.and.resolveTo();

    await createTestbedModule({
      declarations: {
        GroupFieldComponent,
        PublishDataLocationRefreshComponent,
        PublishDataLocationSelectorComponent,
        SimpleInputComponent,
      },
      providers: {
        RecordService: { provide: RecordService, useValue: recordService },
      },
    });
  });

  it('should create component', () => {
    const fixture = TestBed.createComponent(PublishDataLocationRefreshComponent);
    expect(fixture.componentInstance).toBeDefined();
  });

  it('clicks the refresh button and publishes a timestamped field.value.changed event', () => {
    const eventBus = TestBed.inject(FormComponentEventBus);
    spyOn(eventBus, 'publish');

    const fixture = TestBed.createComponent(PublishDataLocationRefreshComponent);
    const component = fixture.componentInstance;
    component.formFieldCompMapEntry = {
      lineagePaths: {
        angularComponentsJsonPointer: '/mainTab/data/dataPubLocationRefresherTrigger',
      },
    } as never;

    component.onClick();

    // The component contract stays deliberately narrow: emit one broadcast event
    // and let the behaviour layer do the metadata fetch.
    expect(eventBus.publish).toHaveBeenCalledWith(
      jasmine.objectContaining({
        type: 'field.value.changed',
        fieldId: '/mainTab/data/dataPubLocationRefresherTrigger',
        sourceId: '*',
        value: jasmine.any(Number),
      })
    );
  });
});
