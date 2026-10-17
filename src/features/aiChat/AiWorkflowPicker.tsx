import { useState } from "react";
import { aiWorkflows, workflowsForSurface } from "./workflows";

type Props = {
  surface?: string;
  disabled: boolean;
  onChoose: (prompt: string) => void;
};

export function AiWorkflowPicker({ surface, disabled, onChoose }: Props) {
  const [expanded, setExpanded] = useState(false);
  const choose = (prompt: string) => {
    onChoose(prompt);
    setExpanded(false);
  };
  return (
    <div
      className="max-h-[32dvh] shrink-0 overflow-y-auto border-y border-line bg-white px-3 py-2"
      aria-label="Trợ lý theo công việc"
    >
      <div className="flex flex-wrap gap-2">
        {workflowsForSurface(surface)
          .slice(0, 3)
          .map((workflow) => (
            <button
              key={workflow.id}
              type="button"
              disabled={disabled}
              onClick={() => choose(workflow.prompt)}
              title={workflow.result}
              className="min-h-10 rounded-lg border border-line px-2.5 py-2 text-xs font-semibold text-brand-blue disabled:opacity-40"
            >
              {workflow.title}
            </button>
          ))}
      </div>
      <details className="mt-2 text-xs" open={expanded}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            setExpanded((value) => !value);
          }}
          className="min-h-8 cursor-pointer font-semibold text-muted"
        >
          AI có thể giúp gì trong Memoire?
        </summary>
        <p className="my-2 leading-5 text-muted">
          Chọn công việc để điền câu hỏi. Nội dung chỉ được gửi khi bạn bấm gửi.
          Dữ liệu và phạm vi sẽ hiện trong Data preview.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {aiWorkflows.map((workflow) => (
            <button
              key={workflow.id}
              type="button"
              disabled={disabled}
              onClick={() => choose(workflow.prompt)}
              className="rounded-lg border border-line p-3 text-left disabled:opacity-40"
            >
              <span className="block font-bold text-ink">{workflow.title}</span>
              <span className="mt-1 block leading-5 text-muted">
                {workflow.result}
              </span>
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
