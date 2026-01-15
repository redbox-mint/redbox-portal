## Using a Repeatable Contributor Component to Define Record Permissions

Here is an example code block that will create a Repeatable Contributor component 
that will allow the user to define what permissions the defined user has to the record.

The component is [defined in in the shared form Angular module](https://github.com/redbox-mint/redbox-portal/blob/master/angular-legacy/shared/form/field-repeatable.component.ts#L472).

Included in the example is a subscription that will copy the CI's details into the list when it's entered.


```js
module.exports = [
{
  class: 'RepeatableContributor',
  compClass: 'RepeatableContributorComponent',
  definition: {
    name: "contributor_dmp_permissions",
    required: true,
    skipClone: [
      'showHeader',
      'initialValue'
    ],
    forceClone: [
      {
        field: 'vocabField',
        skipClone: [
          'injector'
        ]
      }
    ],
    fields: [
      {
        class: 'ContributorField',
        showHeader: true,
        definition: {
          required: true,
          label: '@dmpt-user-permissions-tab-dmp-permissions',
          help: '@dmpt-user-permissions-tab-dmp-permission-help',
          role: "@dmpt-user-permissions-tab-dmp-permission-role",
          freeText: false,
          forceLookupOnly: true,
          vocabId: 'Parties AND repository_name:People',
          sourceType: 'mint',
          fieldNames: [
            {
              'text_full_name': 'text_full_name'
            },
            {
              'full_name_honorific': 'text_full_name_honorific'
            },
            {
              'email': 'Email[0]'
            },
            {
              'given_name': 'Given_Name[0]'
            },
            {
              'family_name': 'Family_Name[0]'
            },
            {
              'honorific': 'Honorific[0]'
            },
            {
              'full_name_family_name_first': 'dc_title'
            },
            {
              'orcid': 'orcid[0]'
            },
            {
              'dc_identifier': 'dc_identifier'
            }
          ],
          searchFields: 'autocomplete_given_name,autocomplete_family_name,autocomplete_full_name',
          titleFieldArr: [
            'text_full_name'
          ],
          titleFieldDelim: '',
          nameColHdr: '@dmpt-user-permissions-tab-name-hdr',
          emailColHdr: '@dmpt-user-permissions-tab-email-hdr',
          orcidColHdr: '',
          roleColHdr: '@dmpt-user-permissions-tab-role-hdr',
          showRole: true,
          showOrcid: false,
          showTitle: false,
          activeValidators: {
            email: [
              'required',
              'email'
            ]
          },
          role: [
            'View'
          ],
          roles: [
            {
              value: "View",
              label: "View"
            },
            {
              value: "View&Edit",
              label: "Edit"
            }
          ]
        }
      }
    ],
    subscribe: {
      'contributor_ci': {
        onValueUpdate: [
          {
            action: 'utilityService.getMergedObjectAsArray',
            fieldsToMatch: [
              'email'
            ],
            fieldsToSet: [
              'text_full_name',
              'full_name_honorific',
              'email',
              'given_name',
              'family_name',
              'honorific',
              'full_name_family_name_first'
            ],
            templateObject: {
              'text_full_name': null,
              'full_name_honorific': null,
              'email': null,
              'given_name': null,
              'family_name': null,
              'honorific': null,
              'full_name_family_name_first': null,
              'username': null,
              'role': [
                'View&Edit'
              ],
              'orcid': null,
              'dc_identifier': null
            },
            includeFieldInFnCall: true
          }
        ]
      }
    }
  }
}
];
```

This is what the Repeatable Contributor Component can look like:

![image1](https://github.com/user-attachments/assets/74be67f2-6857-4f92-8ed9-6a8a950e0a6d)


To have the permissions apply appropriately for the record, use the following trigger configuration

```js
module.exports.recordtype = {
    '[type]': {
        hooks: {
            onUpdate: {
                pre: [{
                    function: 'sails.services.rdmpservice.complexAssignPermissions',
                    options: {
                        "emailProperty": "email",
                        "userProperties": [
                            "metadata.contributor_dmp_permissions"
                        ],
                        "editPermissionRule": "<%= role == 'View&Edit' %>",
                        "viewPermissionRule": "<%= role == 'View&Edit' ||  role == 'View' %>",
                        "recordCreatorPermissions": "view&edit"
                    }
                }]
            }
        }
    }
};
```



