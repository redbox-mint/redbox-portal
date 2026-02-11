import * as fs from 'fs';
import * as path from 'path';

export interface GeneratorOptions {
  dryRun?: boolean;
  root: string;
}

export abstract class Generator {
  protected dryRun: boolean;
  protected root: string;

  constructor(options: GeneratorOptions) {
    this.dryRun = !!options.dryRun;
    this.root = options.root;
  }

  protected writeFile(filePath: string, content: string): void {
    const relativePath = path.relative(this.root, filePath);
    
    if (fs.existsSync(filePath)) {
      const existingContent = fs.readFileSync(filePath, 'utf-8');
      if (existingContent === content) {
        console.log(`  [SKIP] ${relativePath} (no changes)`);
        return;
      }
      console.log(`  [UPDATE] ${relativePath}${this.dryRun ? ' (dry run)' : ''}`);
    } else {
      console.log(`  [CREATE] ${relativePath}${this.dryRun ? ' (dry run)' : ''}`);
    }

    if (!this.dryRun) {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, content, 'utf-8');
    }
  }
}
