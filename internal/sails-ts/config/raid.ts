import type { SailsConfig } from "redbox-core-types";

const raidConfig: SailsConfig["raid"] = {
  basePath: 'https://api.stage.raid.org.au',
  token: '',
  saveBodyInMeta: true,
  retryJobName: 'RaidMintRetryJob',
  retryJobSchedule: 'in 5 minutes', // https://github.com/matthewmueller/date#examples
  retryJobMaxAttempts: 5, // includes the initial attempt
  orcidBaseUrl: "https://orcid.org/",
  raidFieldName: 'raidUrl', // the `record.metadata` field name where the raid will be stored
  types: {
    // Based on https://vocabs.ardc.edu.au/viewById/682
    title: {
      'Primary': {
        id: "https://vocabulary.raid.org/title.type.schema/5",
        schemaUri: "https://vocabulary.raid.org/title.type.schema/376"
      },
      'Alternative': {
        id: "https://vocabulary.raid.org/title.type.schema/4",
        schemaUri: "https://vocabulary.raid.org/title.type.schema/376"
      },
    },
    description: {
      'Primary': {
        "id": "https://vocabulary.raid.org/description.type.schema/318",
        "schemaUri": "https://vocabulary.raid.org/description.type.schema/320"
      },
      'Alternative': {
        "id": "https://vocabulary.raid.org/description.type.schema/319",
        "schemaUri": "https://vocabulary.raid.org/description.type.schema/320"
      }
    },
    language: {
      'eng': {
        "id": "eng",
        "schemaUri": "https://www.iso.org/standard/74575.html" 
      }
    },
    access: {
      'open': {
        "id": "https://vocabularies.coar-repositories.org/access_rights/c_abf2/",
        "schemaUri": "https://vocabularies.coar-repositories.org/access_rights/"
      },
      'closed': {
        "id": "https://vocabularies.coar-repositories.org/access_rights/c_16ec/",
        "schemaUri": "https://vocabularies.coar-repositories.org/access_rights/"
      },
      'embargoed': {
        "id": "https://vocabularies.coar-repositories.org/access_rights/c_f1cf/",
        "schemaUri": "https://vocabularies.coar-repositories.org/access_rights/"
      }
    },
    contributor: {
      // https://metadata.raid.org/en/latest/core/contributors.html#contributor-position-id
      position: {
        // 'Leader': {
        //     "schemaUri": "https://orcid.org/",
        //     "id": "https://github.com/au-research/raid-metadata/blob/main/scheme/contributor/position/v1/leader.json"
        // },
        'PrincipalInvestigator': {
          "schemaUri": "https://vocabulary.raid.org/contributor.position.schema/305",
          "id": "https://vocabulary.raid.org/contributor.position.schema/307"
        },
        // 'ContactPerson': {
        //   "schemaUri": "https://orcid.org/",
        //   "id": "https://github.com/au-research/raid-metadata/blob/main/scheme/contributor/position/v1/contact-person.json"
        // },
        'CoInvestigator': {
          "schemaUri": "https://vocabulary.raid.org/contributor.position.schema/305",
          "id": "https://vocabulary.raid.org/contributor.position.schema/308"
        },
        'PartnerInvestigator': {
          "schemaUri": "https://vocabulary.raid.org/contributor.position.schema/305",
          "id": "https://vocabulary.raid.org/contributor.position.schema/309"
        },
        'Consultant': {
          "schemaUri": "https://vocabulary.raid.org/contributor.position.schema/305",
          "id": "https://vocabulary.raid.org/contributor.position.schema/310"
        },
        'OtherParticipant': {
          "schemaUri": "https://vocabulary.raid.org/contributor.position.schema/305",
          "id": "https://vocabulary.raid.org/contributor.position.schema/311"
        },
        'OtherParticipantDataManager': {
          "schemaUri": "https://vocabulary.raid.org/contributor.position.schema/305",
          "id": "https://vocabulary.raid.org/contributor.position.schema/311"
        }
      },
      flags: {
        leader: ['PrincipalInvestigator'],
        contact: ['OtherParticipantDataManager']
      },
      hiearchy: {
        position: ['PrincipalInvestigator', 'CoInvestigator', 'PartnerInvestigator', 'Consultant', 'OtherParticipant']
      },
      // FYI: in pre-prod versions this used to be mapped via pre-generated enum, now it is hard coded here
      roles: {
        schemaUri: "https://credit.niso.org/",
        types: {
          "Conceptualization": "conceptualization",
          "DataCuration": "data-curation",
          "FormalAnalysis": "formal-analysis",
          "FundingAcquisition": "funding-acquisition",
          "Investigation": "investigation",
          "Methodology": "methodology",
          "ProjectAdministration": "project-administration",
          "Resources": "resources",
          "Software": "software",
          "Supervision": "supervision",
          "Validation": "validation",
          "Visualization": "visualization",
          "WritingOriginalDraft": "writing-original-draft",
          "WritingReviewEditing": "writing-review-editing"
        }
      }
    },
    organisation: {
      role: {
        'Lead': {
          "schemaUri": "https://vocabulary.raid.org/organisation.role.schema/359",
          "id": "https://vocabulary.raid.org/organisation.role.schema/182"
        }
      }
    },
    subject: {
      for: {
        "id": "https://linked.data.gov.au/def/anzsrc-for/2020/",
        "schemaUri": "https://vocabs.ardc.edu.au/viewById/316"
      },
      seo: {
        "id": "https://vocabs.ardc.edu.au/repository/api/lda/anzsrc-2020-seo/resource?https://linked.data.gov.au/def/anzsrc-seo/2020/",
        "schemaUri": "https://vocabs.ardc.edu.au/viewById/316"
      }
      
    }
  },
  mapping: {
    // the vanilla RAiD mapping
    dmp: {
    /*
      Schema:
        human_friendly_name: { <- uniquely identify this config item
          src: '', <- the _.get() path of the source OR a _.template() string. For the latter, see RaidService.getMappedData() `imports` object for the injected variables.
          dest: '' <- the _.set() path destination
        },
    */
      title_text: { 
        dest: 'title[0].text',
        src: 'metadata.title',
      },
      title_type: {
        dest: 'title[0].type',
        src: '<%= JSON.stringify(types.title.Primary)  %>',
        parseJson: true
      },
      title_lang: {
        dest: 'title[0].language',
        src: '<%= JSON.stringify(types.language.eng)  %>',
        parseJson: true
      },
      title_startDate: {
        dest: 'title[0].startDate',
        src: 'metadata.dc:coverage_vivo:DateTimeInterval_vivo:start',
      },
      title_endDate: {
        dest: 'title[0].endDate',
        src: 'metadata.dc:coverage_vivo:DateTimeInterval_vivo:end'
      },
      date_start: {
        dest: 'date.startDate',
        src: 'metadata.dc:coverage_vivo:DateTimeInterval_vivo:start'
      },
      date_end: {
        dest: 'date.endDate',
        src: 'metadata.dc:coverage_vivo:DateTimeInterval_vivo:end',
      },
      description_main: {
        dest: 'description[0].text',
        src: 'metadata.description',
      },
      description_type: {
        dest: 'description[0].type',
        src: '<%= JSON.stringify(types.description.Primary) %>',
        parseJson: true
      }, 
      description_lang: {
        dest: 'description[0].language',
        src: '<%= JSON.stringify(types.language.eng)  %>',
        parseJson: true
      },
      access_type: {
        dest: 'access.type',
        // Always open, otherwise will return 'Creating closed Raids is no longer supported'
        src: '<%= JSON.stringify(types.access.open) %>',
        parseJson: true
      },
      // return the value/label when access rights isn't "open"
      access_statement_text: {
        dest: 'access.accessStatement.text',
        src: '<%= record.metadata["dc:accessRights"] %>'
      },
      access_statement_lang: {
        dest: 'access.accessStatement.language',
        src: '<%= JSON.stringify(types.language.eng) %>',
        parseJson:true,
      },
      contributors: {
        dest: 'contributor',
        src: '<%= JSON.stringify(that.getContributors(record, options, fieldConfig, mappedData)) %>',
        parseJson: true,
        contributorMap: {
          contributor_ci: {
            fieldMap: { id: 'orcid' }, // allows for the orcid to be renamed or be sourced elsewhere
            position: 'PrincipalInvestigator',
            role: 'ProjectAdministration',
            requireOrcid: true // defaults to false, when set records will be skipped if orcid value is missing      
          },
          contributor_data_manager: {
            fieldMap: { id: 'orcid' },
            position: 'OtherParticipantDataManager',
            role: 'ProjectAdministration'        
          },
          contributors: {
            fieldMap: { id: 'orcid' },
            position: 'CoInvestigator',
            role: 'Investigation'        
          },
          contributor_supervisor: {
            fieldMap: { id: 'orcid' },
            position: 'PartnerInvestigator',
            role: 'Supervision'        
          }
        }
      },
      organisations_id: {
        dest: 'organisation[0].id',
        src: "<%= 'https://ror.org/03sd43014' %>",
      },
      organisations_identifierSchemaUri: {
        src: "<%= 'https://ror.org/' %>",
        dest: 'organisation[0].schemaUri'
      },
      organisations_roles: {
        dest: 'organisation[0].role',
        src: "<% const roles = [{ schemaUri: types.organisation.role.Lead.schemaUri, id:types.organisation.role.Lead.id, startDate:  mappedData?.date?.startDate, endDate: mappedData?.date?.endDate }]; print(JSON.stringify(roles)) %>",
        parseJson: true,
      },
      // alternateUrl: https://metadata.raid.org/en/latest/core/alternateUrls.html
      //  DMPs are not public, leaving optional and unconfigured
      subject_for: {
        dest: 'subject',
        src: '<%= JSON.stringify(that.getSubject(record, options, fieldConfig, _.get(mappedData, "subject", []), "for", record.metadata["dc:subject_anzsrc:for"])) %>',
        parseJson: true
      },
    }
  }
};

module.exports.raid = raidConfig;
