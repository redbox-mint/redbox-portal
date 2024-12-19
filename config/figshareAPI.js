module.exports.figshareAPI = {
  frontEndURL: 'https://cqu.figsh.com', //stage
  baseURL: 'https://api.figsh.com/v2', //stage
  APIToken: '', //Stage
  figArticleGroupId: 32014, //Dataset stage
  //frontEndURL: 'https://cqu.figshare.com', //prod
  //baseURL: 'https://api.figshare.com/v2', //prod
  //APIToken: '', //Prod
  //figArticleGroupId: 30527, //Dataset prod
  attachmentsTempDir: '/attachments',
  attachmentsFigshareTempDir: '/attachments/figshare',
  diskSpaceThreshold: 10737418240, //set diskSpaceThreshold to a reasonable amount of space on disk that will be left free as a safety buffer
  figArticleItemType: 'dataset',
  testMode: false,
  testUsers: [],
  testLicenses: [],
  testCategories: [],
  // testLicenses: [
  //   {
  //     "value": 1,
  //     "name": "CC BY",
  //     "url": "http://creativecommons.org/licenses/by/4.0"
  //   },
  //   {
  //     "value": 2,
  //     "name": "BSD 3-Clause",
  //     "url": "https://opensource.org/licenses/BSD-3-Clause"
  //   },
  //   {
  //     "value": 3,
  //     "name": "InC 1.0",
  //     "url": "https://rightsstatements.org/page/InC/1.0/?language=en"
  //   }
  // ],
  //testUsers: [{ id: 2657024, user_id: 3674908, email: 'uon-staging-figshare@redboxresearchdata.com.au' }],
  //testCategories: [ 31196, 31272, 31266, 31372 ],
  mapping: {
    recordFigArticleId: 'metadata.figshare_article_id',
    recordFigArticleURL: 'metadata.figshare_article_location',
    recordDataLocations: 'metadata.dataLocations',
    recordAuthorExternalName: 'text_full_name',
    recordAuthorUniqueBy: 'email',
    figshareAuthorUserId: 'user_id', //user_id = author id
    figshareIsEmbargoed: 'is_embargoed',
    figshareEmbargoType: 'embargo_type',
    figshareCurationStatus: 'curation_status',
    response: {
      entityId: 'entity_id',
      location: 'location',
      article: []
    },
    artifacts: {
      authorResearchInstitute:  [
          {figshareName: 'Appleton Institute', redboxName: 'Appleton Institute (AI)'},
          {figshareName: 'Centre for Intelligent Systems', redboxName: 'Centre for Intelligent Systems (CIS)'},
          {figshareName: 'Centre for Railway Engineering', redboxName: 'Centre for Railway Engineering (CRE)'},
          {figshareName: 'Centre for Indigenous Health Equity Research', redboxName: 'Centre for Indigenous Health Equity Research (CIHER)'},
          {figshareName: 'Coastal Marine Ecosystems Research Centre (CMERC)', redboxName: 'Coastal Marine Ecosystems Research Centre (CMERC)'},
          {figshareName: 'Institute for Future Farming Systems', redboxName: 'Institute for Future Farming Systems (IFFS)'},
          {figshareName: 'Queensland Centre for Domestic and Family Violence', redboxName: 'Queensland Centre for Domestic and Family Violence Research (QCDFVR)'},
          {figshareName: 'Centre for Research in Equity and Advancement of Teaching & Education (CREATE)', redboxName: 'Centre for Research in Equity and the Advancement of Teaching and Education (CREATE)'},
          {figshareName: 'Centre for Tourism and Regional Opportunities', redboxName: ''}, //In Figshare only for historical purposes no need to be send across
          {figshareName: 'Centre for Regional Advancement of Learning, Equity, Access and Participation (LEAP)', redboxName: ''}, //In Figshare only for historical purposes no need to be send across
          {figshareName: 'Centre for Regional Economics and Supply Chain (RESC)', redboxName: 'Centre for Regional Economies and Supply Chains (CRESC)'}
      ],
      //This artifact allows to configure project specific rules to build a list of authors based of the particular structure of a
      //ReDBox record. In example in CQU the contributor_ci field is joined with the list of users in contributors field but in UON 
      //we just need the list from creators field but also ensuring each row is a valid entry row. The algorithim basic process is
      //as below:
      //
      // FindAuthor_Step1 - Get list of contributors from a ReDBox record based of particular project specific fields and rules
      // FindAuthor_Step2 - Iterate trhough the list of contributors generated in Step 1 to find/match Figshare IDs and those not found are 
      //                    also added to the new list to be created as externals/unmatched authors by name only. This step requires calling 
      //                    the API endpoint using identifiers that are also configurable
      // FindAuthor_Step3 - Set the matched Figshare Author User IDs and External Authors Names to the correspondent Figshare field in the 
      //                    create/update request to be sent to the API endpoint
      //
      //The artifact/method below is used by - Step 1 - to get the list of contributors from a ReDBox record 
      getContributorsFromRecord: {
        template: `<% let authors = [];
                     if(!_.isUndefined(record['metadata']['contributor_ci'])) {
                        let contributorCI = record['metadata']['contributor_ci'];
                        authors.push(contributorCI);
                      }
                      let figArtOthers;
                      if(!_.isUndefined(record['metadata']['contributors'])) {
                        figArtOthers = record['metadata']['contributors'];
                        for(let contributor of figArtOthers) {
                          if(!_.isEmpty(contributor['family_name'])) {
                            authors.push(contributor);
                          } else if(!_.isEmpty(contributor['text_full_name'])) {
                            authors.push(contributor);
                          }
                        }
                      }
                      return authors;
                    %>`
      },
      //This artifact allows to configure project specific rules to build a list of categories based of the selected FOR codes
      //from a ReDBox record in a similar way with the authors artifact with the difference that there is a mapping config file
      //that has the FOR Codes and correspondent Figshare IDs for each category that is static instead of calling the API
      //
      // FindCat_Step1 - Get list of FOR codes from the project specific field of a ReDBox record and iterate trhough the static 
      //                 file mapping list to find/match correspondent Figshare IDs
      // FindCat_Step2 - Set the list matched Figshare categoriy IDs generated in Step 1 to the correspondent Figshare field in the 
      //                 create/update request to be sent to the API endpoint 
      //                  
      //The artifact/method below is used by - FindCat_Step1 - to get the list of Figshare category IDs from a ReDBox record    
      getCategoryIDs: {
        template: `<% let catIDs = [];
                    let dpCategories = _.get(record,'metadata.dc:subject_anzsrc:for',[]);
                    for (let dpCategory of dpCategories) {
                      let dpForNotation = _.get(dpCategory,'notation','');
                      if(dpForNotation.length > 4) {
                        let dpCategoryId = _.find(forCodes, ['FOR2020Code', dpForNotation]);
                        if(!_.isUndefined(dpCategoryId) && _.has(dpCategoryId, 'FigCatId') && dpCategoryId.FigCatId > 0) {
                          catIDs.push(dpCategoryId.FigCatId);
                        }
                      }
                    }
                    return catIDs;
                    %>`
      }
    },
    templates: {
      impersonate: {
        impersonate: 0
      },
      customFields: {
        create: {
          'Open Access': ['No'],
          'Full Text URL': ['']
        },
        update: {
          'Supervisor': '', //max length 250
          'Open Access': ['No'],
          'Start Date': '', 
          'Finish Date': '',
          'Cultural Warning': '',
          'Language': '', //max length 250
          'Additional Rights': '', //max length 1000
          'Number and size of Dataset': '', //max length 250
          'Medium': '', //max length 250
          'Author Research Institute': '', 
          'Geolocation': '', // length 250
          'Full Text URL': ['']  
        }
      },
      getAuthor: [
        {
          institution_user_id: 0,
          template: `<% let userId = field['dc_identifier'][0];
                        return userId;
                      %>`
        }
      ]
    },
    customFields: {
      path: 'custom_fields',
      create: [
          { 
              figName: 'Open Access',
              rbName: 'metadata.access-rights',
              template: `<% let val = [field.defaultValue];
                           if(_.get(record,field.rbName,'') == 'Open Access') {
                             val = ['Yes'];
                           }
                           return val;
                          %>`,
              defaultValue: 'No'
          },
          {
              figName: 'Full Text URL', 
              rbName: 'metadata.dataLocations',
              template: `<% let dataLocations = _.get(record,field.rbName,field.defaultValue);
                           for(let attachmentFile of dataLocations) {
                             if(!_.isUndefined(attachmentFile) && !_.isEmpty(attachmentFile) && attachmentFile.type == 'url') {
                               return [attachmentFile.location];
                             }
                           }
                           return field.defaultValue;
                         %>`,
              defaultValue: [''],
              validations: [
                {
                  template: `<% let path = 'custom_fields'; 
                              let val = _.get(request,path,{});
                              let fullTextURL = _.get(val,field.figName,'')[0];
                              if(!_.isEmpty(fullTextURL) && !_.startsWith(fullTextURL, 'http://') && !_.startsWith(fullTextURL, 'https://')) {
                                return false;
                              } else {
                                return true;
                              }
                            %>`,
                  message: '@backend-URL-validationMessage'
                }
              ]
          }
      ],
      update: [
        {
            figName: 'Number and size of Dataset', 
            rbName: 'metadata.dataset-size', 
            defaultValue: '',
            validations: [
              {
                maxLength: 250,
                message: '@dataRecord-dataset-size'
              }
            ]
        },
        {
            figName: 'Cultural Warning',
            rbName: 'metadata.-atsi-content',
            template: '<%= _.get(record,field.rbName,"") == "yes" ? field.defaultValue : "" %>',
            defaultValue: 'This research output may contain the names and images of Aboriginal and Torres Strait Islander people now deceased. We apologize for any distress that may occur.' 
        },
        {
            figName: 'Medium', 
            rbName: 'metadata.dataset-format', 
            defaultValue: '',
            validations: [
              {
                maxLength: 250,
                message: '@dmpt-dataset-format'
              }
            ]
        },
        {
            figName: 'Open Access',
            rbName: 'metadata.access-rights',
            template: `<% let val = [field.defaultValue];
                         if(_.get(record,field.rbName,'') == 'Open Access') {
                           val = ['Yes'];
                         }
                         return val;
                        %>`,
            defaultValue: 'No' 
        },
        {
            figName: 'Full Text URL',
            rbName: 'metadata.dataLocations',
            template: `<% let dataLocations = _.get(record,field.rbName,field.defaultValue);
                         for(let attachmentFile of dataLocations) {
                           if(!_.isUndefined(attachmentFile) && !_.isEmpty(attachmentFile) && attachmentFile.type == 'url') {
                             return [attachmentFile.location];
                           }
                         }
                         return field.defaultValue;
                       %>`,
            defaultValue: [''],
            validations: [
              {
                template: `<% let path = 'custom_fields'; 
                            let val = _.get(request,path,{});
                            let fullTextURL = _.get(val,field.figName,'')[0];
                            if(!_.isEmpty(fullTextURL) && !_.startsWith(fullTextURL,'http://') && !_.startsWith(fullTextURL,'https://')) {
                              return false;
                            } else {
                              return true;
                            }
                          %>`,
                message: '@backend-URL-validationMessage'
              }
            ]
        },
        {
            figName: 'Supervisor',
            rbName: 'metadata.contributor_supervisor',
            template: `<% let supervisorsStringList = field.defaultValue;
                         let supervisors = _.get(record,field.rbName);
                         if(!_.isUndefined(supervisors)) {
                           for(let supervisor of supervisors) {
                             if(!_.isUndefined(supervisor['text_full_name']) && supervisor['text_full_name'] != null && supervisor['text_full_name'] != 'null') {
                               if(_.isEmpty(supervisorsStringList)) {
                                 supervisorsStringList = supervisor['text_full_name'];
                               } else {
                                 supervisorsStringList = supervisorsStringList + ', ' + supervisor['text_full_name'];
                               }
                             }
                           }
                         }
                         return supervisorsStringList;
                       %>`,
            defaultValue: '',
            validations: [
              {
                template: `<% let path = 'custom_fields'; 
                            let customFields = _.get(request,path,{});
                            let val = _.get(customFields,field.figName,undefined);
                            if(_.isUndefined(val)) {
                              return false;
                            } else {
                              return true;
                            }
                          %>`,
                message: '@dmpt-people-tab-supervisor',
                addSuffix: true
              },
              {
                maxLength: 250,
                message: '@dmpt-people-tab-supervisor'
              }
            ]
        },
        {
            figName: 'Start Date',
            rbName: 'metadata.startDate',
            template: `<% let val = field.defaultValue;
                         let startDate = _.get(record,field.rbName,'');
                         if(startDate != '' && startDate != 'Invalid date') {
                           val = startDate;
                         }
                         return val;
                       %>`,
            defaultValue: ''
        },
        {
            figName: 'Finish Date',
            rbName: 'metadata.endDate',
            template: `<% let val = field.defaultValue;
                         let endDate = _.get(record,field.rbName,'');
                         if(endDate != '' && endDate != 'Invalid date') {
                           val = endDate;
                         }
                         return val;
                       %>`,
            defaultValue: ''
        },
        {
            figName: 'Language',
            rbName: 'metadata.languages',
            template: `<% let val = field.defaultValue;
                         let languages = _.get(record,field.rbName,[]);
                         for(let language of languages) {
                           if(!_.isEmpty(language)){
                             if(_.isEmpty(val)) {
                               val = language;
                             } else {
                               val = val + ', ' + language;
                             }
                           }
                         }
                         return val;
                       %>`,
            defaultValue: '',
            validations: [
              {
                maxLength: 250,
                message: '@dataRecord-languages'
              }
            ]
        },
        {
            figName: 'Geolocation',
            rbName: 'metadata.geolocations',
            template: `<% let val = field.defaultValue;
                         let locationNames = _.get(record,field.rbName,[]);
                         for(let location of locationNames) {
                           let loc = _.get(location,'basic_name','');
                           if(!_.isEmpty(loc)){
                             if(_.isEmpty(val)) {
                               val = loc;
                             } else {
                               val = val + ', ' + loc;
                             }
                           }
                         }
                         return val;
                       %>`,
            defaultValue: '',
            validations: [
              {
                maxLength: 250,
                message: '@dataRecord-geolocation'
              }
            ]
        },
        { 
            figName: 'Additional Rights',
            rbName: 'metadata.third-party-licences',
            template: `<% let val = field.defaultValue;
                         let thirdPartyLicences = _.get(record,field.rbName,[]);
                         for(let thirdParty of thirdPartyLicences) {
                           if(!_.isEmpty(thirdParty)) {
                             val = thirdParty;
                             return val;
                           }
                         }
                         return val;
                       %>`,
            defaultValue: '',
            validations: [
              {
                maxLength: 1000,
                message: '@dataRecord-third-party-licences'
              }
            ]
        },
        {
          figName: 'Author Research Institute',
          rbName: 'metadata.research-center',
          template: `<% let val = field.defaultValue;
                       let researchInstitutes = _.get(record,field.rbName,[]);
                       let authorResearchInstitutes = artifacts.authorResearchInstitute;
                       let figshareAuthorRIs = [];
                       if(!_.isUndefined(authorResearchInstitutes) && !_.isEmpty(authorResearchInstitutes) && !_.isEmpty(researchInstitutes)) {
                          for(let aRI of researchInstitutes) {
                            let aRIMappedFigshareName = _.find(authorResearchInstitutes, ['redboxName', aRI]);
                            if(!_.isUndefined(aRIMappedFigshareName)) {
                              figshareAuthorRIs.push(aRIMappedFigshareName['figshareName']);
                            }
                          }
                          if(!_.isEmpty(figshareAuthorRIs)) {
                            return figshareAuthorRIs;
                          } else {
                            return val; 
                          }
                       }
                       return val;
                     %>`,
          defaultValue: []
        }
      ]
    },
    targetState: {
      //To make the item created in Figshare to remain in Draft state uncomment "draft" and comment "publish" target state. 
      //Also in either draft or publish target states the impersonate option may need to be set or unset as required by
      //Figshare defined rules. Also it may be possible that if Administrative review is required on the Figshare platform
      //then the review process may not be bypassable through the API and will be enforced by Figshare. If the institution 
      //needs an article to be "Published" immediately, they will need to contact their Figshare administrator or support 
      //to clarify if there's a way to configure the approval process differently for their account or assist in publishing
      // 
      // draft: []

      //To make the item created in Figshare to go to Public/Publish state uncomment "publish" target state and comment "draft" 
      //state. Also in either draft or publish target states the impersonate option may need to be set or unset as required by
      //Figshare defined rules
      //
      publish: [
        //The impersonate option must be included in the query string when using the 
        //GET and DELETE methods, and in the body when using the POST and PUT methods
        //https://docs.figshare.com/#figshare_documentation_api_description_impersonation
        {
          figName: 'impersonate', 
          rbName: '',
          unset: true
        }
      ]
    },
    upload: {
      attachments: [
        //The impersonate option must be included in the query string when using the 
        //GET and DELETE methods, and in the body when using the POST and PUT methods
        //https://docs.figshare.com/#figshare_documentation_api_description_impersonation
        {
          figName: 'impersonate', 
          rbName: '',
          unset: true
        }
      ],
      //Evaluate project specific rules that can override the need to upload files present in data locations list
      //
      //In example if the form has a checkbox that can be ticked to ignore upload of files. This template evaluation 
      //must return true to continue with upload or false to stop upload
      // 
      // override: {
      //    template: `<%  eval rules %>`
      //           }
      //
      //
      //Leave empty if not needed
      override: {
        template: `<% let accessRights = _.get(record,'metadata.access-rights');
                      if(accessRights == 'citation'){
                        return true;
                      }
                      return false;
                    %>`
      }
    },
    standardFields: {
      create: [
        //The impersonate option must be included in the query string when using the 
        //GET and DELETE methods, and in the body when using the POST and PUT methods
        //https://docs.figshare.com/#figshare_documentation_api_description_impersonation
        {
          figName: 'impersonate', 
          rbName: '',
          template: `<% if(!_.isUndefined(runtimeArtifacts) && runtimeArtifacts.length > 0) {
                       let authorPI = runtimeArtifacts[0];
                       accountId = authorPI['id'];
                       return accountId;
                     } else {
                       return field.defaultValue;
                     } %>`,
          runByNameOnly: true,
          defaultValue: '',
          validations: [
            {
              template: `<% let val = _.get(request,field.figName,undefined);
                            if(_.isUndefined(val)) {
                              return false;
                            } else {
                              return true;
                            } %>`,
              message: '@dataPublication-accountIdNotFound-validationMessage'
            }
          ]
        },
        { 
            figName: 'title', 
            rbName: 'metadata.title', 
            defaultValue: ''
        },
        { 
            figName: 'description', 
            rbName: 'metadata.description',
            defaultValue: ''
        },
        { 
            figName: 'keywords',
            rbName: 'metadata.finalKeywords',
            defaultValue: []
        },
        //Field to be set by - FindCat_Step2 - using the list generated in - FindCat_Step1 - that is passed in the context of the lodash 
        //template as a runtime artifact (because is genarated at runtime)
        {
            figName: 'categories',
            rbName: '',
            template: `<% let categories = field.defaultValue;
                        if(!_.isUndefined(runtimeArtifacts) && !_.isEmpty(runtimeArtifacts)){
                          categories = runtimeArtifacts;
                        }
                        return categories;
                       %>`,
            runByNameOnly: true, //Only the fields that are "run by name only" can use runtime artifacts 
            defaultValue: [] //29888
        },
        {
            figName: 'license', 
            rbName: 'metadata.license-identifier',
            template: `<% let licenseValue = field.defaultValue;
                          if(!_.isUndefined(runtimeArtifacts) && !_.isEmpty(runtimeArtifacts)) {
                            let figArtLicense = _.get(record,'metadata.license_identifier','');
                            let tmpLic = figArtLicense.replace('https://', '');
                            figArtLicense = tmpLic.replace('http://', '');
                            for (let license of runtimeArtifacts) {
                              if(!_.isUndefined(license.url) && !_.isEmpty(license.url) && license.url.includes(figArtLicense)) {
                                licenseValue = license.value;
                                return _.toNumber(licenseValue);
                              }
                            }
                          }
                          return licenseValue;
                        %>`,
            defaultValue: 0,
            runByNameOnly: true,
            validations: [
              {
                template: `<% let val = _.get(request,field.figName,undefined);
                            if(_.isUndefined(val)) {
                              return false;
                            } else {
                              return true;
                            }
                          %>`,
                message: '@dataPublication-license-identifier',
                addSuffix: true
              }
            ]
        }
      ],
      update: [
        //CQU Figshare environment doesn't allow to update the item by impersonating the author
        //because the update is changing the item group therefore impersonate needs to be unset  
        {
          figName: 'impersonate', 
          rbName: '',
          unset: true
        },
        //Field to be set by - Step 3 - using the list generated in - Step 2 - that is passed in the context of the lodash template as
        //a runtime artifact (because is genarated at runtime)
        {
            figName: 'authors',
            rbName: '',
            template: `<% let authors = field.defaultValue;
                        if(!_.isUndefined(runtimeArtifacts) && !_.isEmpty(runtimeArtifacts)){
                          authors = runtimeArtifacts;
                        }
                        return authors;
                       %>`,
            runByNameOnly: true,
            defaultValue: []
        },
        {
            figName: 'title', 
            rbName: 'metadata.title', 
            defaultValue: ''
        },
        {
            figName: 'description', 
            rbName: 'metadata.description',
            defaultValue: ''
        },
        {
            figName: 'keywords',
            rbName: 'metadata.finalKeywords',
            defaultValue: ['']
        },
        //Field to be set by - FindCat_Step2 - using the list generated in - FindCat_Step1 - that is passed in the context of the lodash 
        //template as a runtime artifact (because is genarated at runtime)
        { 
            figName: 'categories',
            rbName: '',
            template: `<% let categories = field.defaultValue;
                        if(!_.isUndefined(runtimeArtifacts) && !_.isEmpty(runtimeArtifacts)){
                          categories = runtimeArtifacts;
                        }
                        return categories;
                       %>`,
            runByNameOnly: true, //Only the fields that are "run by name only" can use runtime artifacts 
            defaultValue: [] //29888
        },
        {
            figName: 'funding',
            rbName: 'metadata.project-funding',
            defaultValue: ''
        },
        {
          figName: 'resource_title',
          rbName: 'metadata.related_publications',
          template: `<% let relatedPublication = _.get(record,field.rbName);
                      if(!_.isEmpty(relatedPublication) && _.isArray(relatedPublication)) {
                        for(let relPub of relatedPublication) {
                          let path = 'related_title';
                          let doiUrl = _.get(relPub,path,field.defaultValue);
                          if(!_.isEmpty(doiUrl)) {
                            return doiUrl;
                          }
                        }
                        return field.defaultValue;
                      } else {
                        return field.defaultValue;
                      } %>`,
          defaultValue: ''
        },
        {
          figName: 'resource_doi',
          rbName: 'metadata.related_publications',
          template: `<% let relatedPublication = _.get(record,field.rbName);
                      if(!_.isEmpty(relatedPublication) && _.isArray(relatedPublication)) {
                        for(let relPub of relatedPublication) {
                          let path = 'related_url';
                          let doiUrl = _.get(relPub,path,field.defaultValue);
                          if(!_.isEmpty(doiUrl)) {
                            return doiUrl;
                          }
                        }
                        return field.defaultValue;
                      } else {
                        return field.defaultValue;
                      } %>`,
          defaultValue: '',
          validations: [
            // Figshare format requires to remove domain in example
            // https://dx.doi.org/10.25946/5f48373c5ac76
            // has to be stripped of domain to 
            // 10.25946/5f48373c5ac76
            // Regex to validate DOI taken from
            // https://www.crossref.org/blog/dois-and-matching-regular-expressions/
            {
              template: `<% let path = 'resource_title';
                          if(!_.isEmpty(_.get(request,field.figName)) && _.isEmpty(_.get(request,path))) {
                            return false;
                          } else {
                            return true;
                          }
                        %>`,
              message: '@dataPublication-relatedResources-title-empty'
            },
            {
              regexValidation: '^10.\\d{4,9}\/[-._;()\/:A-Z0-9]+$',
              caseSensitive: false,
              message: '@dataPublication-relatedResources-validationMessage',
              addPrefix: true
            }
          ]
        },
        { 
            figName: 'license', 
            rbName: 'metadata.license-identifier',
            template: `<% let licenseValue = field.defaultValue;
                          if(!_.isUndefined(runtimeArtifacts) && !_.isEmpty(runtimeArtifacts)) {
                            let figArtLicense = _.get(record,'metadata.license_identifier','');
                            let tmpLic = figArtLicense.replace('https://', '');
                            figArtLicense = tmpLic.replace('http://', '');
                            for (let license of runtimeArtifacts) {
                              if(!_.isUndefined(license.url) && !_.isEmpty(license.url) && license.url.includes(figArtLicense)) {
                                licenseValue = license.value;
                                return _.toNumber(licenseValue);
                              }
                            }
                          }
                          return licenseValue;
                        %>`,
            defaultValue: 0,
            runByNameOnly: true,
            validations: [
              {
                template: `<% let val = _.get(request,field.figName,undefined);
                            if(_.isUndefined(val)) {
                              return false;
                            } else {
                              return true;
                            }
                          %>`,
                message: '@dataPublication-license-identifier',
                addSuffix: true
              }
            ]
        }
      ],
      //Figshare documentation https://docs.figshare.com/#private_article_embargo_update
      //Validate that embargo date is in the future or otherwise it will fail with Invalid Embargo
      embargo: [
        {
            // Date Format in Figshare documentation is + '2022-02-27T00:00:00' but 'YYYY-MM-DD' works
            figName: 'is_embargoed',
            rbName: '',//the template will choose from either 'full-embargo-until' or 'file-embargo-until'
            template: `<% let dataPubAccessRights = record['metadata']['access-rights']; 
                        if(_.has(record,'metadata.full-embargo-until') && !_.isEmpty(record['metadata']['full-embargo-until'])) {
                          return true;
                        } else if (dataPubAccessRights == 'mediated' || 
                          (_.has(record,'metadata.file-embargo-until') && !_.isEmpty(record['metadata']['file-embargo-until']) && dataPubAccessRights != 'citation')) {
                            return true;
                        } else {
                          return field.defaultValue;
                        }
                      %>`,
            defaultValue: false
        },
        {
            figName: 'embargo_date', //set permanent embargo with '0' when 'mediated' option is selected
            rbName: '',
            template: `<% let dataPubAccessRights = record['metadata']['access-rights'];
                        if(_.has(record,'metadata.full-embargo-until') && !_.isEmpty(record['metadata']['full-embargo-until'])) {
                          let figArtFullEmbargoDate = record['metadata']['full-embargo-until'];
                          return figArtFullEmbargoDate;
                        } else if (dataPubAccessRights == 'mediated' || 
                          (_.has(record,'metadata.file-embargo-until') && !_.isEmpty(record['metadata']['file-embargo-until']) && dataPubAccessRights != 'citation')) {
                            if(dataPubAccessRights == 'mediated') {
                              return '0';
                            } else {
                              let figArtFileEmbargoDate = record['metadata']['file-embargo-until'];
                              return figArtFileEmbargoDate;
                            }
                        } else {
                          return field.defaultValue;
                        }
                      %>`,
            defaultValue: '',
            validations: [
              {
                template: `<% let dateFormat = 'YYYY-MM-DD';
                            let dataPubAccessRights = record['metadata']['access-rights'];
                            if(!_.isEmpty(request['embargo_date']) && dataPubAccessRights != 'mediated') {
                              let now = moment().utc().format(dateFormat);
                              let compareDate = moment(request['embargo_date'], dateFormat).utc().format(dateFormat);
                              let isAfter = moment(compareDate).isAfter(now);
                              if(!isAfter) {
                                return false;
                              }
                            }
                            return true;
                           %>`,
                message: '@dataPublication-embargoDate-validationMessage'
              }
            ]
        },
        {
            figName: 'embargo_type',
            rbName: '',
            template: `<% let dataPubAccessRights = record['metadata']['access-rights'];
                        if(_.has(record,'metadata.full-embargo-until') && !_.isEmpty(record['metadata']['full-embargo-until'])) {
                          return 'article';
                        } else if (dataPubAccessRights == 'mediated' || 
                          (_.has(record,'metadata.file-embargo-until') && !_.isEmpty(record['metadata']['file-embargo-until']) && dataPubAccessRights != 'citation')) {
                          return 'file';
                        } else {
                          return field.defaultValue;
                        }
                      %>`,
            defaultValue: 'article'
        },
        {
            figName: 'embargo_title',
            rbName: '',
            template: `<% let dataPubAccessRights = record['metadata']['access-rights'];
                        if(_.has(record,'metadata.full-embargo-until') && !_.isEmpty(record['metadata']['full-embargo-until'])) {
                          return 'full article embargo';
                        } else if (dataPubAccessRights == 'mediated' || 
                          (_.has(record,'metadata.file-embargo-until') && !_.isEmpty(record['metadata']['file-embargo-until']) && dataPubAccessRights != 'citation')) {
                          return 'files only embargo';
                        } else {
                          return field.defaultValue;
                        }
                      %>`,
            defaultValue: ''
        },
        {
            figName: 'embargo_reason',
            rbName: '',//the template will choose from either 'embargo-until-reason' or 'embargoNote'
            template: `<% let dataPubAccessRights = record['metadata']['access-rights'];
                        if(_.has(record,'metadata.full-embargo-until') && !_.isEmpty(record['metadata']['full-embargo-until'])) {
                          let figArtFullEmbargoReason = record['metadata']['embargo-until-reason'];
                          return figArtFullEmbargoReason;
                        } else if (dataPubAccessRights == 'mediated' || 
                          (_.has(record,'metadata.file-embargo-until') && !_.isEmpty(record['metadata']['file-embargo-until']) && dataPubAccessRights != 'citation')) {
                          let figArtFileEmbargoReason = record['metadata']['embargoNote'];
                          return figArtFileEmbargoReason;
                        } else {
                          return field.defaultValue;
                        }
                      %>`,
            defaultValue: ''
        },
        //[{id: 1780}], //adminstrator stage
        //[{id: 105}], //adminstrator prod
        {
          figName: 'embargo_options',
          rbName: '',
          template: `<% let embargoOptions = field.defaultValue;
                        return [embargoOptions]; 
                      %>`,
          defaultValue: {id: 1780}
        }
      ]
    }
  }
}