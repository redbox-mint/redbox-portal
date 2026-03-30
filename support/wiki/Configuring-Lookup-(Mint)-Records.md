<p>This guide outlines how to configure your ReDBox deployment to ingest, index, search, and display lookup records (formerly held in Mint) using the new internal lookup functionality. It is intended for technical administrators or developers maintaining ReDBox configuration.</p>
<hr>
<h2>1. Configure the Record Type</h2>
<p>Update <code inline="">config/recordtype.js</code> to define the record type(s) for your lookup records. These records are able to utilise all the features existing record types are able to, including onCreate and onUpdate triggers.</p>
<h3>Example:</h3>
<pre><code class="language-js">module.exports.recordtype = {
  party: {
    packageType: "party",
    searchCore: "parties", // optional if you're querying Solr and want the ability to tune a custom Solr core
    hooks: {
      onCreate: {},
      onUpdate: {}
    },
    relatedTo: [],
    searchFilters: []
  }
};
</code></pre>
<ul>
<li>
<p><code inline="">searchCore</code> is optional. If omitted, the default Solr core will be used.</p>
</li>
</ul>
<hr>
<h2>2. Define the Workflow for the Record Type</h2>
<p>Update <code inline="">config/workflow.js</code> to configure how records behave in the system. A custom form can be configured for a record if desired (see [Configuring Record Forms](https://github.com/redbox-mint/redbox-portal/wiki/Configuring-Record-Forms)), however a default view only form that will display all the fields based on the record's schema has been provided. To use the generated form, set form to the value "generated-view-only"</p>
<h3>Minimal View-Only Example:</h3>
<pre><code class="language-js">"party": {
  "draft": {
    config: {
      workflow: {
        stage: "draft",
        stageLabel: "Draft"
      },
      authorization: {
        viewRoles: ["Admin", "Librarians"],
        editRoles: ["Admin", "Librarians"]
      },
      form: "generated-view-only"
    },
    starting: true
  }
}
</code></pre>
<hr>
<h2>3. Configure Solr for the Record Type</h2>
<p>Update <code inline="">config/solr.js</code> to define a separate Solr core if needed.</p>
<h3>Example:</h3>
<pre><code class="language-js">module.exports.solr = {
  cores: {
    default: {
      options: {
        host: "solr",
        port: "8983",
        core: "redbox"
      },
      schema: {
        // fields and dynamic fields
      },
      preIndex: {
        // flattening and transformations
      }
    },
    parties: {
      options: {
        host: "solr",
        port: "8983",
        core: "parties"
      }
      // optionally define custom schema or preIndex here
    }
  }
};
</code></pre>
<p>Make sure the <code inline="">searchCore</code> value defined in <code inline="">recordtype.js</code> matches one of the keys under <code inline="">cores</code>.</p>
<hr>
<h2>4. Configure Vocab Queries for Lookups</h2>
<p>ReDBox supports dynamically populated vocab fields in forms using <strong>query-based lookups</strong>. These can be backed by:</p>
<ul>
<li>
<p>A <strong>Solr search query</strong>, for records indexed in Solr.</p>
</li>
<li>
<p>A <strong>named database query</strong>, for data that resides in the database.</p>
</li>
</ul>
<p>You define these in <code inline="">config/vocab.js</code> under the <code inline="">queries</code> section.</p>
<hr>
<h3>4.1 Solr-Based Query Example</h3>
<pre><code class="language-js">module.exports.vocab = {
  queries: {
    parties: {
      searchQuery: {
        searchCore: "parties",
        baseQuery: "metaMetadata_type:party"
      },
      queryField: {
        property: "full_name",
        type: "text"
      },
      resultObjectMapping: {
        fullname: "&lt;%= record.full_name %&gt;",
        email: "&lt;%= record.email %&gt;",
        orcid: "&lt;%= record.orcid %&gt;"
      }
    }
  }
};
</code></pre>
<ul>
<li>
<p><code inline="">searchQuery.searchCore</code>: Which Solr core to query</p>
</li>
<li>
<p><code inline="">baseQuery</code>: Base query string to filter records</p>
</li>
<li>
<p><code inline="">queryField</code>: Defines what field user input will match</p>
</li>
<li>
<p><code inline="">resultObjectMapping</code>: How the result appears in the dropdown</p>
</li>
</ul>
<hr>
<h3>4.2 Database-Based Query Example</h3>
<pre><code class="language-js">module.exports.vocab = {
  queries: {
    rdmps: {
      databaseQuery: {
        queryName: "listRDMPRecords"
      },
      queryField: {
        property: "title",
        type: "text"
      },
      resultObjectMapping: {
        title: "&lt;%= record.metadata.title %&gt;",
        oid: "&lt;%= record.oid %&gt;"
      }
    }
  }
};
</code></pre>
<ul>
<li>
<p><code inline="">databaseQuery.queryName</code>: Named query defined in your <code inline="">namedquery.js/code>. See [Configuring Named Queries](https://github.com/redbox-mint/redbox-portal/wiki/Configuring-Named-Queries) for more information</p>
</li>
<li>
<p><code inline="">queryField.property</code>: The field that will be matched</p>
</li>
<li>
<p><code inline="">resultObjectMapping</code>: Defines keys rendered in the form</p>
</li>
</ul>
<hr>
<h3>4.3 Using Query Vocab in a Form Field</h3>
<p>The existing Vocab Components in the forms have been updated to support the new vocab lookup type.
<pre><code class="language-json">{
   class: 'VocabField',
   definition: {
   vocabQueryId: "activity",
   sourceType: "query",
   titleFieldName: "title",
   titleFieldArr: ["title"],
   fieldNames: ["title", "ID"],
   stringLabelToField: "ID",
   }
}
</code></pre>
<p>The vocabQueryId (<code inline="">activity</code>) must match the key in your <code inline="">vocab.js</code> config.</p>
<hr>
<h2>5. Enable Dashboard Table View (Optional)</h2>
<p>To allow administrators to browse Mint records in a table view:</p>
<h3>a. Add link to dashboard for the record type</h3>
<p>Example URL to link from the admin homepage:</p>
<pre><code>#/dashboard/party
</code></pre>
<h3>b. Configure filters in <code inline="">config/dashboardtype.js</code></h3>
<pre><code class="language-js">module.exports.dashboardtype = {
  standard: {
    formatRules: {
      sortBy: "metaMetadata.lastSaveDate:-1",
      queryFilters: {
        party: [
          {
            filterType: "text",
            filterFields: [
              { name: "Full Name", path: "metadata.full_name" },
              { name: "Email", path: "metadata.email" }
            ]
          }
        ]
      }
    }
  }
};
</code></pre>
<p>This will render a sortable, filterable table view of <code inline="">party</code> records.</p>
<hr>
<h2>6. (Optional) Legacy Mint API Harvest Compatibility</h2>
<p>For institutions still using the legacy Mint harvester, ReDBox provides a compatible endpoint:</p>
<h3>Endpoint:</h3>
<pre><code>POST /:branding/:portal/api/mint/harvest/:recordType
</code></pre>
<h3>Legacy-Compatible Payload Format:</h3>
<pre><code class="language-json">{
  "records": [
    {
      "harvest_id": "s123456",
      "metadata": {
        "data": {
          "ID": "s123456",
          "GIVEN_NAME": "Andrew",
          "EMAIL": "notAReal@email.edu.au",
          "ORCID": "0000-0001-7269-2286"
        }
      }
    }
  ]
}
</code></pre>
<p>This endpoint transforms the payload internally and creates records using standard ReDBox logic.</p>
