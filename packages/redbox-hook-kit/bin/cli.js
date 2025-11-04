#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const command = process.argv[2];

function init() {
  console.log('🚀 Initializing ReDBox Hook project...\n');

  const cwd = process.cwd();
  
  // Create typescript directory structure if it doesn't exist
  const typescriptDir = path.join(cwd, 'typescript');
  const apiDir = path.join(typescriptDir, 'api');
  const controllersDir = path.join(apiDir, 'controllers');
  
  if (!fs.existsSync(typescriptDir)) {
    fs.mkdirSync(typescriptDir, { recursive: true });
    fs.mkdirSync(controllersDir, { recursive: true });
    console.log('✅ Created typescript/api/controllers/ directory structure');
  } else {
    console.log('ℹ️  typescript/ directory already exists');
  }

  // Create or update tsconfig.json
  const tsconfigPath = path.join(cwd, 'tsconfig.json');
  const tsconfig = {
    "extends": "@researchdatabox/redbox-hook-kit/config/tsconfig.base.json",
    "compilerOptions": {
      "outDir": "./",
      "rootDir": "./typescript",
      "typeRoots": [
        "node_modules/@types",
        "node_modules/@researchdatabox/redbox-hook-kit/node_modules/@types"
      ]
    },
    "include": [
      "typescript/**/*.ts"
    ]
  };

  if (!fs.existsSync(tsconfigPath)) {
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n');
    console.log('✅ Created tsconfig.json extending redbox-hook-kit');
  } else {
    console.log('⚠️  tsconfig.json already exists - skipping');
    console.log('   You may want to manually extend: @researchdatabox/redbox-hook-kit/config/tsconfig.base.json');
  }

  // Create a sample controller if none exists
  const sampleController = path.join(controllersDir, 'ExampleController.ts');
  if (!fs.existsSync(sampleController) && fs.readdirSync(controllersDir).length === 0) {
    const sampleCode = `// Example ReDBox Hook Controller

import { Controllers as controllers } from '@researchdatabox/redbox-core-types';

declare var sails;
declare var _;

export module Controllers {
  export class ExampleController extends controllers.Core.Controller {
    protected _exportedMethods: any = [
      'example'
    ];

    public example(req: any, res: any) {
      return res.json({ message: 'Hello from ExampleController!' });
    }
  }
}

module.exports = new Controllers.ExampleController().exports();
`;
    fs.writeFileSync(sampleController, sampleCode);
    console.log('✅ Created example controller: typescript/api/controllers/ExampleController.ts');
  }

  console.log('\n✨ Setup complete!\n');
  console.log('Next steps:');
  console.log('  1. Install dependencies: npm install');
  console.log('  2. Compile TypeScript: npx tsc');
  console.log('  3. Start developing your hook controllers in typescript/api/controllers/\n');
}

function showHelp() {
  console.log(`
ReDBox Hook Kit CLI

Usage:
  npx redbox-hook-kit <command>

Commands:
  init      Initialize a new ReDBox hook project with TypeScript setup
  help      Show this help message

Examples:
  npx @researchdatabox/redbox-hook-kit init
`);
}

switch (command) {
  case 'init':
    init();
    break;
  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;
  default:
    if (!command) {
      showHelp();
    } else {
      console.error(`Unknown command: ${command}\n`);
      showHelp();
      process.exit(1);
    }
}
