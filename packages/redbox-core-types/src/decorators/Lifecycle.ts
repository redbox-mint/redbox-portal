import { LifecycleHook } from './types';
import { ensureMeta } from './registry';

function createLifecycleDecorator(hook: LifecycleHook) {
  return (handler: Function): ClassDecorator => {
    return target => {
      if (typeof handler !== 'function') {
        throw new Error(`${hook} decorator expects a function, received ${typeof handler}`);
      }
      const meta = ensureMeta(target);
      const current = meta.lifecycle[hook] ?? [];
      current.push(handler);
      meta.lifecycle[hook] = current;
    };
  };
}

export const BeforeCreate = createLifecycleDecorator('beforeCreate');
export const BeforeUpdate = createLifecycleDecorator('beforeUpdate');
export const BeforeDestroy = createLifecycleDecorator('beforeDestroy');
export const BeforeValidate = createLifecycleDecorator('beforeValidate');
export const AfterCreate = createLifecycleDecorator('afterCreate');
export const AfterUpdate = createLifecycleDecorator('afterUpdate');
export const AfterDestroy = createLifecycleDecorator('afterDestroy');
export const AfterValidate = createLifecycleDecorator('afterValidate');
