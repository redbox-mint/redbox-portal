import { FormControl, FormGroup } from '@angular/forms';
import { withExpressionValueNotifications, publishControlValueNotification } from './control-value-notifications';

describe('control value notifications', () => {
  it('publishes each asynchronous change with its current ancestor value', async () => {
    const control = new FormControl('original');
    const parent = new FormGroup({ field: control });
    const values: unknown[] = [];
    control.valueChanges.subscribe(value => publishControlValueNotification(control, () => {
      values.push({ value, form: parent.value });
    }));

    await withExpressionValueNotifications(control, async () => {
      control.setValue('intermediate', { onlySelf: true });
      expect(values).toEqual([{ value: 'intermediate', form: { field: 'intermediate' } }]);
      await Promise.resolve();
      control.setValue('final', { onlySelf: true });
    });

    expect(values).toEqual([
      { value: 'intermediate', form: { field: 'intermediate' } },
      { value: 'final', form: { field: 'final' } },
    ]);
  });

  it('keeps ancestor refresh active until all overlapping writes finish', async () => {
    const control = new FormControl('original');
    const parent = new FormGroup({ field: control });
    const values: unknown[] = [];
    control.valueChanges.subscribe(() => publishControlValueNotification(control, () => { values.push(parent.value); }));
    let completeFirst!: () => void;
    let completeSecond!: () => void;
    const first = withExpressionValueNotifications(control, async () => {
      await new Promise<void>(resolve => { completeFirst = resolve; });
    });
    const second = withExpressionValueNotifications(control, async () => {
      await new Promise<void>(resolve => { completeSecond = resolve; });
      control.setValue('second', { onlySelf: true });
    });

    completeFirst();
    await first;
    completeSecond();
    await second;
    expect(values).toEqual([{ field: 'second' }]);
  });

  it('cleans up after a failed write and leaves unrelated controls alone', async () => {
    const control = new FormControl('original');
    const other = new FormControl('other');
    const parent = new FormGroup({ field: control });
    const otherParent = new FormGroup({ other });
    const refresh = spyOn(parent, 'updateValueAndValidity').and.callThrough();
    const refreshOther = spyOn(otherParent, 'updateValueAndValidity').and.callThrough();
    const publish = jasmine.createSpy('publish');

    await expectAsync(withExpressionValueNotifications(control, async () => {
      publishControlValueNotification(other, publish);
      control.setValue('updated', { emitEvent: false, onlySelf: true });
      throw new Error('write failed');
    })).toBeRejectedWithError('write failed');

    expect(parent.value).toEqual({ field: 'updated' });
    expect(refresh).toHaveBeenCalledTimes(1);
    publishControlValueNotification(control, publish);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refreshOther).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('refreshes aggregates before a child of an expression-targeted group notifies', async () => {
    const child = new FormControl('original');
    const group = new FormGroup({ child });
    const root = new FormGroup({ group });
    const values: unknown[] = [];
    child.valueChanges.subscribe(() => publishControlValueNotification(child, () => { values.push(root.value); }));

    await withExpressionValueNotifications(group, async () => {
      group.setValue({ child: 'updated' }, { onlySelf: true });
    });

    expect(values).toEqual([{ group: { child: 'updated' } }]);
  });
});
