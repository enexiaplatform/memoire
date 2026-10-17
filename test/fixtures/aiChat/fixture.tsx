import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, useLocation } from "react-router-dom";
import "../../../src/index.css";
import { MemoireChat } from "../../../src/features/aiChat/MemoireChat";
import { AiChatPanel } from "../../../src/features/aiChat/AiChatPanel";
import { claimLocalWorkspace } from "../../../src/services/localWorkspaceOwner";
import {useState} from 'react';
import {loadPlanItems} from '../../../src/services/planItemStore';
import {fixtureWorkspace,loadSalesWorkspaceData} from './workspace.mjs';

claimLocalWorkspace("fixture-owner");
export function Fixture() {
  return <BrowserRouter><FixtureBody /></BrowserRouter>;
}
function FixtureBody() {
  const {pathname} = useLocation();
  const [evidence,setEvidence]=useState('');
  return (
      <main className="mx-auto flex max-w-4xl flex-col gap-4 p-4 sm:p-7">
        <div className="rounded-xl bg-amber-100 p-4 text-sm text-amber-950">
          <strong>Fictional browser test · no live Groq calls</strong>
          <p>
            Real floating chat, client and API handler; isolated fixture
            authentication, data and provider response. Type QUOTA or TIMEOUT to
            exercise failures.
          </p>
        </div>
        <h1 className="text-2xl font-bold text-ink">
          Memoire · Chat interaction fixture
        </h1>
        <div className="flex gap-4 text-brand-blue">
          <Link to="/fixture/accounts">Accounts</Link>
          <Link to="/fixture/reports">Reports</Link>
          <Link to="/fixture/full-chat">Full chat</Link>
        </div>
        <p className="text-sm text-muted">
          Open Ask Memoire. Conversations should remain when navigating or
          minimizing, and clear when closed.
        </p>
        <button type="button" onClick={()=>{void loadSalesWorkspaceData().then(()=>setEvidence(JSON.stringify({plans:loadPlanItems().filter(row=>row.label.startsWith('Fixture:')),opportunities:fixtureWorkspace.opportunities.map(row=>({id:row.id,nextAction:row.nextAction,nextActionDate:row.nextActionDate}))},null,2)));}} className="self-start rounded-xl border p-3">Read saved fictional records</button>
        <pre className="max-h-96 overflow-auto text-xs" aria-label="Saved fictional records">{evidence}</pre>
        {pathname === '/fixture/full-chat' ? <AiChatPanel userId="fixture-owner" scope={{kind:'all'}} onLocal={()=>{}} /> : <MemoireChat />}
      </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
