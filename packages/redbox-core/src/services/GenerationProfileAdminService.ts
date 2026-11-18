import type { GenerationBindingAttributes } from '../waterline-models/GenerationBinding';
import type { KnowledgeChunkAttributes } from '../waterline-models/KnowledgeChunk';
import type { KnowledgeCollectionVersionAttributes } from '../waterline-models/KnowledgeCollectionVersion';
import type { KnowledgeCollectionAttributes } from '../waterline-models/KnowledgeCollection';
import type { GenerationModelDeploymentAttributes } from '../waterline-models/GenerationModelDeployment';
import type { RecordTypeAttributes } from '../waterline-models/RecordType';
import { randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';
import type { GenerationProfileDefinition, ProfileProblem, ProfileOverview, ProfileSummary, ProfileTestResult, ProfileVersion } from '@researchdatabox/sails-ng-common';
import { Services as services } from '../CoreService';
import { canonicalHash, GenerationError, type GenerationEvidence, type GenerationFrozenInput } from '../model/generation';
import { requireService, requireWaterlineRows } from './generation/require-service';
import { profileDefinitionSchema, profileTestCaseSchema } from './generation/profile-admin-validation';
import { profileFormFields } from './generation/profile-admin-fields';
import { buildEvidenceAliases } from './GenerationSchemaService';
import type { Services as Profiles } from './GenerationProfileService';
import type { Services as Models } from './GenerationModelService';
import type { Services as Schemas } from './GenerationSchemaService';
import type { Services as Prompts } from './GenerationPromptService';
import type { Services as Context } from './GenerationContextService';
import type { Services as Knowledge } from './GenerationKnowledgeService';
import type { GenerationProfileAttributes } from '../waterline-models/GenerationProfile';
import type { GenerationProfileVersionAttributes } from '../waterline-models/GenerationProfileVersion';

const nameSchema = z.string().trim().min(1).max(160);
export const profileCreateSchema = z.object({ name: nameSchema, sourceRecordType: z.string().min(1).max(200), targetFormName: z.string().min(1).max(200) }).strict();
export const profileSaveSchema = z.object({ name: nameSchema, definition: profileDefinitionSchema, expectedContentHash: z.string().min(1).max(100) }).strict();
export const profileCopySchema = z.object({ name: nameSchema }).strict();
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new GenerationError('GENERATION_REQUEST_INVALID', 'Invalid profile settings');
  return parsed.data;
}

export namespace Services {
  export class GenerationProfileAdminService extends services.Core.Service {
    protected override _exportedMethods = ['overview', 'create', 'save', 'publish', 'newVersion', 'duplicate', 'discard', 'remove', 'retire', 'runTests', 'validate', 'catalog'];
    private profiles() { return requireService<Profiles.GenerationProfileService>('generationprofileservice', ['validateDefinition']); }
    private enabled() { if (!sails.config.generation.enabled) throw new GenerationError('GENERATION_NOT_CONFIGURED', 'Drafting is disabled'); }
    private async profile(brandId: string, key: string) {
      const profile = await GenerationProfile.findOne({ brandId, key });
      if (!profile) throw new GenerationError('GENERATION_ACTION_NOT_AVAILABLE', 'Profile unavailable');
      return profile;
    }
    private async version(brandId: string, id: string) {
      const version = await GenerationProfileVersion.findOne({ brandId, id });
      if (!version) throw new GenerationError('GENERATION_ACTION_NOT_AVAILABLE', 'Version unavailable');
      return version;
    }
    public async catalog(brandId: string): Promise<Omit<ProfileOverview, 'profiles'>> {
      const brand = BrandingService.getBrandById(brandId);
      const translate = (value: string) => TranslationService.t(value, undefined, 'en', brand.name);
      const typeLabel = (name: string) => {
        const key = name + '-title-label';
        const label = translate(key);
        return label === key ? name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').replace(/^./, c => c.toUpperCase()) : label;
      };
      const types = requireWaterlineRows<RecordTypeAttributes>(await RecordType.find({ branding: brandId }), 'RecordType');
      const rows = await firstValueFrom(FormsService.listForms(brandId));
      const admin = RolesService.getAdmin(brand);
      if (!admin) throw new GenerationError('GENERATION_SOURCE_FORBIDDEN', 'Brand Admin role unavailable');
      const configAccess = { brand, user: { id: 'profile-form-catalogue', username: '', type: 'local', name: '', email: '', roles: [{ id: String(admin.id), name: admin.name }] } };

      const forms: ProfileOverview['forms'] = [];
      for (const row of rows) {
        const config = row.configuration;
        if (!config?.type || !types.some(t => t.name === config.type)) continue;
        // Reuse the runtime constructor, role pruning and vocabulary hydration.
        const effective = await FormsService.buildClientFormConfig(structuredClone(config), 'edit', ['Admin', 'Researcher', 'Librarians'], null, sails.config.reusableFormDefinitions, brand.name, undefined, configAccess, false, true);
        const type = types.find(t => t.name === config.type)!;
        const stage = Object.values(sails.config.workflow[type.name] ?? {}).find(w => w.config.form === row.name)?.config.workflow.stageLabel;
        const configuredLabel: unknown = Reflect.get(config, 'label');
        const formLabel = typeof configuredLabel === 'string' && configuredLabel ? translate(configuredLabel) : typeLabel(type.name);
        const label = rows.filter(r => r.configuration?.type === type.name).length > 1 && stage ? formLabel + ' · ' + translate(stage) : formLabel;
        forms.push({ name: row.name, recordType: config.type, label, fields: profileFormFields(effective, translate) });
      }
      const deployments = requireWaterlineRows<GenerationModelDeploymentAttributes>(await GenerationModelDeployment.find({ brandId, status: 'published' }), 'GenerationModelDeployment');
      const models: ProfileOverview['models'] = [];
      for (const deployment of deployments) {
        const c = await GenerationModelConnection.findOne({ brandId, id: deployment.connectionId });
        if (c) models.push({ id: deployment.id, key: deployment.key, name: deployment.name, version: deployment.version, provider: c.name, available: c.enabled && sails.config.generation.adapters.includes(c.adapterId) });
      }
      const collections = requireWaterlineRows<KnowledgeCollectionAttributes>(await KnowledgeCollection.find({ brandId, enabled: true }), 'KnowledgeCollection');
      const guidance: ProfileOverview['guidance'] = [];
      for (const collection of collections) {
        const versions = requireWaterlineRows<KnowledgeCollectionVersionAttributes>(await KnowledgeCollectionVersion.find({ brandId, collectionId: collection.id, status: 'published' }), 'KnowledgeCollectionVersion');
        for (const version of versions.sort((a, b) => b.version - a.version)) {
          const chunks = requireWaterlineRows<KnowledgeChunkAttributes>(await KnowledgeChunk.find({ brandId, collectionVersionId: version.id }), 'KnowledgeChunk');
          guidance.push({ id: version.id, name: collection.name, version: version.version, topics: [...new Set(chunks.flatMap(c => c.tags ?? []))].sort() });
        }
      }
      return { enabled: sails.config.generation.enabled, forms, models, guidance,
        recordTypes: types.map(t => ({ name: t.name, label: typeLabel(t.name), formName: Object.values(sails.config.workflow[t.name] ?? {}).find(w => w.starting)?.config.form ?? forms.find(f => f.recordType === t.name)?.name })),
        limits: { context: { ...sails.config.generation.context }, documents: { ...sails.config.generation.documents, formats: ['pdf', 'docx', 'txt'] }, cooldownMs: 5000 } };
    }
    /** Warnings on save; the same problems block publication. No internal error text crosses the boundary. */
    public async validate(brandId: string, definition: GenerationProfileDefinition, profileId?: string, catalog?: Omit<ProfileOverview, 'profiles'>): Promise<ProfileProblem[]> {
      const c = catalog ?? await this.catalog(brandId);
      const problems: ProfileProblem[] = [];
      const add = (section: string, key: string, label?: string, row?: string, form?: string) => problems.push({ section, row, label, form, messageKey: 'ai-profiles-problem-' + key });
      if (!definition.purpose?.trim()) add('about', 'purpose');
      if (!definition.systemInstructions?.trim() || definition.systemInstructions.length > 4000) add('about', 'instructions');
      if (!c.models.some(m => m.id === definition.modelDeploymentId && m.available)) add('model', 'model');
      for (const id of definition.knowledgeCollectionVersionIds ?? []) if (!c.guidance.some(g => g.id === id)) add('guidance', 'guidance');
      for (const slot of definition.sourceSlots ?? []) {
        const type = c.recordTypes.find(t => t.name === slot.recordType);
        const form = c.forms.find(f => f.name === type?.formName);
        if (!type || !form) add('source', 'source');
        for (const path of slot.allowedPaths ?? []) if (!form?.fields.some(f => f.pointer === path)) add('source', 'source-field', undefined, path);
      }
      for (const q of definition.questions ?? []) {
        const label = q.label || (q.labelKey ? TranslationService.t(q.labelKey) : TranslationService.t('ai-profiles-question-text'));
        if (!(q.label?.trim() || q.labelKey?.trim()) || (q.maxLength !== undefined && (!Number.isSafeInteger(q.maxLength) || q.maxLength <= 0)) ||
          (['enum', 'multiEnum'].includes(q.type) && (!q.options?.length || new Set(q.options.map(o => o.value)).size !== q.options.length)) ||
          (q.sourceDefaultExpression && !definition.sourceSlots.some(slot => slot.allowedPaths.includes(q.sourceDefaultExpression!)))) add('questions', 'question', label, q.id);
      }
      const bindings = profileId ? requireWaterlineRows<GenerationBindingAttributes>(await GenerationBinding.find({ brandId, profileId }), 'GenerationBinding') : [];
      const target = definition.targetForm ?? (bindings[0] ? { recordType: bindings[0].targetRecordType, formName: bindings[0].targetFormName! } : undefined);
      const form = c.forms.find(f => f.name === target?.formName && f.recordType === target.recordType);
      if (!form) add('fields', 'form');
      const targets = [form, ...bindings.map(b => c.forms.find(f => f.name === (b.targetFormName || c.recordTypes.find(t => t.name === b.targetRecordType)?.formName) && f.recordType === b.targetRecordType))];
      for (const field of definition.targetFields ?? []) {
        for (const targetForm of targets) {
          const actual = targetForm?.fields.find(f => f.pointer === field.metadataPointer);
          const label = actual?.label || field.label || TranslationService.t('ai-profiles-unnamed-field');
          if (!actual) add('fields', 'target-field', label, field.id, targetForm?.label);
          else if (!actual.output || !field.expectedComponentClasses.includes(actual.component) || actual.output.kind !== field.output?.kind ||
            ('values' in actual.output && (!('values' in field.output) || canonicalHash([...actual.output.values].sort()) !== canonicalHash([...field.output.values].sort()))) ||
            ('maxLength' in actual.output && actual.output.maxLength && (field.maxLength ?? ('maxLength' in field.output ? field.output.maxLength ?? 0 : 0)) > actual.output.maxLength)) add('fields', 'field-changed', label, field.id, targetForm?.label);
        }
      }
      for (const field of definition.targetFields ?? []) {
        const label = form?.fields.find(f => f.pointer === field.metadataPointer)?.label || field.label || TranslationService.t('ai-profiles-unnamed-field');
        if (field.grounding === 'guidanceRequired' && !definition.knowledgeCollectionVersionIds.length) add('guidance', 'field-guidance', label, field.id);
        if (field.fallback) {
          try {
            requireService<Schemas.GenerationSchemaService>('generationschemaservice', ['validateCandidate']).validateCandidate({ runId: 'profile-validation',
              definition: { ...definition, targetFields: [{ ...field, grounding: 'inferenceAllowed' }] }, evidence: [], baseTargetDigest: '',
              rawContent: JSON.stringify({ answers: { [field.id]: { value: field.fallback.value, evidenceIds: [], rationale: '' } } }) });
          } catch { add('fields', 'fallback', label, field.id); }
        }
      }
      try { this.profiles().validateDefinition(definition); }
      catch { add('about', 'rules'); }
      return problems.filter((p, i, all) => all.findIndex(q => JSON.stringify(q) === JSON.stringify(p)) === i);
    }
    private async actorLabel(id?: string): Promise<string | undefined> {
      if (!id) return undefined;
      if (id === 'bootstrap-data') return TranslationService.t('ai-profiles-actor-bootstrap');
      const user = /^[a-f0-9]{24}$/i.test(id) ? await User.findOne({ id }) : undefined;
      return user?.name || TranslationService.t('ai-profiles-actor-admin');
    }
    private async summary(brandId: string, profile: GenerationProfileAttributes, c: Omit<ProfileOverview, 'profiles'>): Promise<ProfileSummary> {
      const versions = requireWaterlineRows<GenerationProfileVersionAttributes>(await GenerationProfileVersion.find({ brandId, profileId: profile.id }), 'GenerationProfileVersion');
      const bindings = requireWaterlineRows<GenerationBindingAttributes>(await GenerationBinding.find({ brandId, profileId: profile.id }), 'GenerationBinding');
      const runCount = await GenerationRun.count({ brandId, profileVersionId: versions.map(v => v.id) });
      const safeVersions: ProfileVersion[] = [];
      for (const v of versions.sort((a, b) => b.version - a.version)) {
        const definition = structuredClone(v.definition);
        if (!definition.targetForm && bindings[0]) definition.targetForm = { recordType: bindings[0].targetRecordType, formName: bindings[0].targetFormName || c.recordTypes.find(t => t.name === bindings[0].targetRecordType)?.formName || '' };
        safeVersions.push({ ...v, createdByName: await this.actorLabel(v.createdBy), publishedByName: await this.actorLabel(v.publishedBy), retiredByName: await this.actorLabel(v.retiredBy), definition, problems: await this.validate(brandId, definition, profile.id, c) });
      }
      return { id: profile.id, key: profile.key, name: profile.name, publishedVersionId: profile.publishedVersionId,
        hasPublished: versions.some(v => !!v.publishedAt || v.status === 'published' || v.status === 'retired'), runCount, versions: safeVersions,
        uses: bindings.map(b => ({ key: b.key, name: b.name, href: `/record/${encodeURIComponent(b.targetRecordType)}/edit${b.targetFormName ? '?formName=' + encodeURIComponent(b.targetFormName) : ''}` })) };
    }
    public async overview(brandId: string): Promise<ProfileOverview> {
      const c = await this.catalog(brandId);
      const profiles: ProfileSummary[] = [];
      for (const p of requireWaterlineRows<GenerationProfileAttributes>(await GenerationProfile.find({ brandId }), 'GenerationProfile')) profiles.push(await this.summary(brandId, p, c));
      return { ...c, profiles };
    }
    private async createWithDefinition(brandId: string, name: string, definition: GenerationProfileDefinition, actor: string) {
      this.enabled();
      const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) + '-' + randomUUID().slice(0, 8);
      const profile = await GenerationProfile.create({ brandId, key, name, nameLower: name.toLowerCase(), enabled: true, createdBy: actor, updatedBy: actor }).fetch();
      try {
        const version = await GenerationProfileVersion.create({ brandId, profileId: profile.id, version: 1, status: 'draft', schemaVersion: 1, definition, contentHash: canonicalHash(definition), createdBy: actor }).fetch();
        await GenerationProfile.updateOne({ brandId, id: profile.id }).set({ latestVersionId: version.id });
      } catch (e) { await GenerationProfile.destroyOne({ brandId, id: profile.id }); throw e; }
      return this.summary(brandId, profile, await this.catalog(brandId));
    }
    public async create(brandId: string, input: unknown, actor: string) {
      const body = parse(profileCreateSchema, input); const c = await this.catalog(brandId);
      const form = c.forms.find(f => f.name === body.targetFormName);
      if (!form || !c.recordTypes.some(t => t.name === body.sourceRecordType)) throw new GenerationError('GENERATION_REQUEST_INVALID', 'Select an available record type and form');
      return this.createWithDefinition(brandId, body.name, { purpose: '', systemInstructions: '', targetForm: { recordType: form.recordType, formName: form.name },
        sourceSlots: [{ id: 'source', recordType: body.sourceRecordType, allowedPaths: [], maxBytes: c.limits.context.maxFieldBytes }], questions: [], targetFields: [],
        knowledgeCollectionVersionIds: [], modelDeploymentId: '', contextLimits: { totalBytes: c.limits.context.maxTotalBytes, maxKnowledgeChunks: c.limits.context.maxKnowledgeChunks, maxChunkBytes: c.limits.context.maxChunkBytes }, fixtureTests: [] }, actor);
    }
    public async save(brandId: string, id: string, input: unknown, actor: string) {
      this.enabled(); const body = parse(profileSaveSchema, input); const v = await this.version(brandId, id);
      if (v.status !== 'draft' || body.expectedContentHash !== v.contentHash) throw new GenerationError('GENERATION_TARGET_CONFLICT', 'Draft changed');
      const definition = body.definition as unknown as GenerationProfileDefinition;
      if (Buffer.byteLength(JSON.stringify(definition)) > Math.min(sails.config.generation.provider.maxRequestBytes, 250000)) throw new GenerationError('GENERATION_REQUEST_INVALID', 'Profile too large');
      const problems = await this.validate(brandId, definition, v.profileId);
      const updated = await GenerationProfileVersion.updateOne({ brandId, id, status: 'draft', contentHash: body.expectedContentHash }).set({ definition, contentHash: canonicalHash(definition) });
      if (!updated) throw new GenerationError('GENERATION_TARGET_CONFLICT', 'Draft changed');
      await GenerationProfile.updateOne({ brandId, id: v.profileId }).set({ name: body.name, nameLower: body.name.toLowerCase(), updatedBy: actor });
      return { ...updated, problems };
    }
    public async publish(brandId: string, id: string, input: unknown, actor: string) {
      this.enabled(); const body = parse(z.object({ expectedContentHash: z.string().min(1) }).strict(), input);
      const v = await this.version(brandId, id);
      if (v.status !== 'draft' || v.contentHash !== body.expectedContentHash) throw new GenerationError('GENERATION_TARGET_CONFLICT', 'Draft changed');
      if ((await this.validate(brandId, v.definition, v.profileId)).length) throw new GenerationError('GENERATION_PROFILE_INVALID', 'Fix problems before publishing');
      return this.profiles().publish(brandId, id, actor, v.contentHash);
    }
    public async newVersion(brandId: string, id: string, actor: string) {
      this.enabled(); const v = await this.version(brandId, id);
      const drafts = requireWaterlineRows<GenerationProfileVersionAttributes>(await GenerationProfileVersion.find({ brandId, profileId: v.profileId, status: 'draft' }), 'GenerationProfileVersion');
      if (drafts.length) throw new GenerationError('GENERATION_INVALID_STATE', 'Edit or discard the existing draft');
      return this.profiles().createDraft(brandId, v.profileId, id, actor);
    }
    public async duplicate(brandId: string, key: string, input: unknown, actor: string) {
      const body = parse(profileCopySchema, input); const profile = await this.profile(brandId, key);
      const summary = await this.summary(brandId, profile, await this.catalog(brandId));
      return this.createWithDefinition(brandId, body.name, structuredClone(summary.versions[0].definition), actor);
    }
    public async discard(brandId: string, id: string) {
      this.enabled(); const v = await this.version(brandId, id);
      if (v.status !== 'draft') throw new GenerationError('GENERATION_INVALID_STATE', 'Only drafts can be discarded');
      const versions = requireWaterlineRows<GenerationProfileVersionAttributes>(await GenerationProfileVersion.find({ brandId, profileId: v.profileId }), 'GenerationProfileVersion');
      if (versions.length === 1) {
        const profile = await GenerationProfile.findOne({ brandId, id: v.profileId });
        return this.remove(brandId, profile!.key);
      }
      const deleted = await GenerationProfileVersion.destroyOne({ brandId, id, status: 'draft', contentHash: v.contentHash });
      if (!deleted) throw new GenerationError('GENERATION_TARGET_CONFLICT', 'Draft changed');
      const latest = versions.filter(x => x.id !== id).sort((a, b) => b.version - a.version)[0];
      await GenerationProfile.updateOne({ brandId, id: v.profileId }).set({ latestVersionId: latest.id });
      return { deleted: true, uses: [], hasPublished: false, runCount: 0 };
    }
    public async remove(brandId: string, key: string) {
      this.enabled(); const profile = await this.profile(brandId, key); const summary = await this.summary(brandId, profile, await this.catalog(brandId));
      const result = { deleted: false, uses: summary.uses, hasPublished: summary.hasPublished, runCount: summary.runCount };
      if (result.hasPublished || result.uses.length || result.runCount) return result;
      await GenerationProfileVersion.destroy({ brandId, profileId: profile.id }); await GenerationProfile.destroyOne({ brandId, id: profile.id });
      return { ...result, deleted: true };
    }
    public async retire(brandId: string, id: string, actor: string) { this.enabled(); return this.profiles().retire(brandId, id, actor); }
    public async runTests(brandId: string, id: string, actor: string): Promise<ProfileTestResult[]> {
      this.enabled(); const v = await this.version(brandId, id); const d = v.definition; const c = await this.catalog(brandId);
      if ((await this.validate(brandId, d, v.profileId, c)).length) throw new GenerationError('GENERATION_PROFILE_INVALID', 'Fix problems before testing');
      const fixtures = parse(z.array(profileTestCaseSchema).min(1).max(5), d.fixtureTests ?? []);
      if (!fixtures.length || fixtures.length > 5) throw new GenerationError('GENERATION_REQUEST_INVALID', 'Add up to five test cases');
      const schema = requireService<Schemas.GenerationSchemaService>('generationschemaservice', ['buildProviderSchema', 'validateCandidate']);
      const prompt = requireService<Prompts.GenerationPromptService>('generationpromptservice', ['build']);
      const knowledgeService = requireService<Knowledge.GenerationKnowledgeService>('generationknowledgeservice', ['retrieve']);
      const knowledge = await knowledgeService.retrieve(brandId, d.knowledgeCollectionVersionIds, [...new Set(d.targetFields.flatMap(f => f.knowledgeTags ?? []))], { maxChunks: d.contextLimits.maxKnowledgeChunks, maxBytes: d.contextLimits.totalBytes });
      const contexts: Array<{ evidence: GenerationEvidence[]; aliases: ReturnType<typeof buildEvidenceAliases> }> = [];
      const requests = fixtures.map((fixture) => {
        const evidence: GenerationEvidence[] = [];
        const slot = d.sourceSlots[0];
        const form = c.forms.find(f => f.name === c.recordTypes.find(t => t.name === slot.recordType)?.formName);
        for (const path of slot.allowedPaths) {
          const value = fixture.source?.[path]; if (value === undefined || value === '') continue;
          if (Buffer.byteLength(JSON.stringify(value)) > slot.maxBytes) throw new GenerationError('GENERATION_REQUEST_INVALID', 'Test source too large');
          evidence.push({ id: 'test:' + path, label: form?.fields.find(f => f.pointer === path)?.label ?? 'Source record', kind: 'source', content: value, contentHash: canonicalHash(value) });
        }
        const answers = d.questions.map(q => ({ id: q.id, value: fixture.answers?.[q.id] ?? fixture.source?.[q.sourceDefaultExpression ?? ''] ?? null }));
        requireService<Context.GenerationContextService>('generationcontextservice', ['validateAnswers']).validateAnswers(d, answers);
        for (const answer of answers) evidence.push({ id: 'answer:' + answer.id, label: d.questions.find(q => q.id === answer.id)?.label || 'Question', questionId: answer.id, kind: 'source', content: answer.value, contentHash: canonicalHash(answer.value) });
        const all = [...evidence, ...knowledge]; const aliases = buildEvidenceAliases(all); contexts.push({ evidence: all, aliases });
        const frozenInput: GenerationFrozenInput = { sources: [], answers, sourceEvidence: evidence, targetForm: { ...d.targetForm!, mode: 'create' }, targetDraft: {}, baseTargetDigest: canonicalHash({}) };
        if (Buffer.byteLength(JSON.stringify(frozenInput)) + Buffer.byteLength(JSON.stringify(knowledge)) > d.contextLimits.totalBytes) throw new GenerationError('GENERATION_REQUEST_INVALID', 'Test context too large');
        return prompt.build({ correlationId: randomUUID(), definition: d, frozenInput, knowledge, evidenceAliases: aliases, responseSchema: schema.buildProviderSchema(d, all, aliases), connection: { endpoint: '', timeoutMs: 0 }, deployment: { modelId: '' } });
      });
      const modelService = requireService<Models.GenerationModelService>('generationmodelservice', ['testProfileRequests']);
      const responses = await modelService.testProfileRequests(brandId, actor, d.modelDeploymentId, requests);
      return responses.map((response, index) => {
        const result: ProfileTestResult = { name: String(fixtures[index].name || index + 1), ranAt: new Date().toISOString(), passed: true, fields: [] };
        for (const field of d.targetFields) {
          const label = c.forms.find(f => f.name === d.targetForm?.formName)?.fields.find(f => f.pointer === field.metadataPointer)?.label ?? field.label ?? 'Field';
          let preview: unknown;
          try {
            const parsed = JSON.parse(response.content);
            const value: unknown = parsed?.answers?.[field.id]?.value;
            preview = typeof value === 'string' ? value.slice(0, 500) : typeof value === 'boolean' || Array.isArray(value) && value.every(v => typeof v === 'string') ? value : undefined;
            if (!parsed || Object.keys(parsed).length !== 1 || !parsed.answers || Array.isArray(parsed.answers) ||
                Object.keys(parsed.answers).length !== d.targetFields.length || Object.keys(parsed.answers).some(key => !d.targetFields.some(f => f.id === key))) throw new GenerationError('GENERATION_OUTPUT_SCHEMA_INVALID', 'Test answer fields do not match');
            const candidate = schema.validateCandidate({ runId: 'synthetic-test', rawContent: JSON.stringify({ answers: { [field.id]: parsed.answers?.[field.id] } }), definition: { ...d, targetFields: [field] }, evidence: contexts[index].evidence, evidenceAliases: contexts[index].aliases, baseTargetDigest: canonicalHash({}) });
            const item = candidate.items[0]; result.fields.push({ label, value: item.value, evidence: item.evidence.map(e => e.label), passed: true, reviewRequired: item.reviewRequired });
          } catch { result.passed = false; result.fields.push({ label, value: preview, evidence: [], passed: false, errorKey: 'ai-profiles-test-rule-failed' }); }
        }
        return result;
      });
    }
  }
}
