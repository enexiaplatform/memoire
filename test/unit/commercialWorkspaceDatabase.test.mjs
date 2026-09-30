import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {createSupabaseCompatibleDatabase,applyMigrations,productionMigrations,seedAuthUsers,setAuthenticatedOwner,OWNER_A,OWNER_B} from '../../scripts/release-database-harness.mjs';
import {historicalSources} from '../../src/services/historicalIntegrity.ts';
const REVIEWER='33333333-3333-4333-8333-333333333333',migration='20260930060000_commercial_workspaces.sql';let db,epoch,priorHistory;
const read=(database=db)=>database.query("SELECT read_commercial_workspace($1,'team') value",[OWNER_A]);
const respond=(database,actor,accessEpoch,response,request=randomUUID(),review=null)=>database.query("SELECT respond_commercial_workspace($1,'team',$2,$3,$4,$5,$6) value",[OWNER_A,accessEpoch,request,response,review?'shared':null,review]);
before(async()=>{db=await createSupabaseCompatibleDatabase();const files=productionMigrations();await applyMigrations(db,files.slice(0,files.indexOf(migration)));await seedAuthUsers(db);await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[REVIEWER,'reviewer@example.test']);await setAuthenticatedOwner(db,OWNER_A);
 for(const id of ['shared','private'])await db.query("INSERT INTO commercial_commitments(id,user_id,commitment_text,completion_evidence,source_type) VALUES($1,$2,$3,'Private supporting details','manual')",[id,OWNER_A,id+' promise']);priorHistory=(await db.query('SELECT * FROM commercial_state_revisions ORDER BY id')).rows;
 await db.exec('RESET ROLE');await applyMigrations(db,[migration]);await setAuthenticatedOwner(db,OWNER_A);});
after(async()=>db?.close());
test('populated upgrade preserves exact prior history and workspace sharing adds required revisions',async()=>{
 assert.deepEqual((await db.query('SELECT * FROM commercial_state_revisions ORDER BY id')).rows,priorHistory);
 await db.query("INSERT INTO commercial_workspaces(id,user_id,version,name,members,commitment_ids,lifecycle,revision_reason,source_type,created_at,updated_at) VALUES('team',$1,1,'Team review',$2,'[\"shared\"]','active','Explicit sharing','manual',now(),now())",[OWNER_A,[{actorId:OWNER_B,role:'reader'},{actorId:REVIEWER,role:'reviewer'}]]);
 epoch=(await db.query("SELECT access_epoch FROM commercial_workspaces WHERE id='team'")).rows[0].access_epoch;const revision=(await db.query("SELECT state FROM commercial_state_revisions WHERE entity_type='commercial_workspaces'")).rows[0].state;assert.equal(revision.version,1);assert.equal('access_epoch' in revision,false);assert.ok(revision.updated_at);
 await assert.rejects(db.exec("UPDATE commercial_workspaces SET name='Silent change' WHERE id='team'"),/version/);
});
test('invitation is not access; accepted reader sees only selected public promise fields and cannot write',async()=>{
 await setAuthenticatedOwner(db,OWNER_B);assert.equal((await db.query('SELECT * FROM commercial_workspaces')).rows.length,0);assert.equal((await db.query('SELECT * FROM commercial_commitments')).rows.length,0);await assert.rejects(read(),/access unavailable/);
 const invitations=(await db.query('SELECT list_commercial_workspace_invitations() value')).rows[0].value;assert.equal(invitations[0].accepted,false);assert.equal(invitations[0].role,'reader');assert.equal('commitments' in invitations[0],false);
 const request=randomUUID();await respond(db,OWNER_B,epoch,'accepted',request);await respond(db,OWNER_B,epoch,'accepted',request);assert.equal((await db.query('SELECT * FROM commercial_events')).rows.length,1);
 const view=(await read()).rows[0].value;assert.equal(view.commitments.length,1);assert.equal(view.commitments[0].id,'shared');assert.equal(JSON.stringify(view).includes('Private supporting'),false);assert.equal(view.role,'reader');
 await assert.rejects(respond(db,OWNER_B,epoch,'review',randomUUID(),'Unpermitted review'),/authority/);
 await assert.rejects(db.query("INSERT INTO commercial_workspaces(id,user_id,version,name,lifecycle,revision_reason,source_type,created_at,updated_at) VALUES('forged',$1,1,'Forged','active','Forged','manual',now(),now())",[OWNER_A]),/owner mismatch|row-level/);
});
test('reviewer records only a review event; accepted business records and State Revisions stay unchanged',async()=>{
 await setAuthenticatedOwner(db,REVIEWER);await respond(db,REVIEWER,epoch,'accepted');await respond(db,REVIEWER,epoch,'review',randomUUID(),'Please check the date with the customer.');const view=(await read()).rows[0].value;assert.equal(view.reviews.length,1);assert.equal(view.reviews[0].actorId,REVIEWER);assert.equal((await db.query('SELECT * FROM commercial_state_revisions')).rows.length,0);
 await assert.rejects(db.exec("UPDATE commercial_events SET structured_payload='{}' WHERE event_type='workspace_review_recorded'"),/immutable/);
 await setAuthenticatedOwner(db,OWNER_A);assert.equal((await db.query('SELECT * FROM commercial_commitments')).rows.length,2);assert.equal((await db.query("SELECT * FROM commercial_state_revisions WHERE entity_type='commercial_workspaces'")).rows.length,1);
});
test('membership revisions invalidate old acceptance; reviewers cannot silently promote themselves',async()=>{
 await setAuthenticatedOwner(db,OWNER_A);await db.query("UPDATE commercial_workspaces SET members=$1,version=2,revision_reason='Change roles',updated_at=clock_timestamp() WHERE id='team'",[[{actorId:OWNER_B,role:'reviewer'}]]);const next=(await db.query('SELECT access_epoch FROM commercial_workspaces')).rows[0].access_epoch;assert.notEqual(next,epoch);
 await setAuthenticatedOwner(db,OWNER_B);await assert.rejects(read(),/access unavailable/);await assert.rejects(respond(db,OWNER_B,epoch,'accepted'),/changed/);await respond(db,OWNER_B,next,'accepted');assert.equal((await read()).rows[0].value.role,'reviewer');epoch=next;
 await setAuthenticatedOwner(db,REVIEWER);assert.equal((await db.query('SELECT list_commercial_workspace_invitations() value')).rows[0].value.length,0);await assert.rejects(read(),/access unavailable/);
});
test('restoring canonical workspace history rotates access epoch and old acceptance cannot reactivate access',async()=>{
 await setAuthenticatedOwner(db,OWNER_B);const responses=(await db.query('SELECT * FROM commercial_events')).rows;await setAuthenticatedOwner(db,OWNER_A);const sources={};for(const table of Object.keys(historicalSources))sources[table]=(await db.query(`SELECT * FROM ${table}`)).rows;
 const payload={user_id:OWNER_A,format_version:15,exported_at:new Date().toISOString(),sources,parents:[],coverage:(await db.query('SELECT * FROM commercial_history_coverage')).rows[0],revisions:(await db.query('SELECT * FROM commercial_state_revisions')).rows};
 const target=await createSupabaseCompatibleDatabase();try{await applyMigrations(target);await seedAuthUsers(target);await setAuthenticatedOwner(target,OWNER_A);const restore=()=>target.query('SELECT restore_commercial_history($1) value',[JSON.stringify(payload)]);assert.equal((await restore()).rows[0].value.status,'restored');assert.equal((await restore()).rows[0].value.status,'no_op');const restored=(await target.query('SELECT * FROM commercial_workspaces')).rows[0];assert.notEqual(restored.access_epoch,epoch);assert.equal(restored.version,2);assert.deepEqual((await target.query("SELECT state FROM commercial_state_revisions WHERE entity_type='commercial_workspaces' ORDER BY revision_no")).rows,(await db.query("SELECT state FROM commercial_state_revisions WHERE entity_type='commercial_workspaces' ORDER BY revision_no")).rows);
  await setAuthenticatedOwner(target,OWNER_B);for(const response of responses){const keys=Object.keys(response);await target.query(`INSERT INTO commercial_events(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(response));}await assert.rejects(read(target),/access unavailable/);await respond(target,OWNER_B,restored.access_epoch,'accepted');assert.equal((await read(target)).rows[0].value.commitments.length,1);
 }finally{await target.close();}
});
test('revocation and retirement deny access without weakening existing personal ownership or anonymous boundaries',async()=>{
 await setAuthenticatedOwner(db,OWNER_A);await db.exec("UPDATE commercial_workspaces SET lifecycle='retired',version=3,revision_reason='Close workspace',updated_at=clock_timestamp() WHERE id='team'");await setAuthenticatedOwner(db,OWNER_B);await assert.rejects(read(),/access unavailable/);assert.equal((await db.query('SELECT * FROM commercial_commitments')).rows.length,0);
 await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT list_commercial_workspace_invitations()'),/permission denied/);await assert.rejects(db.query('SELECT * FROM commercial_workspaces'),/permission denied/);
});
