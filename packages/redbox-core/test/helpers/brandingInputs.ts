import { brandingFixtures } from './serviceRepositories';
import { getCacheEntryRepository } from '../../src/persistence/cache/runtime';
import { Services as Themes } from '../../src/branding/BrandingThemeCss';
import { Services as Typefaces } from '../../src/branding/BrandingTypeface';

/** Explicit collaborators for the existing branding repository contract fixtures. */
export function brandingInput(fixture: { config: any; log: any }, disk?: any) {
  const positiveInt = (key: string, fallback: number) => {
    const value = fixture.config.branding?.[key];
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
  };
  const shared = { repository: brandingFixtures(), log: fixture.log, positiveInt,
    get rootContext() { return fixture.config.http?.rootContext ?? ''; } };
  return { ...shared, cacheEntries: () => getCacheEntryRepository(), theme: new Themes.BrandingThemeCss(),
    typeface: new Typefaces.BrandingTypeface({ ...shared, disk: () => disk }),
    get previewTtlSeconds() { return fixture.config.branding?.previewTtlSeconds; } };
}
