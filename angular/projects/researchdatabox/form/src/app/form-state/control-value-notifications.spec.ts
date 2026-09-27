import { FormControl } from '@angular/forms';
import { deferControlValueNotifications, publishControlValueNotification } from './control-value-notifications';

describe('control value notifications', () => {
  it('coalesces asynchronous writes and leaves unrelated controls immediate', async () => {
    const control = new FormControl('original');
    const other = new FormControl('other');
    const values: unknown[] = [];
    const publish = () => { values.push(control.value); };
    const otherPublished = jasmine.createSpy('other published');
    control.valueChanges.subscribe(() => publishControlValueNotification(control, publish));

    await deferControlValueNotifications(control, async () => {
      control.setValue('intermediate');
      await Promise.resolve();
      publishControlValueNotification(other, otherPublished);
      expect(otherPublished).toHaveBeenCalledTimes(1);
      control.setValue('final');
      expect(values).toEqual([]);
    });

    expect(values).toEqual(['final']);
    control.setValue('later');
    expect(values).toEqual(['final', 'later']);
  });

  it('waits for all overlapping writes to the same control', async () => {
    const control = new FormControl('original');
    const publish = jasmine.createSpy('publish');
    let completeFirst!: () => void;
    let completeSecond!: () => void;
    const first = deferControlValueNotifications(control, async () => {
      publishControlValueNotification(control, publish);
      await new Promise<void>(resolve => { completeFirst = resolve; });
    });
    const second = deferControlValueNotifications(control, async () => {
      publishControlValueNotification(control, publish);
      await new Promise<void>(resolve => { completeSecond = resolve; });
    });

    completeFirst();
    await first;
    expect(publish).not.toHaveBeenCalled();
    completeSecond();
    await second;
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('releases notifications after a failed write and does not retain the deferral', async () => {
    const control = new FormControl('original');
    const publish = jasmine.createSpy('publish');
    await expectAsync(deferControlValueNotifications(control, async () => {
      publishControlValueNotification(control, publish);
      throw new Error('write failed');
    })).toBeRejectedWithError('write failed');

    expect(publish).toHaveBeenCalledTimes(1);
    publishControlValueNotification(control, publish);
    expect(publish).toHaveBeenCalledTimes(2);
  });
});
