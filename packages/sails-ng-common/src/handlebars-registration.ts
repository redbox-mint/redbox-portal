import type Handlebars from 'handlebars';
import { handlebarsHelperDefinitions } from './handlebars-helper-definitions';

// Registration is explicit and per instance. Importing the package never changes
// a Handlebars registry, and subsequent calls preserve hook-registered overrides.
const registeredInstances = new WeakSet<object>();

export function registerHandlebarsHelpers(instance: Pick<typeof Handlebars, 'registerHelper'>): void {
  if (registeredInstances.has(instance)) return;
  for (const [name, helper] of Object.entries(handlebarsHelperDefinitions)) {
    instance.registerHelper(name, helper);
  }
  registeredInstances.add(instance);
}
