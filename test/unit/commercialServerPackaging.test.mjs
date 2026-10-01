import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,rm,readFile} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {callHandler} from '../support/commercialApiDatabase.mjs';

test('deployed Commercial API loads without any application TypeScript source and denies unauthenticated calls',async()=>{
 const root=resolve('.memoire-server'),directory=await mkdtemp(join(root,'isolated-'));
 try{
  const target=join(directory,'function','runtime','commercial.mjs');await mkdir(join(directory,'function','runtime'),{recursive:true});await copyFile(join(root,'commercial.mjs'),target);
  const code=await readFile(target,'utf8');assert.doesNotMatch(code,/(?:from\s*|import\s*\()['"][^'"]*\.tsx?['"]/);assert.doesNotMatch(code,/from\s*['"][^'"]*\/src\//);
  const {createCommercialHandler}=await import(pathToFileURL(target).href),result=await callHandler(createCommercialHandler(),{headers:{}});
  assert.equal(result.code,401);assert.deepEqual(result.body,{version:1,error:'unauthorized'});assert.equal(result.headers['Cache-Control'],'no-store');
 }finally{assert.equal(resolve(directory).startsWith(root+sep),true);await rm(directory,{recursive:true,force:true});}
});
