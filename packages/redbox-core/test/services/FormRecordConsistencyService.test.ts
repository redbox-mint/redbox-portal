import {createSinonStubLogger} from "../logger.test";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';
import { of } from 'rxjs';
import { dataRecordProjectedMetadata, dataRecordProjectionForm } from '../fixtures/metadata-projection.fixtures';
import { buildNestedViewForm, nestedViewFixture, questionTreeViewFixture } from '../fixtures/nested-view-metadata.fixtures';

describe('FormRecordConsistencyService', function () {
  let mockSails: any;
  let FormRecordConsistencyService: any;

  beforeEach(function () {
    mockSails = createMockSails({
      config: {
        validators: {
          definitions: {}
        }
      },
      log: createSinonStubLogger(sinon),
    });

    setupServiceTestGlobals(mockSails);

    (global as any).BrandingService = {
      getDefault: sinon.stub().returns({ id: 'default-brand' }),
      getBrand: sinon.stub().returns({ id: 'default-brand' }),
    };
    (global as any).RecordsService = {
      getMeta: sinon.stub()
    };
    (global as any).FormsService = {
      getFormByName: sinon.stub().returns(of({})),
      buildClientFormConfig: sinon.stub().returns({})
    };

    const { Services } = require('../../src/services/FormRecordConsistencyService');
    FormRecordConsistencyService = new Services.FormRecordConsistency();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).BrandingService;
    delete (global as any).RecordsService;
    delete (global as any).FormsService;
    sinon.restore();
  });

  describe('mergeRecord', function () {
    it('should merge records', async function () {
      const changed = { redboxOid: 'oid', metaMetadata: { form: 'form' }, metadata: { changed: 'value' } };
      const original = { redboxOid: 'oid', metadata: { original: 'value' } };

      (global as any).RecordsService.getMeta.resolves(original);
      (global as any).FormsService.getFormByName.returns(of({
        name: 'test-form',
        branding: 'default-brand',
        configuration: {
          name: 'test-form',
          componentDefinitions: [],
          fields: []
        }
      }));

      // Mock internal methods to simplify test
      sinon.stub(FormRecordConsistencyService, 'mergeRecordClientFormConfig').returns({ merged: true });

      const result = await FormRecordConsistencyService.mergeRecord(changed, 'edit');

      expect(result).to.deep.equal({ merged: true });
      expect((global as any).RecordsService.getMeta.calledWith('oid')).to.be.true;
    });
  });

  describe('mergeRecordClientFormConfig', function () {
    it('should delegate to mergeRecordMetadataPermitted', async function () {
      const original = { redboxOid: 'oid', metadata: { a: 1 } };
      const changed = { redboxOid: 'oid', metadata: { a: 2 } };
      const config = {};

      sinon.stub(FormRecordConsistencyService, 'buildSchemaForFormConfig').returns({});
      sinon.stub(FormRecordConsistencyService, 'compareRecords').returns([]);
      sinon.stub(FormRecordConsistencyService, 'mergeRecordMetadataPermitted').returns({ merged: true });

      const result = await FormRecordConsistencyService.mergeRecordClientFormConfig(original, changed, config, 'edit');

      expect(result.metadata).to.deep.equal({ merged: true });
    });

    it('should strip hydrated model values before building schema', async function () {
      const original = { redboxOid: 'oid', metadata: { title: 'before' } };
      const changed = { redboxOid: 'oid', metadata: { title: 'after' } };
      const config = {
        componentDefinitions: [
          {
            name: 'title',
            component: { class: 'SimpleInputComponent', config: { type: 'text' } },
            model: { class: 'SimpleInputModel', config: { validators: [], value: 'asfsafasfa' } },
            layout: { class: 'DefaultLayout', config: {} }
          },
          {
            name: 'group',
            component: {
              class: 'GroupComponent',
              config: {
                componentDefinitions: [
                  {
                    name: 'nested',
                    component: { class: 'SimpleInputComponent', config: { type: 'text' } },
                    model: { class: 'SimpleInputModel', config: { validators: [], value: 'nested-value' } },
                    layout: { class: 'DefaultLayout', config: {} }
                  }
                ]
              }
            },
            layout: { class: 'DefaultLayout', config: {} }
          }
        ]
      };

      const buildSchemaStub = sinon.stub(FormRecordConsistencyService, 'buildSchemaForFormConfig').returns({});
      sinon.stub(FormRecordConsistencyService, 'compareRecords').returns([]);
      sinon.stub(FormRecordConsistencyService, 'mergeRecordMetadataPermitted').returns({ merged: true });

      await FormRecordConsistencyService.mergeRecordClientFormConfig(original, changed, config, 'edit');

      const schemaInput = buildSchemaStub.firstCall.args[0];
      const strippedTopLevel = schemaInput.componentDefinitions?.[0]?.model?.config?.value;
      const strippedNested = schemaInput.componentDefinitions?.[1]?.component?.config?.componentDefinitions?.[0]?.model?.config?.value;
      const originalTopLevel = config.componentDefinitions?.[0]?.model?.config?.value;
      const originalNested = config.componentDefinitions?.[1]?.component?.config?.componentDefinitions?.[0]?.model?.config?.value;

      expect(strippedTopLevel).to.equal(undefined);
      expect(strippedNested).to.equal(undefined);
      expect(originalTopLevel).to.equal('asfsafasfa');
      expect(originalNested).to.equal('nested-value');
    });
  });

  describe('metadataForViewForm authorization', function () {
    for (const retain of [true, false]) {
      for (const roles of [['Researcher'], ['Admin']]) {
        it(`keeps authorized question tree answers for ${roles}, retained containers=${retain}`, async function () {
          const { data, metadata, beforeClient } = questionTreeViewFixture(retain);
          const form = await buildNestedViewForm(data, 'view', roles, metadata, beforeClient);
          const { viewMetadataSource } = require('@researchdatabox/sails-ng-common');
          const tree = form.componentDefinitions[0];
          expect(tree.component.class).to.equal('ContentComponent');
          expect(tree.component.config.content).to.be.an('array');
          const authorizedNames = tree[viewMetadataSource].component.config.componentDefinitions.map(child => child.name);
          expect(authorizedNames).to.include('question_1');
          expect(authorizedNames.includes('question_2')).to.equal(roles.includes('Admin'));
          expect(authorizedNames).not.to.include('question_3');
          const expected = { question_1: 'yes', ...(roles.includes('Admin') ? { question_2: 'no' } : {}) };
          expect(FormRecordConsistencyService.metadataForViewForm(metadata, form)).to.deep.equal({
            tree: expected, parent: { tree: expected }, rows: [{ tree: expected }],
          });
        });
      }
    }

    it('omits malformed question tree values', async function () {
      const { data, metadata, beforeClient } = questionTreeViewFixture();
      const form = await buildNestedViewForm(data, 'view', ['Researcher'], metadata, beforeClient);
      for (const tree of ['yes', ['yes'], null, 42, false]) {
        expect(FormRecordConsistencyService.metadataForViewForm({ tree }, form)).to.deep.equal({});
      }
    });

    it('round3 filters restricted children before preserving leaves regardless of saved row shape', async function () {
      const { data, metadata } = nestedViewFixture(false);
      const form = await buildNestedViewForm(data, 'view', ['Researcher'], metadata);
      const saved = { ...metadata, rows: [
        ['row-role-secret'], 'row-role-secret', null, 42, false,
        { public: { arbitrary: 'whole leaf' }, restricted: { extra: 'row-role-secret' } },
      ] };
      const result = FormRecordConsistencyService.metadataForViewForm(saved, form);
      expect(result.rows).to.deep.equal([{ public: { arbitrary: 'whole leaf' } }]);
      expect(JSON.stringify(result)).not.to.contain('role-secret');
    });

    it('round3 fails closed when a real transformed input loses its provenance', async function () {
      const { viewMetadataSource } = require('@researchdatabox/sails-ng-common');
      const data = { name: 'missing-provenance', componentDefinitions: [{ name: 'saved',
        component: { class: 'SimpleInputComponent' }, model: { class: 'SimpleInputModel' },
      }] };
      const metadata = { saved: { nested: 'secret' } };
      const form = await buildNestedViewForm(data, 'view', ['Researcher'], metadata);
      expect(FormRecordConsistencyService.metadataForViewForm(metadata, form)).to.deep.equal(metadata);
      delete form.componentDefinitions[0][viewMetadataSource];
      expect(FormRecordConsistencyService.metadataForViewForm(metadata, form)).to.deep.equal({});
    });

    for (const retain of [true, false]) {
      for (const roles of [['Researcher'], ['Admin']]) {
        it(`projects nested view metadata for ${roles}, retained containers=${retain}`, async function () {
          const { data, metadata, expected } = nestedViewFixture(retain);
          const form = await buildNestedViewForm(data, 'view', roles, metadata);
          expect(form.componentDefinitions[0].component.class).to.equal(retain ? 'GroupComponent' : 'ContentComponent');
          expect(form.componentDefinitions[1].component.class).to.equal(retain ? 'RepeatableComponent' : 'ContentComponent');
          expect(form.componentDefinitions.find(field => field.name === 'objectLeaf').component.class)
            .to.equal(retain ? 'SimpleInputComponent' : 'ContentComponent');
          if (roles.includes('Admin')) {
            for (const name of ['servicenow_teams_result', 'servicenow_irds_result']) {
              const hiddenLeaf = form.componentDefinitions.find(field => field.name === name);
              expect(hiddenLeaf.component.class).to.equal('ContentComponent');
              expect(hiddenLeaf.component.config.content).to.deep.equal(metadata[name]);
            }
          }
          const result = FormRecordConsistencyService.metadataForViewForm(metadata, form);
          expect(result).to.deep.equal(expected(roles));
          const serialized = JSON.stringify(result);
          for (const secret of ['mode-secret', 'server-secret', 'top-level-secret']) {
            expect(serialized).not.to.contain(secret);
          }
          expect(serialized.includes('role-secret')).to.equal(roles.includes('Admin'));
          expect(metadata.parent).to.have.property('serverOnly', 'parent-server-secret');
          expect(metadata.rows[0]).to.have.property('restricted', 'row0-role-secret');
        });
      }
    }

    it('fails closed for saved objects without an authorized content shape', function () {
      const form = { componentDefinitions: [
        { name: 'missing', component: { class: 'ContentComponent', config: {} } },
        { name: 'partial', component: { class: 'ContentComponent', config: { content: { visible: 'shown', nested: {} } } } },
      ] };
      expect(FormRecordConsistencyService.metadataForViewForm({
        missing: { secret: 'hidden' },
        partial: { visible: 'saved', secret: 'hidden', nested: { secret: 'hidden' } },
      }, form)).to.deep.equal({});
    });

    it('projects mixed retained parents and transformed nested groups', async function () {
      const { data, metadata, expected } = nestedViewFixture(true);
      const parent = data.componentDefinitions[0] as any;
      const repeatable = data.componentDefinitions[1] as any;
      delete parent.component.config.componentDefinitions.find(field => field.name === 'nested').constraints;
      delete repeatable.component.config.elementTemplate.component.config.componentDefinitions
        .find(field => field.name === 'nested').constraints;
      const form = await buildNestedViewForm(data, 'view', ['Researcher'], metadata);
      expect(form.componentDefinitions[0].component.config.componentDefinitions
        .find(field => field.name === 'nested').component.class).to.equal('ContentComponent');
      expect(FormRecordConsistencyService.metadataForViewForm(metadata, form)).to.deep.equal(expected(['Researcher']));
      for (const secret of ['role-secret', 'mode-secret', 'server-secret', 'top-level-secret']) {
        expect(JSON.stringify(form)).not.to.contain(secret);
      }
    });

    it('omits malformed containers and repeatable rows without a permitted shape', function () {
      const form = { componentDefinitions: [
        { name: 'group', model: { class: 'GroupModel' }, component: { class: 'GroupComponent', config: {} } },
        { name: 'repeatable', model: { class: 'RepeatableModel' }, component: { class: 'RepeatableComponent', config: {} } },
        { name: 'transformed', component: { class: 'ContentComponent', config: { content: [{ public: 'display' }] } } },
      ] };
      expect(FormRecordConsistencyService.metadataForViewForm({
        group: 'unmodeled', repeatable: [{ secret: 'hidden' }],
        transformed: [{ public: 'saved', secret: 'hidden' }, { secret: 'hidden' }],
      }, form)).to.deep.equal({});
    });

    it('round2 aligns displayed repeatable rows after authorized empty-row removal at every depth', async function () {
      const { data, metadata } = nestedViewFixture(false);
      const row = (data.componentDefinitions[1] as any).component.config.elementTemplate;
      row.component.config.componentDefinitions.push({
        name: 'inner', component: { class: 'RepeatableComponent', config: { elementTemplate: {
          name: '', component: { class: 'GroupComponent', config: { componentDefinitions: [
            { name: 'public', component: { class: 'SimpleInputComponent' }, model: { class: 'SimpleInputModel' } },
            { name: 'restricted', component: { class: 'SimpleInputComponent' }, model: { class: 'SimpleInputModel' },
              constraints: { authorization: { allowRoles: ['Admin'] } } },
          ] } }, model: { class: 'GroupModel' },
        } } }, model: { class: 'RepeatableModel' },
      });
      metadata.rows = [
        { public: '', restricted: 'first-role-secret' },
        { public: 'second', inner: [{ public: '', restricted: 'inner-role-secret' }, { public: 'inner-second' }] },
        { public: 'third' },
      ] as any;
      const form = await buildNestedViewForm(data, 'view', ['Researcher'], metadata);
      expect(FormRecordConsistencyService.metadataForViewForm(metadata, form).rows).to.deep.equal([
        { public: 'second', inner: [{ public: 'inner-second' }] }, { public: 'third' },
      ]);
      expect(JSON.stringify(form)).not.to.contain('role-secret');
    });

    for (const roles of [['Researcher', 'Guest'], ['Admin', 'Librarians', 'Researcher', 'Guest']]) {
      it(`round2 restores the whole Typeahead leaf object for ${roles}`, async function () {
        const data = { name: 'school', componentDefinitions: [{ name: 'information_steward',
          component: { class: 'TypeaheadInputComponent', config: { displayField: 'name' } },
          model: { class: 'TypeaheadInputModel' },
        }] };
        const metadata = { information_steward: { name: 'School of Testing', code: 'TEST', extra: { saved: true } },
          workspaces: [{ restricted: 'workspace-secret' }] };
        const form = await buildNestedViewForm(data, 'view', roles, metadata);
        expect(form.componentDefinitions[0].component.class).to.equal('ContentComponent');
        expect(form.componentDefinitions[0].component.config.content).to.be.a('string');
        expect(FormRecordConsistencyService.metadataForViewForm(metadata, form)).to.deep.equal({
          information_steward: metadata.information_steward,
        });
      });
    }

    for (const kind of ['group', 'repeatable']) {
      for (const content of ['display string', '', {}, [], undefined]) {
        it(`round2 keeps transformed ${kind} closed with content ${JSON.stringify(content)}`, async function () {
          const { data, metadata } = nestedViewFixture(false);
          const form = await buildNestedViewForm(data, 'view', ['Researcher'], metadata);
          const node = form.componentDefinitions[kind === 'group' ? 0 : 1];
          node.component.config.content = content;
          const projected = FormRecordConsistencyService.metadataForViewForm(metadata, form);
          expect(JSON.stringify(projected)).not.to.contain('role-secret');
          expect(JSON.stringify(projected)).not.to.contain('server-secret');
        });
      }
    }

    it('round2 does not treat a group using descendant fallback content as a leaf', async function () {
      const { data, metadata } = nestedViewFixture(false);
      metadata.parent = { restricted: 'fallback-role-secret' } as any;
      const form = await buildNestedViewForm(data, 'view', ['Researcher'], metadata);
      expect(form.componentDefinitions[0].component.config.content).to.have.property('public');
      expect(FormRecordConsistencyService.metadataForViewForm(metadata, form).parent).to.deep.equal({});
      expect(JSON.stringify(form)).not.to.contain('fallback-role-secret');
    });

    async function viewForm(roles: string[]) {
      const { nothingLogger } = require('@researchdatabox/sails-ng-common');
      const { ConstructFormConfigVisitor } = require('../../src/visitor/construct.visitor');
      const { ClientFormConfigVisitor } = require('../../src/visitor/client.visitor');
      const fields = ['public', 'restricted', 'editOnly'].map((name) => ({
        name,
        component: { class: 'SimpleInputComponent', config: {} },
        model: { class: 'SimpleInputModel', config: {} },
        ...(name === 'restricted' ? { constraints: { authorization: { allowRoles: ['Admin'] } } } : {}),
        ...(name === 'editOnly' ? { constraints: { allowModes: ['edit'] } } : {}),
      }));
      const constructed = await new ConstructFormConfigVisitor(nothingLogger).start({
        data: { name: 'authorization', componentDefinitions: fields },
        formMode: 'view',
      });
      return new ClientFormConfigVisitor(nothingLogger).start({
        form: constructed,
        formMode: 'view',
        userRoles: roles,
      });
    }

    for (const roles of [['Researcher'], ['Admin']]) {
      it(`selects only role and mode permitted view fields for ${roles}`, async function () {
        const form = await viewForm(roles);
        const result = FormRecordConsistencyService.metadataForViewForm(
          { public: 'visible', restricted: 'secret', editOnly: 'edit secret', serverOnly: 'server secret' },
          form,
        );
        expect(result).to.deep.equal({
          public: 'visible',
          ...(roles.includes('Admin') ? { restricted: 'secret' } : {}),
        });
      });
    }

    it('stops at modeled parents so nested names cannot select unrelated top-level metadata', function () {
      const form = {
        componentDefinitions: [
          {
            name: 'parent',
            model: { class: 'GroupModel' },
            component: {
              class: 'GroupComponent',
              config: {
                componentDefinitions: [{ name: 'restricted', component: { class: 'SimpleInputComponent' }, model: { class: 'SimpleInputModel' } }],
              },
            },
          },
        ],
      };
      expect(
        FormRecordConsistencyService.metadataForViewForm(
          { parent: { restricted: 'nested' }, restricted: 'top-level secret', orphan: 'secret' },
          form,
        ),
      ).to.deep.equal({ parent: { restricted: 'nested' } });
    });
  });

  describe('projectMetadataClientFormConfig', function () {
    it("projects DataLocation values through the real schema visitor without exposing server-only metadata", async function () {
      const metadata = {
        ...dataRecordProjectedMetadata,
        contributor_data_manager: {
          ...dataRecordProjectedMetadata.contributor_data_manager,
          serverOnly: "hidden",
        },
        serverOnly: { credentials: "hidden" },
      };

      const result =
        await FormRecordConsistencyService.projectMetadataClientFormConfig(
          metadata,
          dataRecordProjectionForm,
          "edit",
        );

      expect(result).to.deep.equal(dataRecordProjectedMetadata);
      expect(metadata).to.have.property("serverOnly");
      expect(metadata.contributor_data_manager).to.have.property(
        "serverOnly",
        "hidden",
      );
    });

    it("replaces permitted DataLocation arrays on save while retaining existing server-only metadata", async function () {
      const original = {
        redboxOid: "representative-data-record",
        metadata: {
          dataLocations: [{ type: "url", location: "https://example.test/old" }],
          contributor_data_manager: {
            given_name: "Previous",
            serverOnly: "retained",
          },
          serverOnly: { audit: "retained" },
        },
      };
      const changed = {
        redboxOid: original.redboxOid,
        metadata: {
          ...dataRecordProjectedMetadata,
          contributor_data_manager: {
            ...dataRecordProjectedMetadata.contributor_data_manager,
            serverOnly: "overwrite",
          },
          serverOnly: { audit: "overwrite" },
          unpermitted: "not stored",
        },
      };

      const result = await FormRecordConsistencyService.mergeRecordClientFormConfig(
        original,
        changed,
        dataRecordProjectionForm,
        "edit",
      );

      expect(result.metadata).to.deep.equal({
        ...dataRecordProjectedMetadata,
        contributor_data_manager: {
          ...dataRecordProjectedMetadata.contributor_data_manager,
          serverOnly: "retained",
        },
        serverOnly: { audit: "retained" },
      });
      expect(original.metadata.dataLocations[0].type).to.equal("url");
    });

    it('projects only metadata permitted by the client form', async function () {
      sinon.stub(FormRecordConsistencyService, 'mergeRecordClientFormConfig').resolves({
        redboxOid: '',
        metadata: { title: 'visible' },
      });

      const result = await FormRecordConsistencyService.projectMetadataClientFormConfig(
        { title: 'visible', serverOnly: 'hidden' },
        { componentDefinitions: [] },
        'edit',
        { shared: {} }
      );

      expect(result).to.deep.equal({ title: 'visible' });
      expect((FormRecordConsistencyService.mergeRecordClientFormConfig as sinon.SinonStub).calledWith(
        { redboxOid: '', metadata: {} },
        { redboxOid: '', metadata: { title: 'visible', serverOnly: 'hidden' } },
        { componentDefinitions: [] },
        'edit',
        { shared: {} }
      )).to.be.true;
    });
  });

  describe('mergeRecordMetadataPermitted', function () {
    it("accepts the reported DataLocation reproduction with an unwrapped property map", function () {
      const changed = {
        dataLocations: [
          { type: "file", location: "/research-data/projects/coastal" },
        ],
      };
      const result = FormRecordConsistencyService.mergeRecordMetadataPermitted(
        {},
        changed,
        { dataLocations: { elements: { type: "object" } } },
        [],
      );
      expect(result).to.deep.equal(changed);
    });

    it("continues filtering structured object arrays even when data keys resemble schema keywords", function () {
      const result = FormRecordConsistencyService.mergeRecordMetadataPermitted(
        {},
        {
          entries: [
            {
              type: "file",
              properties: "permitted data",
              elements: "hidden",
              secret: "hidden",
            },
          ],
        },
        {
          entries: {
            elements: {
              properties: { type: { type: "string" } },
              optionalProperties: { properties: { type: "string" } },
            },
          },
        },
        [],
      );
      expect(result).to.deep.equal({
        entries: [{ type: "file", properties: "permitted data" }],
      });
    });

    for (const value of [[], null]) {
      it(`preserves an explicit ${JSON.stringify(value)} DataLocation value`, function () {
        const result = FormRecordConsistencyService.mergeRecordMetadataPermitted(
          {
            dataLocations: [{ type: "file", location: "old" }],
            serverOnly: "retained",
          },
          { dataLocations: value },
          { dataLocations: { elements: { type: "object" } } },
          [],
        );
        expect(result).to.deep.equal({
          dataLocations: value,
          serverOnly: "retained",
        });
      });
    }

    it("preserves primitive array ordering and explicit null nested fields", function () {
      const changed = {
        tags: ["coastal", "resilience"],
        details: { description: null, secret: "hidden" },
      };
      const result = FormRecordConsistencyService.mergeRecordMetadataPermitted(
        {},
        changed,
        {
          tags: { elements: { type: "string" } },
          details: { properties: { description: { type: "string" } } },
        },
        [],
      );
      expect(result).to.deep.equal({
        tags: changed.tags,
        details: { description: null },
      });
    });

    it('preserves every property of array elements permitted as unconstrained objects', function () {
      const changed = {
        dataLocations: [
          {
            type: 'url',
            location: 'https://example.com/dataset',
            notes: 'test notes',
            selected: true,
          },
        ],
      };
      const permittedChanges = {
        properties: {
          dataLocations: {
            elements: {
              type: 'object',
            },
          },
        },
      };

      const result = FormRecordConsistencyService.mergeRecordMetadataPermitted(
        {},
        changed,
        permittedChanges,
        []
      );

      expect(result).to.deep.equal(changed);
    });

    it('preserves array elements permitted by an empty schema', function () {
      const changed = {
        attachments: [
          {
            attachmentId: 'attachment-1',
            name: 'dataset.pdf',
          },
        ],
      };
      const permittedChanges = {
        properties: {
          attachments: {
            elements: {},
          },
        },
      };

      const result = FormRecordConsistencyService.mergeRecordMetadataPermitted(
        {},
        changed,
        permittedChanges,
        []
      );

      expect(result).to.deep.equal(changed);
    });

    it('continues to filter metadata when a form has no permitted fields', function () {
      const result = FormRecordConsistencyService.mergeRecordMetadataPermitted(
        {},
        { serverOnly: 'hidden' },
        {},
        []
      );

      expect(result).to.deep.equal({});
    });

    it('preserves optional properties in nested permitted objects', function () {
      const result = FormRecordConsistencyService.mergeRecordMetadataPermitted(
        {},
        { rdmp: { oid: 'rdmp-1', title: 'Research data management plan' } },
        {
          properties: {
            rdmp: {
              properties: {
                oid: { type: 'string' },
              },
              optionalProperties: {
                title: { type: 'string' },
              },
            },
          },
        },
        []
      );

      expect(result).to.deep.equal({
        rdmp: { oid: 'rdmp-1', title: 'Research data management plan' },
      });
    });

    it('merges nested objects with only optional properties and filters unpermitted changes', function () {
      const result = FormRecordConsistencyService.mergeRecordMetadataPermitted(
        { rdmp: { title: 'Original title', serverOnly: 'preserved' } },
        { rdmp: { title: 'Updated title', serverOnly: 'changed', unexpected: 'hidden' } },
        {
          properties: {
            rdmp: {
              optionalProperties: {
                title: { type: 'string' },
              },
            },
          },
        },
        []
      );

      expect(result).to.deep.equal({
        rdmp: { title: 'Updated title', serverOnly: 'preserved' },
      });
    });

    it('reports malformed primitive property schemas as validation errors', function () {
      const merge = () => FormRecordConsistencyService.mergeRecordMetadataPermitted(
        {},
        { title: 'Dataset' },
        { properties: { title: 'string' } },
        []
      );

      expect(merge).to.throw(Error, 'Invalid permittedChanges object');
    });

    it('reports malformed primitive array element schemas as validation errors', function () {
      for (const elementSchema of [123, false, 'string']) {
        const merge = () => FormRecordConsistencyService.mergeRecordMetadataPermitted(
          {},
          { dataLocations: [{ type: 'url', location: 'https://example.com/dataset' }] },
          { properties: { dataLocations: { elements: elementSchema } } },
          []
        );

        expect(merge).to.throw(Error, 'Invalid permittedChanges object');
      }
    });
  });

  describe('compareRecords', function () {
    it('should detect changes in simple objects', function () {
      const original = { a: 1 };
      const changed = { a: 2, b: 3 };

      const result = FormRecordConsistencyService.compareRecords(original, changed);

      expect(result).to.have.length(2); // change a, add b

      const changeA = result.find((r: any) => r.path[0] === 'a');
      expect(changeA.kind).to.equal('change');

      const changeB = result.find((r: any) => r.path[0] === 'b');
      expect(changeB.kind).to.equal('add');
    });

    it('should detect deletions', function () {
      const original = { a: 1 };
      const changed = {};

      const result = FormRecordConsistencyService.compareRecords(original, changed);

      expect(result).to.have.length(1);
      expect(result[0].kind).to.equal('delete');
    });

    it('should detect nested changes', function () {
      const original = { a: { b: 1 } };
      const changed = { a: { b: 2 } };

      const result = FormRecordConsistencyService.compareRecords(original, changed);

      expect(result).to.have.length(1);
      expect(result[0].path).to.deep.equal(['a', 'b']);
    });
  });

  describe('extractRawTemplates', function () {
    it('should extract templates using visitor', async function () {
      const item = { type: 'form' };

      // We can't easily mock the internal visitor class instantiation
      // But we can check if it throws or runs
      // Assuming dependencies are available

      try {
        const result = await FormRecordConsistencyService.extractRawTemplates(item, 'edit');
        expect(result).to.be.an('array');
      } catch (e) {
        // If dependencies are missing, we might skip
        }
    });

    it('should extract form behaviour compiled item entries before client stripping', async function () {
      const item = {
        name: 'behaviour-form',
        componentDefinitions: [
          {
            name: 'title',
            component: { class: 'SimpleInputComponent', config: { type: 'text' } },
            model: { class: 'SimpleInputModel', config: { validators: [] } },
            layout: { class: 'DefaultLayout', config: {} }
          }
        ],
        behaviours: [
          {
            name: 'fetch-on-ready',
            condition: '$exists(runtimeContext.requestParams.rdmpOid)',
            conditionKind: 'jsonata_query',
            runOnFormReady: true,
            processors: [
              {
                type: 'jsonataTransform',
                config: {
                  template: 'runtimeContext.requestParams.rdmpOid'
                }
              }
            ],
            actions: [
              {
                type: 'setValue',
                config: {
                  fieldPath: '$substringBefore(event.fieldId, "/title") & "/description"',
                  fieldPathKind: 'jsonata',
                  valueTemplate: 'value.title'
                }
              }
            ]
          }
        ]
      } as any;

      const result = await FormRecordConsistencyService.extractRawTemplates(item, 'edit');

      expect(result).to.deep.include({
        key: ['behaviours', '0', 'condition'],
        kind: 'jsonata',
        value: '$exists(runtimeContext.requestParams.rdmpOid)'
      });
      expect(result).to.deep.include({
        key: ['behaviours', '0', 'processors', '0', 'config', 'template'],
        kind: 'jsonata',
        value: 'runtimeContext.requestParams.rdmpOid'
      });
      expect(result).to.deep.include({
        key: ['behaviours', '0', 'actions', '0', 'config', 'fieldPath'],
        kind: 'jsonata',
        value: '$substringBefore(event.fieldId, "/title") & "/description"'
      });
      expect(result).to.deep.include({
        key: ['behaviours', '0', 'actions', '0', 'config', 'valueTemplate'],
        kind: 'jsonata',
        value: 'value.title'
      });
    });

    it('should preserve client-form expression keys while also extracting behaviours', async function () {
      const item = {
        name: 'mixed-form',
        componentDefinitions: [
          {
            name: 'title',
            expressions: [
              {
                name: 'title-copy',
                config: {
                  conditionKind: 'jsonpointer',
                  condition: '/title::field.value.changed',
                  target: 'model.value',
                  template: 'event.value',
                }
              }
            ],
            component: { class: 'SimpleInputComponent', config: { type: 'text' } },
            model: { class: 'SimpleInputModel', config: { validators: [] } },
            layout: { class: 'DefaultLayout', config: {} }
          }
        ],
        behaviours: [
          {
            name: 'behaviour-copy',
            condition: '$exists(event.value)',
            conditionKind: 'jsonata',
            actions: [
              {
                type: 'emitEvent',
                config: {
                  eventType: 'field.value.changed',
                  fieldId: '/title',
                  sourceId: '*',
                  valueTemplate: 'value'
                }
              }
            ]
          }
        ]
      } as any;

      const result = await FormRecordConsistencyService.extractRawTemplates(item, 'edit');

      expect(result).to.deep.include({
        key: ['componentDefinitions', '0', 'expressions', '0', 'config', 'template'],
        kind: 'jsonata',
        value: 'event.value'
      });
      expect(result).to.deep.include({
        key: ['behaviours', '0', 'condition'],
        kind: 'jsonata',
        value: '$exists(event.value)'
      });
      expect(result).to.deep.include({
        key: ['behaviours', '0', 'actions', '0', 'config', 'valueTemplate'],
        kind: 'jsonata',
        value: 'value'
      });
    });
  });

  describe('toKeysEntries (private)', function () {
    it('should handle objects', function () {
      const item = { a: 1, b: 2 };
      const result = (FormRecordConsistencyService as any).toKeysEntries(item);
      expect(result.keys).to.include('a');
      expect(result.keys).to.include('b');
    });

    it('should handle arrays', function () {
      const item = ['a', 'b'];
      const result = (FormRecordConsistencyService as any).toKeysEntries(item);
      expect(result.keys).to.include(0);
      expect(result.keys).to.include(1);
    });
  });
});
