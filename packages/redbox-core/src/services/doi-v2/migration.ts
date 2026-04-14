import _ from 'lodash';
import { DoiPublishing, createDefaultBinding, type DoiPublishingConfigData, type ValueBinding } from '../../configmodels/DoiPublishing';

type LegacyDataciteConfig = Record<string, unknown> & {
  baseUrl?: string;
  username?: string;
  password?: string;
  doiPrefix?: string;
  citationUrlProperty?: string;
  citationDoiProperty?: string;
  generatedCitationStringProperty?: string;
  citationStringTemplate?: string;
  creatorsProperty?: string;
  mappings?: Record<string, unknown>;
};

function isLikelyPathBinding(value: string): boolean {
  return /^[A-Za-z0-9_$.[\]]+$/.test(value.trim());
}

function convertLegacyStringBinding(
  value: unknown,
  notes: string[],
  label: string,
  fallbackPath: string = ''
): ValueBinding {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text !== '' && isLikelyPathBinding(text)) {
    return createDefaultBinding(text);
  }
  if (text !== '') {
    notes.push(`Legacy field '${label}' requires manual rewrite from lodash template syntax`);
  }
  return createDefaultBinding(fallbackPath, '');
}

export function buildMigratedDoiPublishingConfig(legacyConfig: LegacyDataciteConfig | undefined): DoiPublishingConfigData | null {
  if (legacyConfig == null || typeof legacyConfig !== 'object' || _.isEmpty(legacyConfig)) {
    return null;
  }

  const notes: string[] = [];
  const mappings = legacyConfig.mappings ?? {};
  const profileName = 'dataPublication';
  const migrated = new DoiPublishing();
  migrated.enabled = false;
  migrated.defaultProfile = profileName;
  migrated.connection.baseUrl = String(legacyConfig.baseUrl ?? migrated.connection.baseUrl);
  migrated.connection.username = String(legacyConfig.username ?? '');
  migrated.connection.password = String(legacyConfig.password ?? '');
  migrated.migration = {
    source: 'legacyDatacite',
    requiresTemplateReview: true,
    migratedAt: new Date().toISOString(),
    notes
  };
  migrated.profiles = {
    [profileName]: {
      enabled: false,
      label: 'Legacy data publication',
      metadata: {
        prefix: convertLegacyStringBinding(legacyConfig.doiPrefix, notes, 'doiPrefix'),
        url: convertLegacyStringBinding(mappings['url'], notes, 'mappings.url', 'record.metadata.citation_url'),
        publicationYear: convertLegacyStringBinding(mappings['publicationYear'], notes, 'mappings.publicationYear'),
        publisher: convertLegacyStringBinding(mappings['publisher'], notes, 'mappings.publisher'),
        creators: [{
          sourcePath: String(legacyConfig.creatorsProperty ?? 'metadata.creators'),
          itemMode: 'array',
          name: createDefaultBinding('item.text_full_name', ''),
          givenName: convertLegacyStringBinding(mappings['creatorGivenName'], notes, 'mappings.creatorGivenName', 'item.given_name'),
          familyName: convertLegacyStringBinding(mappings['creatorFamilyName'], notes, 'mappings.creatorFamilyName', 'item.family_name'),
          nameIdentifiers: [{
            nameIdentifier: convertLegacyStringBinding(mappings['creatorIdentifier'], notes, 'mappings.creatorIdentifier', 'item.orcid'),
            nameIdentifierScheme: createDefaultBinding('', 'ORCID'),
            schemeUri: createDefaultBinding('', 'https://orcid.org')
          }]
        }],
        titles: [{
          title: convertLegacyStringBinding(mappings['title'], notes, 'mappings.title')
        }],
        subjects: [],
        dates: [],
        rightsList: [],
        descriptions: [],
        fundingReferences: [],
        alternateIdentifiers: [],
        types: {
          resourceTypeGeneral: createDefaultBinding('', 'Dataset'),
          ris: createDefaultBinding('', 'DATA'),
          bibtex: createDefaultBinding('', 'misc'),
          citeproc: createDefaultBinding('', 'dataset'),
          schemaOrg: createDefaultBinding('', 'Dataset')
        }
      },
      writeBack: {
        citationUrlPath: String(legacyConfig.citationUrlProperty ?? 'metadata.citation_url'),
        citationDoiPath: String(legacyConfig.citationDoiProperty ?? 'metadata.citation_doi'),
        generatedCitationPath: String(legacyConfig.generatedCitationStringProperty ?? ''),
        citationString: convertLegacyStringBinding(legacyConfig.citationStringTemplate, notes, 'citationStringTemplate'),
        extraFields: []
      },
      validation: {
        requireUrl: true,
        requirePublisher: true,
        requirePublicationYear: true,
        requireCreators: true,
        requireTitles: true
      }
    }
  };
  return migrated;
}
