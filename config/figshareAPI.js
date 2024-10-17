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
    culturalWarning: 'This research output may contain the names and images of Aboriginal and Torres Strait Islander people now deceased. We apologize for any distress that may occur.',
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
    customFieldsTemplate: {
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
      },
      customFieldMappings: [
        { 
            figName: 'Number and size of Dataset', 
            rbName: 'metadata.dataset-size', 
            defaultValue: '' 
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
            defaultValue: '' 
        }
      ]
}
