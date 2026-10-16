import { createRoot } from "react-dom/client";
import { BrowserRouter, Link } from "react-router-dom";
import "../../../src/index.css";
import { MemoireChat } from "../../../src/features/aiChat/MemoireChat";
import { claimLocalWorkspace } from "../../../src/services/localWorkspaceOwner";

claimLocalWorkspace("fixture-owner");
export function Fixture() {
  return (
    <BrowserRouter>
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
        </div>
        <p className="text-sm text-muted">
          Open Ask Memoire. Conversations should remain when navigating or
          minimizing, and clear when closed.
        </p>
        <MemoireChat />
      </main>
    </BrowserRouter>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
