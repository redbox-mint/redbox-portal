import type {
  PublicationObject,
  PublicationOperation,
  PublicationProvider,
  PublicationProviderExecution,
  PublicationRepairContext,
  PublicationRepairResult,
} from '@researchdatabox/redbox-core';

export type AdversarialExecution = PublicationProviderExecution<
  PublicationObject,
  PublicationObject,
  PublicationObject
>;
type Adapter = PublicationProvider<PublicationObject, PublicationObject, PublicationObject>;

/** Deliberately uncooperative adapter. Hooks retain and mutate inputs, swallow refusals and schedule late calls. */
export class AdversarialPublicationAdapter {
  readonly provider: Adapter;
  execute?: Adapter['synchronise'];
  prepare?: Adapter['prepareSource'];
  describe?: Adapter['describeSource'];
  decode?: Adapter['decodeState'];
  upgrade?: Adapter['upgradeState'];
  repair?: (id: string, context: PublicationRepairContext) => Promise<PublicationRepairResult>;
  attest?: Adapter['attestOperation'];
  replacement?: NonNullable<Adapter['postCompletionReplacement']>['entries'];
  readonly accepted: string[] = [];
  readonly refused: string[] = [];
  readonly late: Promise<void>[] = [];

  constructor(base: Adapter) {
    this.provider = {
      ...base,
      prepareSource: input => (this.prepare ?? base.prepareSource)(input),
      ...(base.describeSource
        ? { describeSource: (input, prepared) => (this.describe ?? base.describeSource!)(input, prepared) }
        : {}),
      decodeState: (value, version) => (this.decode ?? base.decodeState)(value, version),
      upgradeState: (value, version) => (this.upgrade ?? base.upgradeState)(value, version),
      synchronise: context => (this.execute ?? base.synchronise)(context),
      observe: context => (this.execute ?? base.observe)(context),
      reconcile: context => (this.execute ?? base.reconcile)(context),
      ...(base.attestOperation
        ? { attestOperation: (context: PublicationRepairContext) => (this.attest ?? base.attestOperation!)(context) }
        : {}),
      repairs: base.repairs.map(repair => ({
        ...repair,
        ...(repair.run
          ? {
              run: (context: PublicationRepairContext) =>
                this.repair ? this.repair(repair.id, context) : repair.run!(context),
            }
          : {}),
      })),
      ...(base.postCompletionReplacement
        ? {
            postCompletionReplacement: {
              ...base.postCompletionReplacement,
              entries: (state, approval, generation) =>
                (this.replacement ?? base.postCompletionReplacement!.entries)(state, approval, generation),
            },
          }
        : {}),
    };
  }

  async swallow(label: string, run: () => unknown): Promise<void> {
    try {
      await run();
      this.accepted.push(label);
    } catch {
      this.refused.push(label);
    }
  }

  async callbacks(context: AdversarialExecution, operation: PublicationOperation): Promise<void> {
    await this.swallow('checkpoint', () => context.checkpoint({ escaped: true }));
    await this.swallow('acknowledge', () => context.checkpoint({ escaped: true }, [operation.id]));
    await this.swallow('journal', () => context.journal(operation));
    await this.swallow('mutate', () =>
      context.mutate({ ...operation, id: 'escaped-send' }, async () => this.accepted.push('send'))
    );
    await this.swallow('audit', () => context.audit({ category: 'escaped', message: 'Escaped callback' }));
    await this.swallow('authority', () => context.assertAuthority());
    await this.swallow('project', () => context.project({ 'metadata.escaped': true }));
    await this.swallow('bind', () =>
      context.bind({ namespace: 'foreign', objectId: 'foreign', targetFingerprint: 'foreign', evidence: {} })
    );
    await this.swallow('attachment', () => context.openAttachment('foreign', 'foreign'));
    await this.swallow('key', () => context.idempotencyKey(operation));
    await this.swallow('resource', () =>
      context.withResourceLease('foreign', 'foreign', async () => this.accepted.push('resource-run'))
    );
  }

  later(run: () => Promise<void>): void {
    this.late.push(
      new Promise<void>((resolve, reject) =>
        setTimeout(() => {
          void run().then(resolve, reject);
        }, 0)
      )
    );
  }
  async flush(): Promise<void> {
    await Promise.all(this.late);
  }
}
