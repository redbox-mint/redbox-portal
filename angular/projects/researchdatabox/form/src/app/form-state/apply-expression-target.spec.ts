import { FormControl } from '@angular/forms';
import { LoggerService } from '@researchdatabox/portal-ng-common';
import { applyExpressionTarget, ApplyExpressionTargetContext, ExpressionTargetHost } from './apply-expression-target';
import { FormComponentEventType } from './events/form-component-event.types';

/**
 * Unit coverage for the shared expression-target application helper used by
 * both component expressions (`setTarget`) and behaviour actions
 * (`setUIProperty` / `setUIProperties` / `runTemplate` instructions).
 */
describe('applyExpressionTarget', () => {
  let logger: jasmine.SpyObj<LoggerService>;
  let eventBus: { publish: jasmine.Spy };
  let broadcastFormStatus: jasmine.Spy;
  let ctx: ApplyExpressionTargetContext;
  let host: ExpressionTargetHost & {
    model: { formControl: FormControl; setDisabled: jasmine.Spy };
    component: { setProperty: jasmine.Spy };
    layout: { setProperty: jasmine.Spy };
  };

  beforeEach(() => {
    logger = jasmine.createSpyObj<LoggerService>('LoggerService', ['debug', 'warn', 'error']);
    eventBus = { publish: jasmine.createSpy('publish') };
    broadcastFormStatus = jasmine.createSpy('broadcastFormStatus');
    ctx = {
      eventBus: eventBus as any,
      logger,
      broadcastFormStatus,
      eventFieldId: '/main/source',
    };
    host = {
      model: {
        formControl: new FormControl<unknown>('initial'),
        setDisabled: jasmine.createSpy('setDisabled'),
      },
      component: { setProperty: jasmine.createSpy('componentSetProperty') },
      layout: { setProperty: jasmine.createSpy('layoutSetProperty') },
    } as any;
  });

  it('sets model.value silently and re-broadcasts form status', async () => {
    await applyExpressionTarget('model.value', 'updated', host, ctx);

    expect(host.model.formControl.value).toBe('updated');
    expect(broadcastFormStatus).toHaveBeenCalledTimes(1);
  });

  it('does not touch model.value when the value is unchanged', async () => {
    await applyExpressionTarget('model.value', 'initial', host, ctx);

    expect(broadcastFormStatus).not.toHaveBeenCalled();
  });

  it('sets model.disabled via the model with silent options', async () => {
    await applyExpressionTarget('model.disabled', true, host, ctx);

    expect(host.model.setDisabled).toHaveBeenCalledWith(true, { emitEvent: false, onlySelf: true });
  });

  it('sets layout.* properties on the layout component', async () => {
    await applyExpressionTarget('layout.cssClasses', 'highlight', host, ctx);

    expect(host.layout.setProperty).toHaveBeenCalledWith('cssClasses', 'highlight');
    expect(host.component.setProperty).not.toHaveBeenCalled();
  });

  it('sets component.* properties on the component', async () => {
    await applyExpressionTarget('component.helpText', 'hi', host, ctx);

    expect(host.component.setProperty).toHaveBeenCalledWith('helpText', 'hi');
    expect(host.layout.setProperty).not.toHaveBeenCalled();
  });

  it('field.visible sets both component.visible and layout.visible', async () => {
    await applyExpressionTarget('field.visible', false, host, ctx);

    expect(host.component.setProperty).toHaveBeenCalledWith('visible', false);
    expect(host.layout.setProperty).toHaveBeenCalledWith('visible', false);
  });

  it('field.disabled sets component, layout, and model disabled', async () => {
    await applyExpressionTarget('field.disabled', true, host, ctx);

    expect(host.component.setProperty).toHaveBeenCalledWith('disabled', true);
    expect(host.layout.setProperty).toHaveBeenCalledWith('disabled', true);
    expect(host.model.setDisabled).toHaveBeenCalledWith(true, { emitEvent: false, onlySelf: true });
  });

  it('publishes a validation-groups change request for valid values', async () => {
    await applyExpressionTarget(
      'form.enabledValidationGroups',
      { groups: { include: ['minimal'] } },
      host,
      ctx
    );

    expect(eventBus.publish).toHaveBeenCalledWith(
      jasmine.objectContaining({
        type: FormComponentEventType.FORM_VALIDATION_CHANGE_REQUEST,
        sourceId: '*',
        fieldId: '/main/source',
        groups: { include: ['minimal'] },
      })
    );
  });

  it('logs an error for invalid validation-groups values', async () => {
    await applyExpressionTarget('form.enabledValidationGroups', 'not-valid', host, ctx);

    expect(eventBus.publish).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it('warns on unknown targets', async () => {
    await applyExpressionTarget('nonsense.target', 'x', host, ctx);

    expect(logger.warn).toHaveBeenCalled();
  });

  it('tolerates hosts without model, component, or layout', async () => {
    await applyExpressionTarget('field.disabled', true, {}, ctx);
    await applyExpressionTarget('model.value', 'x', {}, ctx);

    expect(broadcastFormStatus).not.toHaveBeenCalled();
  });
});
