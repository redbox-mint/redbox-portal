module.exports.datapubs = {
  "rootCollection": {
    targetRepoNamespace: "uts_public_data_repo",
    rootCollectionId: "arcp://name,data_repo/root_collection",
    targetRepoColId: "root_collection",
    targetRepoColName: "",
    targetRepoColDescription: "This is a sample data portal. For any questions, please get in touch with us at info@redboxresearchdata.com.au",
    dsType: ["Dataset", "RepositoryCollection"],
    enableDatasetToUseDefaultLicense: true,
    defaultLicense: {
      "@id": "http://creativecommons.org/licenses/by/4.0",
      "@type": "OrganizationReuseLicense",
      "name": "Attribution 4.0 International (CC BY 4.0)",
      "description": "You are free to share (copy and redistribute the material in any medium or format) and adapt (remix, transform and build upon the material for any purpose, even commercially)."
    },
  },
  "sites": {
  	"staging": {
      "dir": "/opt/oni/staged/ocfl",
      "tempDir": "/opt/oni/staged/temp",
      "url": "http://localhost:11000"
    },
  	"public": {
      "dir": "/opt/oni/public/ocfl",
      "url": "http://localhost:11000/publication"
    }
  },
  "metadata": {
  	"html_filename": "ro-crate-preview.html",
    "jsonld_filename": "ro-crate-metadata.jsonld",
    "datapub_json": "datapub.json",
    "identifier_namespace": "public_ocfl",
    "render_script": "",
    "organization": {
      "@id": "https://www.redboxresearchdata.com.au",
      "@type": "Organization",
      "identifier": "https://www.redboxresearchdata.com.au",
      "name": "ReDBox Research Data"
    },
    related_works: [ 
      {
        field: 'publications',
        type: 'ScholarlyArticle'
      },
      {
        field: 'websites',
        type: 'WebSite'
      },
      { 
        field: 'metadata',
        type:  'CreativeWork'
      }, 
      { 
        field: 'data',
        type: 'Dataset'
      },
      {
        field: 'services',
        type: 'CreativeWork'
      }
    ],
    funders: [ 
      'foaf:fundedBy_foaf:Agent', 
      'foaf:fundedBy_vivo:Grant'
    ],
    subjects: [ 
      'dc:subject_anzsrc:for', 
      'dc:subject_anzsrc:seo' 
    ],
    DEFAULT_IRI_PREFS: {
      'about': {
	      'dc:subject_anzsrc:for': '_:FOR/',
    	  'dc:subject_anzsrc:seo': '_:SEO/'
      },
      'spatialCoverage': '_:spatial/',
      'funder': '_:funder/',
      'license': '_:license/',
      'citation': '_:citation/',
      'contact': '_:contact/',
      'location': '_:location/'
    }
  }
};
