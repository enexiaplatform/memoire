import { applyActionBatch } from '../../../src/features/aiChat/actionBatch.ts';
import { fixtureWorkspace } from './workspace.mjs';
import { loadPlanItems,savePlanItem } from '../../../src/services/planItemStore.ts';
export async function executeChatActions(batch,owns) {
  return applyActionBatch(batch,{
    load:async()=>({opportunities:fixtureWorkspace.opportunities,plans:loadPlanItems()}),
    addPlan:async(record)=>{savePlanItem(record,{syncCloud:false});return{mode:'cloud',warning:'Đã lưu fixture cục bộ; xác nhận cloud được mô phỏng, không ghi cloud thật.'};},
    update:async(row,changes)=>{
      const updated={...row,updatedAt:new Date().toISOString()};
      for(const {field,value}of changes) updated[field]=['estimatedValue','pipelineProbability'].includes(field)?Number(value):value;
      fixtureWorkspace.opportunities=fixtureWorkspace.opportunities.map(item=>item.id===row.id?updated:item);
      localStorage.setItem('memoire.fixture.ai-actions.opportunities',JSON.stringify(fixtureWorkspace.opportunities));
      return{mode:'cloud',warning:'Đã sửa cơ hội fixture cục bộ; không ghi cloud thật.'};
    },
  },owns);
}
