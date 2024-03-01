module.exports.raid = {
  basePath: 'https://api.demo.raid.org.au',
  token: '',
  saveBodyInMeta: true,
  retryJobName: 'RaidMintRetryJob',
  retryJobSchedule: 'in 5 minutes', // https://github.com/matthewmueller/date#examples
  retryJobMaxAttempts: 5, // includes the initial attempt
  orcidBaseUrl: "https://orcid.org/",
  raidFieldName: 'raidUrl', // the `record.metadata` field name where the raid will be stored
  types: {
    title: {
      'Primary': {
        id: "https://github.com/au-research/raid-metadata/blob/main/scheme/title/type/v1/primary.json",
        schemaUri: "https://github.com/au-research/raid-metadata/tree/main/scheme/title/type/v1/"
      },
      'Alternative': {
        "id": "https://github.com/au-research/raid-metadata/blob/main/scheme/title/type/v1/alternative.json",
        "schemaUri": "https://github.com/au-research/raid-metadata/tree/main/scheme/title/type/v1/"
      },
    },
    description: {
      'Primary': {
        "id": "https://github.com/au-research/raid-metadata/blob/main/scheme/description/type/v1/primary.json",
        "schemaUri": "https://github.com/au-research/raid-metadata/tree/main/scheme/description/type/v1/"
      },
      'Alternative': {
        "id": "https://github.com/au-research/raid-metadata/blob/main/scheme/description/type/v1/alternative.json",
        "schemaUri": "https://github.com/au-research/raid-metadata/tree/main/scheme/description/type/v1/"
      }
    },
    language: {
      'eng': {
        "id": "eng",
        "schemaUri": "https://iso639-3.sil.org" 
      }
    },
    access: {
      'open': {
        "id": "https://github.com/au-research/raid-metadata/blob/main/scheme/access/type/v1/open.json",
        "schemaUri": "https://github.com/au-research/raid-metadata/tree/main/scheme/access/type/v1/"
      },
      'closed': {
        "id": "https://github.com/au-research/raid-metadata/blob/main/scheme/access/type/v1/closed.json",
        "schemaUri": "https://github.com/au-research/raid-metadata/tree/main/scheme/access/type/v1/"
      },
      'embargoed': {
        "id": "https://github.com/au-research/raid-metadata/blob/main/scheme/access/type/v1/embargoed.json",
        "schemaUri": "https://github.com/au-research/raid-metadata/tree/main/scheme/access/type/v1/"
      }
    },
    contributor: {
      position: {
        'Leader': {
            "schemaUri": "https://github.com/au-research/raid-metadata/tree/main/scheme/contributor/position/v1/",
            "id": "https://github.com/au-research/raid-metadata/blob/main/scheme/contributor/position/v1/leader.json"
        },
        'PrincipalInvestigator': {
          "schemaUri": "https://github.com/au-research/raid-metadata/tree/main/scheme/contributor/position/v1/",
          "id": "https://github.com/au-research/raid-metadata/blob/main/scheme/contributor/position/v1/principal-investigator.json"
        },
        'ContactPerson': {
          "schemaUri": "https://github.com/au-research/raid-metadata/tree/main/scheme/contributor/position/v1/",
          "id": "https://github.com/au-research/raid-metadata/blob/main/scheme/contributor/position/v1/contact-person.json"
        },
        'CoInvestigator': {
          "schemaUri": "https://github.com/au-research/raid-metadata/tree/main/scheme/contributor/position/v1/",
          "id": "https://github.com/au-research/raid-metadata/blob/main/scheme/contributor/position/v1/co-investigator.json"
        },
        'OtherParticipant': {
          "schemaUri": "https://github.com/au-research/raid-metadata/tree/main/scheme/contributor/position/v1/",
          "id": "https://github.com/au-research/raid-metadata/blob/main/scheme/contributor/position/v1/other-participant.json"
        }
      },
      flags: {
        leader: ['PrincipalInvestigator', 'Leader'],
        contact: ['ContactPerson']
      },
      hiearchy: {
        position: ['Leader', 'PrincipalInvestigator', 'CoInvestigator', 'ContactPerson', 'OtherParticipant']
      }
    },
    organisation: {
      role: {
        'Lead': {
          "schemaUri": "https://github.com/au-research/raid-metadata/tree/main/scheme/organisation/role/v1/",
          "id": "https://github.com/au-research/raid-metadata/blob/main/scheme/organisation/role/v1/lead-research-organisation.json"
        }
      }
    },
    subject: {
      for: {
        "id": "https://linked.data.gov.au/def/anzsrc-for/2020/",
        "schemaUri": "https://linked.data.gov.au/def/anzsrc-for/2020/"
      },
      seo: {
        "id": "https://linked.data.gov.au/def/anzsrc-seo/2020/",
        "schemaUri": "https://linked.data.gov.au/def/anzsrc-seo/2020/"
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
            position: 'Leader',
            role: 'ProjectAdministration',
            requireOrcid: true // defaults to false, when set records will be skipped if orcid value is missing      
          },
          contributor_data_manager: {
            fieldMap: { id: 'orcid' },
            position: 'ContactPerson',
            role: 'ProjectAdministration'        
          },
          contributors: {
            fieldMap: { id: 'orcid' },
            position: 'CoInvestigator',
            role: 'Investigation'        
          },
          contributor_supervisor: {
            fieldMap: { id: 'orcid' },
            position: 'Leader',
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