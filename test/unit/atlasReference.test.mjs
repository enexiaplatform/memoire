import test from 'node:test';import assert from 'node:assert/strict';import {atlasReceiver} from '../../api/_atlasReference.js';
test('unconfigured or incomplete mapping fails closed before any external read',async()=>{
 const handler=atlasReceiver({mapping:{},credential:'fixture',fetchImpl:()=>assert.fail('unexpected fetch')});let status;
 await handler({method:'GET',headers:{}},{setHeader(){},status(code){status=code;return this},json(){}});
 assert.equal(status,503);
});
