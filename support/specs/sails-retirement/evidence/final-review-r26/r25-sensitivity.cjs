'use strict';
// Subprocess preload: substitute pinned Git text in memory, never replace worktree files.
const path=require('node:path');
const Module=require('node:module');
const child=require('node:child_process');
const root=path.resolve(__dirname,'../../../../..');
const wsu='/home/andrew/src/bitbucket/redbox-hook-wsu-v6';
const cases={
  s3:{repo:wsu,ref:'8dd61118eed9582be8d4d01359677b9be4dba631',source:'src/config/storage.ts',target:wsu+'/dist/config/storage.js'},
  exporter:{repo:wsu,ref:'63e85353024cf54ea0939f360e657f6fae70ddb6',source:'src/deployment.ts',target:wsu+'/dist/deployment.js'},
  pdf:{repo:root,ref:'a4089ad238f78ca0d0f5b9227a61f8fd5ecf8061',source:'packages/redbox-core/src/configuration/portal.ts',target:root+'/packages/redbox-core/src/configuration/portal.ts'},
  institution:{repo:root,ref:'6942eb1778e1e2ab920c4e64a9fb7951d7c9ca82',source:'packages/redbox-core/src/configuration/deployment.ts',target:root+'/packages/redbox-core/src/configuration/deployment.ts'},
};
const selected=cases[process.env.R26_SENSITIVITY];
if(!selected)throw Error('Select s3/exporter/pdf/institution');
const source=child.execFileSync('git',['show',selected.ref+':'+selected.source],{cwd:selected.repo,encoding:'utf8'});
const ts=require(root+'/node_modules/typescript');
const text=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true,resolveJsonModule:true}}).outputText;
const substitutions=new Map([[selected.target,text]]);
if(process.env.R26_SENSITIVITY==='institution') {
  const file=root+'/packages/redbox-core/src/configuration/portal-domains.schema.json';
  const schema=child.execFileSync('git',['show',selected.ref+':packages/redbox-core/src/configuration/portal-domains.schema.json'],{cwd:root,encoding:'utf8'});
  const cached=new Module(file);cached.filename=file;cached.loaded=true;cached.exports=JSON.parse(schema);require.cache[file]=cached;
}
if(process.env.R26_SENSITIVITY==='s3') {
  // R26 now accepts omitted credentials in core too. Preserve R25's original
  // schema for the historical hook regression's negative control.
  const before=child.execFileSync('git',['show','6942eb1778e1e2ab920c4e64a9fb7951d7c9ca82:packages/redbox-core/src/configuration/deployment.ts'],{cwd:root,encoding:'utf8'});
  substitutions.set(root+'/packages/redbox-core/dist/configuration/deployment.js',ts.transpileModule(before,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText);
}
const compile=Module.prototype._compile;
Module.prototype._compile=function(code,filename,...rest){return compile.call(this,substitutions.get(filename)||code,filename,...rest);};
const spawn=child.spawnSync;
child.spawnSync=function(command,args,options={}) {
  return spawn.call(this,command,args,{...options,env:{...(options.env||process.env),NODE_OPTIONS:'--require='+__filename,R26_SENSITIVITY:process.env.R26_SENSITIVITY}});
};
