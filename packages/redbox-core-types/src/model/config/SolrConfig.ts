export class SolrConfig {
    createOrUpdateJobName: string = '';
    deleteJobName: string = '';
    maxWaitTries: number = 0;
    waitTime: number = 0;
    cores: {
        [key: string]: SolrCore;
      } = {};
}

export class SolrCore {
    options: SolrOptions = new SolrOptions();
    schema: {
        'add-field': SolrField[];
        'add-dynamic-field': SolrField[];
        'add-copy-field': SolrCopyField[];
      } = { 'add-field': [], 'add-dynamic-field': [], 'add-copy-field': [] };
     preIndex?: SolrPreIndex;
     initSchemaFlag: SolrInitSchemaFlag = { name: '', type: '', stored: false, required: false };
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
    transformKey?: Function; 
  };

export class SolrField {
    name: string = '';
    type: string = '';
    indexed: boolean = false;
    stored: boolean = false;
    multiValued?: boolean = false;
    required?: boolean = false;
}

export class SolrCopyField {
    source: string = '';
    dest: string = '';
}

export class SolrOptions {
    https?: boolean = false;
    host: string = '';
    port: string | number = '';
    core: string = '';
}