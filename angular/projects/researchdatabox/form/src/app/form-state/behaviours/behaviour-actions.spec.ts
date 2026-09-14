import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { executeBehaviourAction, BehaviourActionExecutionContext } from './behaviour-actions';
import { FormComponent } from '../../form.component';
import { FormFieldCompMapEntry, LoggerService } from '@researchdatabox/portal-ng-common';
import { FormComponentEventBus } from '../events/form-component-event-bus.service';

// Exercise the actual setValue action after a pending pipeline resumes. The
// locked entry retains its old pointer, while the current query tree is reindexed.
describe('delayed logical setValue action', () => {
  function setup() {
    const rows = new FormArray(['Alpha', 'Beta', 'Gamma'].map(value => new FormGroup({ result: new FormControl(value) })));
    const entries = rows.controls.map((row, index) => ({
      model: { formControl: row.controls.result }, lineagePaths: { angularComponentsJsonPointer: `/rows/${index}/result` },
    } as unknown as FormFieldCompMapEntry));
    const target = entries[1];
    const ctx: BehaviourActionExecutionContext = {
      behaviourIndex: 0, actionIndex: 0, listName: 'actions',
      eventBus: { publish: jasmine.createSpy('publish') } as unknown as FormComponentEventBus,
      logger: { warn: jasmine.createSpy('warn') } as unknown as LoggerService,
      getLogicalFieldEntry: () => target,
      fieldResolverContext: { formComponent: {
        form: new FormGroup({ rows }),
        getQuerySource: () => ({ queryOrigSource: [], querySource: [], jsonPointerSource: {
          rows: rows.controls.map(row => ({ result: { metadata: { formFieldEntry: entries.find(e => e.model?.formControl === row.controls.result) } } })),
        } }),
      } as unknown as FormComponent },
    };
    let release!: (value: string) => void;
    const response = new Promise<string>(resolve => { release = resolve; });
    const run = (kind: 'logical' | 'componentJsonPointer') => response.then(value => executeBehaviourAction(
      { type: 'setValue', config: { fieldPath: '/rows/1/result', fieldPathKind: kind } },
      { value, event: {}, formData: {}, requestParams: {}, runtimeContext: {} }, ctx,
    ));
    return { rows, ctx, release, run };
  }

  for (const removed of [0, 1]) {
    it(`keeps the original target identity when row ${removed} is removed while pending`, async () => {
      const { rows, ctx, release, run } = setup();
      const pending = run('logical');
      rows.removeAt(removed);
      release('Fetched for Beta');
      await pending;
      expect(rows.getRawValue()).toEqual(removed === 0
        ? [{ result: 'Fetched for Beta' }, { result: 'Gamma' }]
        : [{ result: 'Alpha' }, { result: 'Gamma' }]);
      expect(ctx.eventBus.publish).not.toHaveBeenCalled();
      expect(rows.at(0).dirty).toBe(removed === 0);
    });
  }

  it('preserves numeric pointer targeting at execution time', async () => {
    const { rows, release, run } = setup();
    const pending = run('componentJsonPointer');
    rows.removeAt(0);
    release('Current second row');
    await pending;
    expect(rows.getRawValue()).toEqual([{ result: 'Beta' }, { result: 'Current second row' }]);
  });

  it('writes the original target when no rows have moved', async () => {
    const { rows, release, run } = setup();
    const pending = run('logical');
    release('Fetched for Beta');
    await pending;
    expect(rows.getRawValue()).toEqual([{ result: 'Alpha' }, { result: 'Fetched for Beta' }, { result: 'Gamma' }]);
  });
});
