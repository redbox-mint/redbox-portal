import * as path from 'path';
import { Project, QuoteKind } from 'ts-morph';
import { Generator, GeneratorOptions } from '../utils/generator';
import { RedboxPaths } from '../utils/paths';
import { updateServiceIndex } from '../utils/config-helper';

export interface ServiceGeneratorOptions extends GeneratorOptions {
  name: string;
  methods?: string[];
  paths: RedboxPaths;
}

export class ServiceGenerator extends Generator {
  private name: string;
  private methods: string[];
  private paths: RedboxPaths;
  private project: Project;

  constructor(options: ServiceGeneratorOptions) {
    super(options);
    this.name = options.name;
    this.methods = options.methods || [];
    this.paths = options.paths;
    this.project = new Project({
      manipulationSettings: {
        quoteKind: QuoteKind.Single,
      },
    });
  }

  public async generate(): Promise<void> {
    const serviceName = this.name.endsWith('Service') ? this.name : `${this.name}Service`;
    const className = this.name.endsWith('Service')
      ? this.name.replace(/Service$/, '')
      : this.name;

    const serviceDir = path.join(this.paths.coreTypes, 'src', 'services');
    const servicePath = path.join(serviceDir, `${serviceName}.ts`);

    const content = this.generateServiceContent(className, serviceName);
    this.writeFile(servicePath, content);

    if (!this.dryRun) {
      await updateServiceIndex({
        project: this.project,
        paths: this.paths,
        root: this.root,
        serviceName: serviceName,
        className: className,
        dryRun: this.dryRun
      });
    }
  }

  private generateServiceContent(className: string, serviceName: string): string {
    const methodsCode = this.methods.map(method => `
    public async ${method}(..._args: unknown[]): Promise<Record<string, unknown>> {
      sails.log.verbose(\`\${this.logHeader} ${method} called\`);
      return { message: 'Method ${method} in ${serviceName}' };
    }`).join('\n');

    const exportedMethods = ['init', ...this.methods].map(m => `'${m}'`).join(',\n      ');

    return `import { Services as services } from '../CoreService';

export namespace Services {
  export class ${className}Service extends services.Core.Service {

    constructor() {
      super();
      this.logHeader = "${serviceName}::";
    }

    protected override _exportedMethods: string[] = [
      ${exportedMethods}
    ];

    public init(): void {
      // Initialize service here
    }
${methodsCode}
  }
}

declare global {
  let ${className}Service: Services.${className}Service;
}
`;
  }
}
