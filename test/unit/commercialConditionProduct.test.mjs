import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { rowToOpportunity, opportunityToFormInput, opportunityToRow } from '../../src/services/opportunityStore.ts';
import { isLeadStage } from '../../src/utils/leadIdentity.ts';
let server, Panel, Row, RequirementRow;
const timestamp='2026-09-01T00:00:00.000Z';
const condition={id:'c',userId:null,accountId:'a',opportunityId:'o',statement:'QA accepts six months shelf life.',conditionCategory:'technical',intent:'assumed',lifecycle:'active',sourceType:'manual',createdAt:timestamp,updatedAt:timestamp,evidenceLinks:[]};
const evidence={id:'e',accountId:'a',opportunityId:'o',evidenceText:'QA confirmed acceptance in the trial.',observedAt:'2026-08-31',recordedAt:timestamp,sourceType:'email',sourceId:'mail-73'};
const view = (state,other={}) => renderToStaticMarkup(React.createElement(Row,{reading:{condition,state,supporting:[],conflicting:[],historical:[],unresolvedEvidenceIds:[],...other},evidence:[]}));
before(async()=>{server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'silent'});({CommercialStatePanel:Panel,ConditionRow:Row,RequirementRow}=await server.ssrLoadModule('/src/features/opportunities/CommercialStatePanel.tsx'));});
after(async()=>{await server?.close();});
test('empty Opportunity state explains what to record and offers a contextual action',()=>{
  const html=renderToStaticMarkup(React.createElement(Panel,{opportunity:{id:'o'},accounts:[],sampleDataActive:false}));
  assert.match(html,/No active commercial conditions recorded yet/); assert.match(html,/Add condition/);
  assert.match(html,/No outcome requirements recorded/); assert.match(html,/Add requirement/);
});
test('requirement row exposes the unresolved question, role, answer flow and true Condition state',()=>{
  const requirement={id:'r',userId:null,accountId:'a',opportunityId:'o',expectedOutcome:'Know final approver',question:'Who approves?',conditionId:null,role:'required_now',lifecycle:'active',sourceType:'manual',createdAt:timestamp,updatedAt:timestamp};
  const reading={requirement,condition:null,conditionState:'unknown',resolution:'unresolved',sourceEvidenceIds:[],reasonCode:'REQUIREMENT_UNKNOWN'};
  const html=renderToStaticMarkup(React.createElement(RequirementRow,{reading,conditions:[],evidence:[],onChange:()=>true,onAnswer:()=>true}));
  for(const phrase of ['Required now','unresolved','Who approves?','None','unknown','Record answer as a condition','Retire requirement']) assert.match(html,new RegExp(phrase));
});
test('supported, assumption, hypothesis and conflict render distinct words and resolvable source details',()=>{
  for(const [state,label] of [['supported','Supported'],['assumed','Assumption'],['hypothesis','Being tested'],['contradicted','Conflicting evidence']]) assert.match(view(state,{supporting:state==='supported'?[evidence]:[],conflicting:state==='contradicted'?[evidence]:[]}),new RegExp(label));
  const html=view('contradicted',{supporting:[evidence],conflicting:[{...evidence,id:'f',evidenceText:'Finance disputed approval.'}]});
  assert.match(html,/QA confirmed acceptance in the trial/); assert.match(html,/Finance disputed approval/);
  assert.match(html,/2026-08-31/); assert.match(html,/mail-73/);
});
test('qualified Opportunity drawer is the product entry point; Lead stays outside its default path',()=>{
  assert.equal(isLeadStage('Lead'),true); assert.equal(isLeadStage('Qualification'),false);
  const source=readFileSync(new URL('../../src/features/opportunities/OpportunitiesPage.tsx',import.meta.url),'utf8');
  assert.match(source,/mode === 'edit' && editingOpportunity && !isLeadStage\(editingOpportunity\.stage\) && \(\s*<CommercialStatePanel/);
});

test('Opportunity cloud and edit codecs retain a canonical Account ID across name edits',()=>{
  const row={id:'o',user_id:'u',account_id:'a',account_name:'Acme',opportunity_name:'Renewal',stage:'Qualification',created_at:timestamp,updated_at:timestamp};
  const deal=rowToOpportunity(row);
  assert.equal(deal.accountId,'a');
  const edited={...opportunityToFormInput(deal),accountName:'Acme International'};
  assert.equal(opportunityToRow(edited).account_id,'a');
});
