export class SolrConfig {
    createOrUpdateJobName:string;
    deleteJobName:string;
    maxWaitTries: number;
    waitTime: number;
    cores:  {
        [key: string]: SolrCore;
      };
}

export class SolrCore {
    options:SolrOptions;
    schema: {
        'add-field': SolrField[];
        'add-dynamic-field': SolrField[];
        'add-copy-field': SolrCopyField[];
      };
     preIndex?: SolrPreIndex;
     initSchemaFlag: SolrInitSchemaFlag;
}


interface SolrInitSchemaFlag {
    name: string;
    type: string;
    stored: boolean;
    required: boolean;
}

interface SolrPreIndex {
    move?: Array<{ source: string; dest: string }>;
    copy?: Array<{ source: string; dest: string }>;
    flatten?: {
      options?: SolrFlattenOptions;
      special?: SolrSpecialFlatten[];
    };
}

interface SolrSpecialFlatten {
    source: string;
    dest?: string;
    options: SolrFlattenOptions; 
}

interface SolrFlattenOptions {
    safe?: boolean;
    delimiter?: string;
    object?: boolean;
    overwrite?: boolean;
    maxDepth?: number;
    transformKey: Function; 
  };

export class SolrField {
    name: string;
    type: string;
    indexed: boolean;
    stored: boolean;
    multiValued: boolean;
}

export class SolrCopyField {
    source: string;
    dest: string;
}

export class SolrOptions {
    host:string;
    port:string;
    core:string;
}