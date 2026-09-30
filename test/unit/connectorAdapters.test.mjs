import {test} from 'node:test';
import assert from 'node:assert/strict';
import {previewConnectorExport,connectorKinds} from '../../src/services/commercialKernel/connectorAdapters.ts';
const record={id:'source-42',version:'3',reportedAt:'2026-09-01T10:00:00Z',title:'Source claim',text:'The source reports a payment.'};
const document={format:'memoire.connector-export',version:1,kind:'finance',namespace:'books-1',records:[record]};
test('all five connector profiles preserve source identity and text without interpreting business claims',()=>{
 for(const kind of connectorKinds){const result=previewConnectorExport(JSON.stringify({...document,kind}));assert.equal(result.observations.length,1);const observation=result.observations[0];assert.equal(observation.sourceNamespace,kind+':books-1');assert.equal(observation.sourceEventId,record.id);assert.equal(observation.sourceVersion,'3');assert.equal(observation.rawText,record.text);assert.equal(observation.sourceKind,kind==='finance'?'erp':kind);assert.equal(observation.observedAt,record.reportedAt);assert.equal('paymentStatus' in observation,false);}
});
test('adapter rejects credentials, owner overrides and commercial command fields rather than forwarding them',()=>{
 for(const extra of [{accessToken:'secret'},{userId:'other'},{accepted:true}])assert.throws(()=>previewConnectorExport(JSON.stringify({...document,...extra})));
 assert.throws(()=>previewConnectorExport(JSON.stringify({...document,records:[{...record,opportunityId:'private'}]})));
});
test('adapter validates the entire bounded batch before returning any preview',()=>{
 for(const patch of [{version:2},{kind:'arbitrary-plugin'},{records:[]},{records:Array(51).fill(record)},{records:[record,{...record,id:'bad',reportedAt:'not-a-date'}]},{records:[record,record]}])assert.throws(()=>previewConnectorExport(JSON.stringify({...document,...patch})));
 assert.throws(()=>previewConnectorExport(' '.repeat(128001)));assert.throws(()=>previewConnectorExport('{bad'));
});
test('namespaces distinguish finance from ERP and identity versions remain source controlled',()=>{
 const finance=previewConnectorExport(JSON.stringify(document)),erp=previewConnectorExport(JSON.stringify({...document,kind:'erp'}));assert.notEqual(finance.observations[0].sourceNamespace,erp.observations[0].sourceNamespace);
 assert.equal(previewConnectorExport(JSON.stringify({...document,records:[record,{...record,version:'4',text:'Corrected report'}]})).observations.length,2);
 assert.deepEqual(document.records,[record]);
});
