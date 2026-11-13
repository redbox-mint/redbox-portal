// Compile against the emitted package entry points consumed by institution hooks.
import type {
  BrandAuthAafConfig,
  BrandAuthOidcConfig,
  I18nNextInitConfig,
  ReusableFormDefinitions as CoreReusableFormDefinitions,
  SolrPreIndexConfig,
  SolrPreIndexJsonStringConfig,
} from '@researchdatabox/redbox-core';
import type {
  AvailableFormComponentDefinitionFrames,
  FormConfigFrame,
  ReusableFormComponentDefinitionFrame,
  ReusableFormDefinitions,
} from '@researchdatabox/sails-ng-common';

export const runtimeConfigFixtures = {
  aaf: [{ loginUrl: 'https://rapid.aaf.edu.au/jwt/authnrequest/example' }, {}] satisfies Pick<
    BrandAuthAafConfig,
    'loginUrl'
  >[],
  oidc: [
    { claimMappingOptions: { usernameToLowercase: true } },
    { claimMappingOptions: { usernameToLowercase: false } },
    { claimMappingOptions: {} },
    {},
  ] satisfies Pick<BrandAuthOidcConfig, 'claimMappingOptions'>[],
  solr: [
    { jsonString: [{ source: 'metadata.contributors' }, { source: 'metadata', dest: 'metadata_json' }] },
    { jsonString: [] },
    {},
  ] satisfies SolrPreIndexConfig[],
  i18next: [
    { defaultNS: 'translation' },
    { defaultNS: ['translation', 'institution'] },
    { defaultNS: ['translation', 'institution'] as const },
    { defaultNS: false },
    {},
  ] satisfies Pick<I18nNextInitConfig, 'defaultNS'>[],
};

// Reusable placeholders already belong to master's frame union. Keep this
// coverage so changes cannot silently remove support for nested placeholders.
export const reusableFixtures = {
  field: [{ name: 'title', component: { class: 'SimpleInputComponent', config: { label: 'Title' } } }],
  alias: [{ name: 'alias', component: { class: 'ReusableComponent' }, overrides: { reusableFormName: 'field' } }],
  customised: [
    {
      name: 'customised',
      component: {
        class: 'ReusableComponent',
        config: {
          componentDefinitions: [
            {
              name: 'title',
              component: { class: 'SimpleInputComponent', config: { label: 'Custom title' } },
              overrides: { replaceName: 'custom_title' },
            },
          ],
        },
      },
      overrides: { reusableFormName: 'alias' },
    },
  ],
} satisfies ReusableFormDefinitions;

export const coreReusableFixtures: CoreReusableFormDefinitions = reusableFixtures;
export const placeholder: ReusableFormComponentDefinitionFrame = reusableFixtures.alias[0];
export const componentFrames: AvailableFormComponentDefinitionFrames[] = [placeholder];
export const form: Pick<FormConfigFrame, 'componentDefinitions'> = { componentDefinitions: componentFrames };

// @ts-expect-error Login URLs must be strings.
export const invalidAaf: Pick<BrandAuthAafConfig, 'loginUrl'> = { loginUrl: true };
export const invalidOidc: Pick<BrandAuthOidcConfig, 'claimMappingOptions'> = {
  // @ts-expect-error The supported mapping option is a boolean, not a string flag.
  claimMappingOptions: { usernameToLowercase: 'true' },
};
export const unknownOidc: Pick<BrandAuthOidcConfig, 'claimMappingOptions'> = {
  // @ts-expect-error Unknown claim mapping options are not part of the contract.
  claimMappingOptions: { lowercaseEmail: true },
};
// @ts-expect-error JSON serialisation needs a source path.
export const missingSource: SolrPreIndexJsonStringConfig = { dest: 'metadata_json' };
// @ts-expect-error Destination paths must be strings.
export const invalidDestination: SolrPreIndexConfig = { jsonString: [{ source: 'metadata', dest: false }] };
// @ts-expect-error jsonString is a list of transforms, not a single transform.
export const invalidTransform: SolrPreIndexConfig = { jsonString: { source: 'metadata' } };
// @ts-expect-error Only false disables the default namespace.
export const invalidNamespace: Pick<I18nNextInitConfig, 'defaultNS'> = { defaultNS: true };
// @ts-expect-error Reusable definitions are lists of component frames.
export const invalidReusableList: ReusableFormDefinitions = { alias: placeholder };
export const invalidPlaceholder: ReusableFormComponentDefinitionFrame = {
  name: 'alias',
  // @ts-expect-error A placeholder must use the known ReusableComponent class.
  component: { class: 'UnknownComponent' },
};
export const invalidPlaceholderModel: ReusableFormComponentDefinitionFrame = {
  name: 'alias',
  component: { class: 'ReusableComponent' },
  // @ts-expect-error Reusable placeholders do not directly own a model.
  model: { class: 'SimpleInputModel' },
};
export const invalidInput: AvailableFormComponentDefinitionFrames = {
  name: 'title',
  // @ts-expect-error Concrete components still enforce their own config shape.
  component: { class: 'SimpleInputComponent', config: { placeholder: 42 } },
};

// Related resolution opt-ins use only public package contracts.
import type {
  RelatedMetadata, RelatedMetadataRequest, RelatedRecordReadContext, RecordsService,
  RecordModel, RecordRelation,
} from '@researchdatabox/redbox-core';
import type {
  RelatedObjectDataFormComponentDefinitionFrame, ValidationOperationDefinition,
  ValidationOperationOverride,
} from '@researchdatabox/sails-ng-common';

export const relatedRequest = { relations: [{ relationId: 'activities', required: true }] } satisfies RelatedMetadataRequest;
export const relatedRelation = {
  id: 'activities', recordType: 'activity', localField: 'metadata.activities',
  foreignField: 'redboxOid', cardinality: 'many', oidProperty: 'oid',
  resolution: { metadataFields: ['/title', '/literal.key', '/slash~1key', '/tilde~0key'] },
} satisfies RecordRelation;
export const legacyRelation = { recordType: 'activity', foreignField: 'redboxOid' } satisfies RecordRelation;
export const relatedComponent = {
  name: 'activityData', component: { class: 'RelatedObjectDataComponent', config: { relationId: 'activities', required: false } },
} satisfies RelatedObjectDataFormComponentDefinitionFrame;
export const displayComponent = {
  name: 'title', relatedDisplay: { relationId: 'activities' }, component: { class: 'SimpleInputComponent' },
} satisfies AvailableFormComponentDefinitionFrames;
export const relatedOperation = { enabledValidationGroups: [], relatedMetadata: relatedRequest } satisfies ValidationOperationDefinition;
export const relatedOverride = { relatedMetadata: relatedRequest } satisfies ValidationOperationOverride;
export const relatedResult = {
  activities: { status: 'resolved', records: [{ redboxOid: 'activity-a', metaMetadata: { type: 'activity', brandId: 'test' }, metadata: { title: '', nullable: null, enabled: false, rows: [] } }], issues: [] },
} satisfies RelatedMetadata;

// @ts-expect-error A related source is model-free.
export const invalidRelatedModel: RelatedObjectDataFormComponentDefinitionFrame['model'] = {};
// @ts-expect-error The request cannot choose field projections.
export const invalidRelatedSelection: RelatedMetadataRequest = { relations: [{ relationId: 'activities', metadataFields: ['/secret'] }] };
// @ts-expect-error Service reads require an identified caller and a real principal.
export const invalidServiceContext: RelatedRecordReadContext = { audience: 'service' };
export function relatedSignatures(service: RecordsService, record: Readonly<RecordModel>, context: RelatedRecordReadContext): void {
  const resolved: Promise<RelatedMetadata> = service.resolveRelatedMetadata(record, context, relatedRequest);
  const enriched: Promise<RecordModel> = service.enrichWithRelatedMetadata(record, context, relatedRequest);
  const loaded: Promise<RecordModel> = service.getMetaWithRelatedMetadata(record.redboxOid, context, relatedRequest);
  void [resolved, enriched, loaded];
}

export function relatedContextTypeChecks(brand: RelatedRecordReadContext['brand'], user: RelatedRecordReadContext['user']): void {
  const browser: RelatedRecordReadContext = { brand, user, audience: 'browser' };
  const service: RelatedRecordReadContext = { brand, user, audience: 'service', serviceId: 'email' };
  // @ts-expect-error A service audience requires its calling service identity.
  const missingService: RelatedRecordReadContext = { brand, user, audience: 'service' };
  // @ts-expect-error Browser contexts cannot claim a service identity.
  const browserService: RelatedRecordReadContext = { brand, user, audience: 'browser', serviceId: 'email' };
  void [browser, service, missingService, browserService];
}
