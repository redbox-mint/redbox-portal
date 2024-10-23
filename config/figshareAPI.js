module.exports.figshareAPI = {
  frontEndURL: 'https://cqu.figsh.com', //stage
  baseURL: 'https://api.figsh.com/v2', //stage
  APIToken: '', //Stage
  figArticleGroupId: 32014, //Dataset stage
  figArticleEmbargoOptions: [{id: 1780}], //adminstrator stage
  //frontEndURL: 'https://cqu.figshare.com', //prod
  //baseURL: 'https://api.figshare.com/v2', //prod
  //APIToken: '', //Prod
  //figArticleGroupId: 30527, //Dataset prod
  //figArticleEmbargoOptions: [{id: 105}], //adminstrator prod
  attachmentsTempDir: '/attachments',
  attachmentsFigshareTempDir: '/attachments/figshare',
  diskSpaceThreshold: 10737418240, //set diskSpaceThreshold to a reasonable amount of space on disk that will be left free as a safety buffer
  figArticleItemType: 'dataset',
  mapping: {
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
      ]
    },
    templates: {
      customFields: {
        createImpersonate: {
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
      }
    },
    customFields: {
      path: 'custom_fields',
      createImpersonate: [
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
                template: `<% let val = _.get(request,field.figName,undefined);
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
    standardFields: {
      createImpersonate: [
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
        { 
            figName: 'license', 
            rbName: 'metadata.license-identifier',
            defaultValue: '',
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
            {
              template: `<% let path = 'resource_title';
                          if(!_.isEmpty(_.get(request,field.figName)) && _.isEmpty(_.get(request,path))) {
                            return false;
                          } else {
                            return true;
                          }
                        %>`,
              message: '@dataPublication-relatedResources-title-empty'
            }
          ]
        },
        { 
            figName: 'license', 
            rbName: 'metadata.license-identifier',
            defaultValue: '',
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
      ]
    }
  }
}