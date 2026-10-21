import { cloneDeep } from 'lodash';
import { PublicationProposal, publicationExecutionProposal, publicationResourceProposal } from './proposal';
import { attestPublicationOperation } from './attestation';
import type {
  PublicationObject,
  PublicationProvider,
  PublicationProviderDefinition,
  PublicationProviderExecution,
  PublicationProviderOutcome,
  PublicationSourcePreparation,
  PublicationValidationResult,
  PublicationProviderSourceInputs,
  PublicationObservation,
  PublicationRepairContext,
  PublicationRepairResult,
} from './contracts';

export type PublicationExecutionAction = 'reconcile' | 'synchronise' | 'observe';
export interface RegisteredPublicationProvider extends PublicationProviderDefinition {
  readonly executionAvailable: boolean;
  administrativeResources?: (configuration: PublicationObject) => readonly { namespace: string; resourceKey: string }[];
  readonly repairs?: readonly { id: string; description: string }[];
  repair?: (id: string, context: PublicationRepairContext, version: number) => Promise<PublicationRepairResult>;
  decodeState?: (value: unknown, version: number) => { state: PublicationObject; version: number };
  prepareSource?: (
    input: PublicationSourcePreparation<PublicationObject>
  ) => Promise<PublicationValidationResult<PublicationObject>>;
  describeSource?: (
    input: PublicationSourcePreparation<PublicationObject>,
    prepared: PublicationObject
  ) => Promise<PublicationProviderSourceInputs>;
  summariseStatus?: (value: unknown, version: number) => PublicationObservation;
  sourceMaintenancePaths?: (configuration: PublicationObject) => readonly string[];
  postCompletionReplacement?: {
    readonly capability: 'attachment-to-url';
    readonly receiptField: string;
    path(configuration: PublicationObject): string | undefined;
    entries(
      state: PublicationObject,
      version: number,
      approvalId: string,
      generation: number
    ): import('./contracts').PublicationJson[] | undefined;
  };
  execute?: (
    action: PublicationExecutionAction,
    context: PublicationProviderExecution<PublicationObject, PublicationObject, PublicationObject>,
    stateVersion: number,
    proposal?: PublicationProposal
  ) => Promise<PublicationProviderOutcome<PublicationObject>>;
}

/** Host-owned publication implementation; extend through PublicationService and adapter contexts. @internal */
export class PublicationProviderRegistry {
  private readonly providers = new Map<string, RegisteredPublicationProvider>();
  private frozen = false;

  public registerDefinition<Config extends PublicationObject>(definition: PublicationProviderDefinition<Config>): void {
    this.assertContract(definition);
    this.add(definition, { executionAvailable: false });
  }

  public register<
    Config extends PublicationObject,
    State extends PublicationObject,
    Prepared extends PublicationObject,
  >(provider: PublicationProvider<Config, State, Prepared>): void {
    this.assertContract(provider);
    if (provider.mutationRecovery?.mode === 'no-remote-lookup' && typeof provider.attestOperation !== 'function')
      throw new Error('A provider without remote lookup requires executable operator attestation');
    const attestationRepair = provider.attestOperation
      ? [
          {
            id: 'attest-operation',
            description: 'Attest an exact settled submission using an external receipt or certified non-application.',
          },
        ]
      : [];
    if (provider.repairs.some(repair => repair.id === 'attest-operation'))
      throw new Error('attest-operation is a host-owned repair ID');
    this.add(provider, {
      executionAvailable: true,
      ...(provider.postCompletionReplacement
        ? {
            postCompletionReplacement: {
              capability: provider.postCompletionReplacement.capability,
              receiptField: provider.postCompletionReplacement.receiptField,
              path: (configuration: PublicationObject) => {
                const config = provider.validateConfiguration(cloneDeep(configuration));
                if (!config.valid) throw new Error('Invalid publication replacement configuration');
                return provider.postCompletionReplacement!.path(config.value);
              },
              entries: (value: PublicationObject, version: number, approvalId: string, generation: number) => {
                const state =
                  version === provider.stateVersion
                    ? provider.decodeState(cloneDeep(value), version)
                    : provider.upgradeState(cloneDeep(value), version);
                if (!state.valid) throw new Error('Invalid publication replacement state');
                return cloneDeep(provider.postCompletionReplacement!.entries(state.value, approvalId, generation));
              },
            },
          }
        : {}),
      ...(provider.administrativeResources
        ? {
            administrativeResources: (configuration: PublicationObject) => {
              const config = provider.validateConfiguration(cloneDeep(configuration));
              if (!config.valid) throw new Error('Invalid publication resource configuration');
              return cloneDeep(provider.administrativeResources!(config.value));
            },
          }
        : {}),
      repairs: Object.freeze(
        [...provider.repairs, ...attestationRepair].map(({ id, description }) => Object.freeze({ id, description }))
      ),
      repair: async (id, context, version) => {
        const repair = provider.repairs.find(repair => repair.id === id);
        if (!repair?.run && !(id === 'attest-operation' && provider.attestOperation))
          throw new Error('Unsupported publication provider repair');
        const config = provider.validateConfiguration(cloneDeep(context.configuration));
        const state =
          version === provider.stateVersion
            ? provider.decodeState(cloneDeep(context.state), version)
            : provider.upgradeState(cloneDeep(context.state), version);
        if (
          !Number.isSafeInteger(version) ||
          version < 1 ||
          version > provider.stateVersion ||
          !config.valid ||
          !state.valid
        )
          throw new Error('Invalid publication repair input; evidence retained');
        const typedContext: PublicationRepairContext<Config, State> = {
          ...context,
          configuration: config.value,
          state: state.value,
          binding: cloneDeep(context.binding),
          operations: cloneDeep(context.operations),
          source: cloneDeep(context.source),
          parameters: cloneDeep(context.parameters),
          reconcile: async () => {
            const result = await context.reconcile();
            const state = provider.decodeState(cloneDeep(result.state), provider.stateVersion);
            if (!state.valid) throw new Error('Invalid reconciled provider state; evidence retained');
            return cloneDeep({ ...result, state: state.value });
          },
        };
        const proposal = new PublicationProposal();
        const guarded: PublicationRepairContext<Config, State> = {
          ...typedContext,
          reconcile: () => proposal.run(() => typedContext.reconcile()),
          withResourceLease: publicationResourceProposal(proposal, (namespace, key, run) =>
            typedContext.withResourceLease(namespace, key, run)
          ),
        };
        let result: PublicationRepairResult<State>;
        try {
          result =
            id === 'attest-operation'
              ? await attestPublicationOperation(guarded, provider.id, async context =>
                  provider.attestOperation!({ ...cloneDeep(context), configuration: cloneDeep(config.value) })
                )
              : await repair!.run!(guarded);
          result = cloneDeep(result);
          await proposal.finish();
        } catch (error) {
          await proposal.finish();
          throw error;
        }
        const decoded = provider.decodeState(result.state, provider.stateVersion);
        if (!decoded.valid) throw new Error('Invalid publication repair result; evidence retained');
        return cloneDeep({ ...result, state: decoded.value });
      },
      ...(provider.sourceMaintenancePaths
        ? {
            sourceMaintenancePaths: (configuration: PublicationObject) => {
              const config = provider.validateConfiguration(cloneDeep(configuration));
              if (!config.valid) throw new Error('Invalid publication maintenance configuration');
              return cloneDeep(provider.sourceMaintenancePaths!(config.value));
            },
          }
        : {}),
      decodeState: (value, version) => {
        if (!Number.isSafeInteger(version) || version < 1 || version > provider.stateVersion)
          throw new Error('Unsupported publication provider state version; evidence retained');
        const result =
          version === provider.stateVersion
            ? provider.decodeState(cloneDeep(value), version)
            : provider.upgradeState(cloneDeep(value), version);
        if (!result.valid) throw new Error('Invalid publication provider state; evidence retained');
        return { state: cloneDeep(result.value), version: provider.stateVersion };
      },
      ...(provider.summariseStatus
        ? {
            summariseStatus: (value: unknown, version: number) => {
              if (!Number.isSafeInteger(version) || version < 1 || version > provider.stateVersion)
                throw new Error('Unsupported publication provider status version');
              const result =
                version === provider.stateVersion
                  ? provider.decodeState(cloneDeep(value), version)
                  : provider.upgradeState(cloneDeep(value), version);
              if (!result.valid) throw new Error('Invalid publication provider status state');
              return cloneDeep(provider.summariseStatus!(result.value));
            },
          }
        : {}),
      prepareSource: async input => {
        const isolated = cloneDeep(input);
        const config = provider.validateConfiguration(isolated.configuration);
        if (!config.valid) return cloneDeep(config);
        const result = cloneDeep(await provider.prepareSource({ ...isolated, configuration: config.value }));
        // Providers may allocate stable, non-secret values only in their own
        // destination namespace. Existing allocations and host values cannot be replaced.
        if (result.valid)
          for (const [key, value] of Object.entries(isolated.generatedValues))
            if (key.startsWith(`${provider.id}:${input.destinationId}:`) && !Object.hasOwn(input.generatedValues, key))
              input.generatedValues[key] = cloneDeep(value);
        return result;
      },
      ...(provider.describeSource
        ? {
            describeSource: async (
              input: PublicationSourcePreparation<PublicationObject>,
              prepared: PublicationObject
            ) => {
              const isolated = cloneDeep(input);
              const config = provider.validateConfiguration(isolated.configuration);
              const source = provider.decodePreparedSource(cloneDeep(prepared));
              if (!config.valid || !source.valid) throw new Error('Invalid publication source dependency input');
              return cloneDeep(
                await provider.describeSource!({ ...isolated, configuration: config.value }, source.value)
              );
            },
          }
        : {}),
      execute: async (action, context, stateVersion, proposal) => {
        if (stateVersion > provider.stateVersion || !Number.isSafeInteger(stateVersion) || stateVersion < 1)
          throw new Error('Unsupported publication provider state version');
        const config = provider.validateConfiguration(cloneDeep(context.configuration));
        const state =
          stateVersion === provider.stateVersion
            ? provider.decodeState(cloneDeep(context.state), stateVersion)
            : provider.upgradeState(cloneDeep(context.state), stateVersion);
        const prepared = provider.decodePreparedSource(cloneDeep(context.prepared));
        if (!config.valid || !state.valid || !prepared.valid)
          throw new Error('Publication provider input validation failed');
        const guarded = publicationExecutionProposal<Config, State, Prepared>(
          {
            ...context,
            configuration: config.value,
            state: state.value,
            prepared: prepared.value,
            credentials: cloneDeep(context.credentials),
            approval: cloneDeep(context.approval),
            source: cloneDeep(context.source),
            recoverySources: cloneDeep(context.recoverySources),
            operations: cloneDeep(context.operations),
            binding: cloneDeep(context.binding),
            persistenceIdentity: cloneDeep(context.persistenceIdentity),
          },
          proposal
        );
        try {
          const outcome = cloneDeep(await provider[action](guarded.context));
          await guarded.proposal.finish();
          return outcome;
        } catch (error) {
          await guarded.proposal.finish();
          throw error;
        }
      },
    });
  }

  private assertContract(definition: PublicationProviderDefinition): void {
    if (definition.contractVersion !== 2)
      throw new Error(
        `Publication provider '${definition.id}' contract version ${definition.contractVersion} is unsupported; expected 2 (structured operation evidence). Update the adapter and drain older workers before deployment.`
      );
  }

  private add<Config extends PublicationObject>(
    definition: PublicationProviderDefinition<Config>,
    execution: Partial<RegisteredPublicationProvider> & Pick<RegisteredPublicationProvider, 'executionAvailable'>
  ): void {
    if (this.frozen) throw new Error('Publication provider registry is frozen');
    if (
      !/^[a-z][a-z0-9-]*$/.test(definition.id) ||
      !Number.isSafeInteger(definition.stateVersion) ||
      definition.stateVersion < 1
    )
      throw new Error('Invalid publication provider identity or contract version');
    if (!['idempotency-key', 'no-remote-lookup'].includes(definition.mutationRecovery?.mode))
      throw new Error('Publication provider must declare mutation recovery support');
    // Even compatible duplicates are ambiguous: there must be one owner of an ID.
    if (this.providers.has(definition.id)) throw new Error(`Duplicate publication provider '${definition.id}'`);
    for (const path of definition.secretPaths) {
      if (
        !/^[a-zA-Z][a-zA-Z0-9_-]*(\.(?:[a-zA-Z][a-zA-Z0-9_-]*|\*))*$/.test(path) ||
        path.split('.').some(part => ['__proto__', 'constructor', 'prototype'].includes(part))
      )
        throw new Error('Invalid publication provider secret path');
    }
    this.providers.set(
      definition.id,
      Object.freeze({
        id: definition.id,
        contractVersion: definition.contractVersion,
        stateVersion: definition.stateVersion,
        configurationSchema: cloneDeep(definition.configurationSchema),
        secretPaths: Object.freeze([...definition.secretPaths]),
        capabilities: Object.freeze({ ...definition.capabilities }),
        mutationRecovery: Object.freeze({ ...definition.mutationRecovery }),
        validateConfiguration: (value: unknown) => cloneDeep(definition.validateConfiguration(cloneDeep(value))),
        targetFingerprint: (value: PublicationObject) => {
          const config = definition.validateConfiguration(cloneDeep(value));
          if (!config.valid) throw new Error(`Invalid configuration for publication provider '${definition.id}'`);
          return definition.targetFingerprint(config.value);
        },
        ...execution,
      })
    );
  }

  public freeze(): void {
    this.frozen = true;
  }
  public decodeState(id: string, value: unknown, version: number): { state: PublicationObject; version: number } {
    const provider = this.providers.get(id);
    if (!provider?.decodeState) throw new Error('Publication provider state decoder is unavailable; evidence retained');
    return provider.decodeState(cloneDeep(value), version);
  }
  public get(id: string): RegisteredPublicationProvider | undefined {
    return this.providers.get(id);
  }
  public list(): readonly RegisteredPublicationProvider[] {
    return [...this.providers.values()];
  }
}
