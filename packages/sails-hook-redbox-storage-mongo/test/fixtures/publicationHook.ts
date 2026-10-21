import {
  PublicationService,
  type PublicationConfigurationContext,
  type StorageService,
} from '@researchdatabox/redbox-core';
import { accessionProvider } from '../../../../support/documentation/examples/publication-provider';

let remoteLookup = true;
export function setFixtureRemoteLookup(enabled: boolean): void {
  remoteLookup = enabled;
}
export const attestedAccessionProvider: typeof accessionProvider = {
  ...accessionProvider,
  mutationRecovery: { mode: 'no-remote-lookup' },
  async reconcile(context) {
    if (context.operations.some(op => ['submitted', 'uncertain'].includes(op.outcome)))
      return {
        kind: 'repair_required',
        state: context.state,
        reason: 'external_submission_receipt_required',
        evidence: {},
      };
    return accessionProvider.reconcile(context);
  },
};
let verifiedTargets: Record<string, string> = {};
export function setFixtureTargets(targets: Record<string, string>): void {
  verifiedTargets = { ...targets };
}
/** Only the migration-authority boundary is supplied by the harness; registration and all processing are real. */
class FixturePublication extends PublicationService.Services.Publication {
  protected override configureProviders(): void {
    super.configureProviders();
    this.registerProvider(remoteLookup ? accessionProvider : attestedAccessionProvider);
  }
  protected override async sourceConfigurationContext(
    _brandId: string,
    storage: StorageService
  ): Promise<PublicationConfigurationContext> {
    return { authority: 'shared', publicationStorage: storage, verifiedTargets: { ...verifiedTargets } };
  }
}
export function registerRedboxServices() {
  return { PublicationService: new FixturePublication().exports() };
}
export const ServiceExports = registerRedboxServices();
