import { applyActionBatch } from '../../../src/features/aiChat/actionBatch.ts';
import { fixtureWorkspace } from './workspace.mjs';
import { loadPlanItems,savePlanItem } from '../../../src/services/planItemStore.ts';
export async function executeChatActions(batch,owns) {
  return applyActionBatch(batch,{
    load:async()=>({opportunities:fixtureWorkspace.opportunities,plans:loadPlanItems(),accounts:fixtureWorkspace.accounts}),
    addPlan:async(record)=>{savePlanItem(record,{syncCloud:false});return{mode:'cloud',warning:'Đã lưu fixture cục bộ; xác nhận cloud được mô phỏng, không ghi cloud thật.'};},
    updateAccount:async(row,changes)=>{
      const updated={...row,updatedAt:new Date().toISOString()};
      for(const {field,value} of changes) updated[field]=value;
      fixtureWorkspace.accounts=fixtureWorkspace.accounts.map(item=>item.id===row.id?updated:item);
      localStorage.setItem('memoire.fixture.ai-actions.accounts',JSON.stringify(fixtureWorkspace.accounts));
      return{mode:'cloud',warning:'Đã sửa khách hàng fixture cục bộ; xác nhận cloud được mô phỏng.'};
    },
    update:async(row,changes)=>{
      const updated={...row,updatedAt:new Date().toISOString()};
      for(const {field,value}of changes) updated[field]=['estimatedValue','pipelineProbability'].includes(field)?Number(value):value;
      fixtureWorkspace.opportunities=fixtureWorkspace.opportunities.map(item=>item.id===row.id?updated:item);
      localStorage.setItem('memoire.fixture.ai-actions.opportunities',JSON.stringify(fixtureWorkspace.opportunities));
      return{mode:'cloud',warning:'Đã sửa cơ hội fixture cục bộ; không ghi cloud thật.'};
    },
  },owns);
}
