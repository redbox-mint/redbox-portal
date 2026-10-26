import type { ApplicationModule } from '../Application';
import type { ExtensionFactory } from '../../extensions/contract';
import type { ResolvedRegistration } from '../../extensions/resolution';

/** A selected domain and its owned lifecycle. Overrides return the same concrete domain contract. */
export interface PortalDomainModule<Domain> extends ApplicationModule {
  readonly value: Domain;
}
export interface PortalDomainPlan<Input, Domain> {
  readonly declaration: ExtensionFactory<Input, PortalDomainModule<Domain>>;
  get(): Domain;
  bind(registration: ResolvedRegistration<ExtensionFactory>): () => ApplicationModule;
}

/** The resolver erases factory-specific inputs. This boundary restores the named contract. */
export function portalDomain<Input, Domain extends object>(
  name: string,
  requires: readonly string[],
  construct: (input: Input) => Domain,
  lifecycle: (value: Domain) => ApplicationModule,
  accepts: (value: unknown) => value is Domain,
  input: () => Input
): PortalDomainPlan<Input, Domain> {
  let value: Domain | undefined;
  const declaration: ExtensionFactory<Input, PortalDomainModule<Domain>> = {
    name,
    requires,
    create: input => {
      const value = construct(input);
      const resource = lifecycle(value);
      return {
        value,
        initialize: () => resource.initialize(),
        activate: () => resource.activate?.() ?? Promise.resolve(),
        quiesce: () => resource.quiesce?.(),
        drain: options => resource.drain?.(options) ?? Promise.resolve(),
        close: () => resource.close(),
      };
    },
  };
  return {
    declaration,
    get(): Domain {
      if (!value) throw new Error(`Portal domain ${name} is unavailable before module initialization.`);
      return value;
    },
    bind(registration: ResolvedRegistration<ExtensionFactory>): () => ApplicationModule {
      if (registration.declaration.name !== name) throw new Error('Incorrect portal factory binding.');
      return () => {
        // Named overrides are typed against this public input/output contract. No
        // application-wide container or unselected default instance is supplied.
        const create = registration.declaration.create as (input: Input) => PortalDomainModule<unknown>;
        const module = create(input());
        if (
          !module ||
          typeof module.initialize !== 'function' ||
          typeof module.close !== 'function' ||
          !accepts(module.value)
        )
          throw new Error(`Selected portal domain ${name} does not implement its declared contract.`);
        value = module.value;
        return {
          initialize: () => module.initialize(),
          activate: () => module.activate?.() ?? Promise.resolve(),
          quiesce: () => module.quiesce?.(),
          drain: options => module.drain?.(options) ?? Promise.resolve(),
          close: async () => {
            await module.close();
            value = undefined;
          },
        };
      };
    },
  };
}

export const noDomainResources = (): ApplicationModule => ({ initialize: async () => {}, close: async () => {} });
