module.exports = [
  // -------------------------------------------------------------------
  // License Tab
  // -------------------------------------------------------------------
  {
    class: "Container",
    definition: {
      id: "license",
      label: "@dataPublication-license-tab",
      fields: [
        {
          class: 'Container',
          compClass: 'TextBlockComponent',
          definition: {
            value: '@dataPublication-license-heading',
            type: 'h3'
          }
        },
        {
          class: 'SelectionField',
          compClass: 'DropdownFieldComponent',
          definition: {
            name: 'license_identifier',
            label: '@dataPublication-dc:license.dc:identifier',
            help: '@dataPublication-dc:license.dc:identifier-help',
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>',
            options: [
              {
                  value: "",
                  label: "@dmpt-select:Empty"
              },
              {
                  value: "http://creativecommons.org/licenses/by/3.0/au",
                  label: "CC BY: Attribution 3.0 AU"
              },
              {
                  value: "http://creativecommons.org/licenses/by-sa/3.0/au",
                  label: "CC BY-SA: Attribution-Share Alike 3.0 AU"
              },
              {
                  value: "http://creativecommons.org/licenses/by-nd/3.0/au",
                  label: "CC BY-ND: Attribution-No Derivative Works 3.0 AU"
              },
              {
                  value: "http://creativecommons.org/licenses/by-nc/3.0/au",
                  label: "CC BY-NC: Attribution-Noncommercial 3.0 AU"
              },
              {
                  value: "http://creativecommons.org/licenses/by-nc-sa/3.0/au",
                  label: "CC BY-NC-SA: Attribution-Noncommercial-Share Alike 3.0 AU"
              },
              {
                  value: "http://creativecommons.org/licenses/by-nc-nd/3.0/au",
                  label: "CC BY-NC-ND: Attribution-Noncommercial-No Derivatives 3.0 AU"
              },
              {
                  value: "http://creativecommons.org/licenses/by/4.0",
                  label: "CC BY 4.0: Attribution 4.0 International"
              },
              {
                  value: "http://creativecommons.org/licenses/by-sa/4.0",
                  label: "CC BY-SA 4.0: Attribution-Share Alike 4.0 International"
              },
              {
                  value: "http://creativecommons.org/licenses/by-nd/4.0",
                  label: "CC BY-ND 4.0: Attribution-No Derivative Works 4.0 International"
              },
              {
                  value: "http://creativecommons.org/licenses/by-nc/4.0",
                  label: "CC BY-NC 4.0: Attribution-Noncommercial 4.0 International"
              },
              {
                  value: "http://creativecommons.org/licenses/by-nc-sa/4.0",
                  label: "CC BY-NC-SA 4.0: Attribution-Noncommercial-Share Alike 4.0 International"
              },
              {
                  value: "http://creativecommons.org/licenses/by-nc-nd/4.0",
                  label: "CC BY-NC-ND 4.0: Attribution-Noncommercial-No Derivatives 4.0 International"
              },
              {
                  value: "http://opendatacommons.org/licenses/pddl/1.0/",
                  label: "PDDL - Public Domain Dedication and License 1.0"
              },
              {
                  value: "http://opendatacommons.org/licenses/by/1.0/",
                  label: "ODC-By - Attribution License 1.0"
              },
              {
                  value: "http://opendatacommons.org/licenses/odbl/1.0/",
                  label: "ODC-ODbL - Attribution Share-Alike for data/databases 1.0"
              }
            ]
          }
        },
        {
          class: 'MarkdownTextArea',
          definition: {
            name: 'license_notes',
            label: '@dataPublication-dc:license.rdf:Alt.skos:prefLabel',
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>'
          }
        },
        {
          class: 'TextField',
          definition: {
            name: 'license_other_url',
            label: '@dataPublication-dc:license.rdf:Alt.dc:identifier',
            help: '@dataPublication-dc:license.rdf:Alt.dc:identifier-help',
            type: 'text',
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>'
          }
        },
        {
          class: 'TextField',
          definition: {
            name: 'license_statement',
            label: '@dataPublication-dc:accessRights.dc:RightsStatement.skos:prefLabel',
            help: '@dataPublication-dc:accessRights.dc:RightsStatement.skos:prefLabel-help',
            type: 'text',
            required: true,
            defaultValue: '@dataPublication-dc:accessRights.dc:RightsStatement.skos:prefLabel-default',
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>'
          }
        },
        {
          class: 'TextField',
          definition: {
            name: 'license_statement_url',
            label: '@dataPublication-dc:accessRights.dc:RightsStatement.dc:identifier',
            help: '@dataPublication-dc:accessRights.dc:RightsStatement.dc:identifier-help',
            type: 'text',
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>'
          }
        }
      ]
    }
  }
];
