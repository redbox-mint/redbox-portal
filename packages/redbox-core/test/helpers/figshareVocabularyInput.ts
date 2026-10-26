import { getVocabularyRepositories } from '../../src/persistence/vocabulary/runtime';
import { createDomainFixture } from '../services/testHelper';

/** Local explicit inputs for vocabulary repository behavior scenarios. */
export function figshareVocabularyInput(environment = createDomainFixture()) {
  return {
    repository: getVocabularyRepositories(),
    get log() { return environment.log; },
    brandName: (id: string) => environment.collaborators.brandingservice?.getBrandById?.(id)?.name ?? id,
    defaultBrandId: () => String(environment.collaborators.brandingservice?.getDefault?.()?.id ?? 'default'),
    configuration: (name: string) => environment.configuration?.(name) ?? null,
    appConfiguration: (name: string) => environment.collaborators.appconfigservice?.getAppConfigurationForBrand?.(name),
    get bootstrapDataPath() { return environment.config.bootstrap?.bootstrapDataPath; },
    get bootstrapFigshareImports() { return environment.config.vocab?.bootstrapFigshareImports; },
  };
}
