import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeHistoricalStorage,encodeHistoricalStorage,isCompressedHistoricalStorage}
  from '../../src/services/historicalStorageCodec.ts';
import {applyLocalRestore,RESTORE_JOURNAL_KEY} from '../../src/services/restoreJournal.ts';

test('small and legacy historical JSON stays directly readable',()=>{
  const raw=JSON.stringify([{id:'revision-1',state:{statement:'Recorded truth'}}]);
  assert.equal(encodeHistoricalStorage(raw),raw);
  assert.equal(decodeHistoricalStorage(raw),raw);
});

test('mature Revision history is compressed losslessly below a safe browser envelope',()=>{
  const rows=Array.from({length:11_400},(_,index)=>({id:`revision-${index}`,scope:'owner',entityType:'commercial_conditions',
    entityId:`condition-${index%300}`,revisionNo:Math.floor(index/300)+1,mutationId:`mutation-${index}`,
    operation:index<300?'baseline':'update',recordedAt:'2026-09-22T00:00:00.000Z',schemaVersion:1,
    state:{id:`condition-${index%300}`,statement:`Condition ${index%300}`,opportunityId:`opportunity-${index%300}`}}));
  const raw=JSON.stringify(rows),stored=encodeHistoricalStorage(raw);
  assert.equal(isCompressedHistoricalStorage(stored),true);
  assert.ok(stored.length<raw.length/3,`compressed history remained ${stored.length} characters`);
  assert.equal(decodeHistoricalStorage(stored),raw);
});

test('corrupt compressed history fails explicitly',()=>{
  assert.throws(()=>decodeHistoricalStorage('memoire-zlib-v1:not-a-zlib-stream'),/unreadable/);
});

test('a large compressed rollback journal still restores the previous workspace',()=>{
  class Storage{
    data=new Map();failKey='';journalMaxLength=0;
    getItem(key){return this.data.get(key)??null;}
    setItem(key,value){if(key===this.failKey)throw new Error('quota');this.data.set(key,String(value));
      if(key===RESTORE_JOURNAL_KEY)this.journalMaxLength=Math.max(this.journalMaxLength,String(value).length);}
    removeItem(key){this.data.delete(key);}
  }
  let seed=7;const noise=Array.from({length:220_000},()=>{seed=(seed*48271)%2147483647;return String.fromCharCode(33+(seed%90));}).join('');
  const storage=new Storage(),before=JSON.stringify([{id:'old',text:noise}]);
  storage.setItem('memoire.stateRevisions.v1',encodeHistoricalStorage(before));
  storage.failKey='memoire.historyCoverage.v1';
  assert.throws(()=>applyLocalRestore(storage,{
    'memoire.stateRevisions.v1':encodeHistoricalStorage(JSON.stringify([{id:'new',text:noise.split('').reverse().join('')}])),
    'memoire.historyCoverage.v1':'[]',
  }),/previous workspace was restored/);
  assert.ok(storage.journalMaxLength<before.length*1.25,
    `rollback journal expanded unexpectedly to ${storage.journalMaxLength} characters`);
  assert.equal(decodeHistoricalStorage(storage.getItem('memoire.stateRevisions.v1')),before);
  assert.equal(storage.getItem(RESTORE_JOURNAL_KEY),null);
});
