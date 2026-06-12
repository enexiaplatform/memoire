import {
  forecastEvidenceDefinitions,
  managerQuestions,
  missingContextLabels,
  pipelineDefenseBriefMeta,
  type PipelineDefenseDeal,
} from '../../data/pipelineDefenseBrief';
import type { PipelineDefenseBrief } from '../../utils/pipelineDefenseStorage';
import type { PipelineDefenseBriefSummary } from '../../utils/exportPipelineDefenseBrief';
import { analyzePipelineDefenseBriefQuality } from '../../utils/pipelineDefenseBriefQuality';
import { groupActionItemsByPriority, type ActionPriority, type PipelineDefenseActionItem } from '../../utils/pipelineDefenseActionPlan';
import { buildShareablePipelineDefenseBrief } from '../../utils/shareablePipelineDefenseBrief';

type PrintableBriefProps = {
  brief: PipelineDefenseBrief | null;
  deals: PipelineDefenseDeal[];
  summary: PipelineDefenseBriefSummary;
  actionItems?: PipelineDefenseActionItem[];
};

export function PipelineDefensePrintableBrief({ brief, deals, summary, actionItems = [] }: PrintableBriefProps) {
  const qualityAnalysis = analyzePipelineDefenseBriefQuality(brief);
  const groupedActionItems = groupActionItemsByPriority(actionItems);
  const shareableBrief = buildShareablePipelineDefenseBrief({ brief, deals, actionItems });

  return (
    <article className="printable-brief print-only">
      <header className="print-section print-break-inside-avoid">
        <p className="print-eyebrow">Pipeline Defense Brief</p>
        <h1>{brief?.title || 'Pipeline Review Defense Brief'}</h1>
        <dl className="print-meta-grid">
          <PrintMeta label="Week" value={brief?.weekLabel || pipelineDefenseBriefMeta.week} />
          <PrintMeta label="Sales owner" value={brief?.salesOwner || pipelineDefenseBriefMeta.salesOwner} />
          <PrintMeta label="Scope" value={brief?.scope || pipelineDefenseBriefMeta.scope} />
          <PrintMeta label="Pipeline period" value={pipelineDefenseBriefMeta.pipelinePeriod} />
          <PrintMeta label="Generated" value={formatPrintDate(shareableBrief.generatedAt)} />
          <PrintMeta label="Created" value={formatPrintDate(brief?.createdAt)} />
          <PrintMeta label="Updated" value={formatPrintDate(brief?.updatedAt)} />
        </dl>
        <p className="print-privacy-note">
          Confirm workspace data mode before sharing: synced, local-only, sync issue, or demo-local.
        </p>
      </header>

      <section className="print-section print-break-inside-avoid">
        <PrintSectionHeader title="Executive Summary" />
        <dl className="print-summary-grid">
          <PrintMetric label="Deals reviewed" value={String(summary.dealsReviewed)} />
          <PrintMetric label="At-risk deals" value={String(summary.atRiskDeals)} />
          <PrintMetric label="Defendable" value={String(shareableBrief.executiveSummary.defendableDeals)} />
          <PrintMetric label="Rescue" value={String(shareableBrief.executiveSummary.rescueDeals)} />
          <PrintMetric label="Downgrade / deprioritize" value={String(shareableBrief.executiveSummary.downgradeDeals)} />
          <PrintMetric label="Pipeline value captured" value={shareableBrief.executiveSummary.totalPipelineValueLabel} />
          <PrintMetric label="Highest-risk deal" value={formatDealName(summary.highestRiskDeal)} />
          <PrintMetric
            label="Most common missing context"
            value={summary.commonMissingContext ? `${summary.commonMissingContext.label} (${summary.commonMissingContext.count})` : 'None'}
          />
          <PrintMetric label="Top recommended action" value={summary.topRecommendedAction?.recommendedAction || 'None'} />
        </dl>
      </section>

      <section className="print-section print-break-inside-avoid">
        <PrintSectionHeader title="Manager Review Summary" />
        <p className="print-paragraph">{shareableBrief.managerSummary}</p>
      </section>

      <section className="print-section">
        <PrintSectionHeader title="Deal Defense Table" />
        <div className="print-table-wrap">
          <table className="print-table">
            <thead>
              <tr>
                <th>Deal</th>
                <th>Forecast</th>
                <th>Defense</th>
                <th>Evidence / gap</th>
                <th>Next action</th>
              </tr>
            </thead>
            <tbody>
              {shareableBrief.dealRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.account}</strong>
                    <br />
                    {row.opportunity}
                    <br />
                    {row.currentStage} / {row.value}
                  </td>
                  <td>{row.forecastCategory}</td>
                  <td>{row.defenseStatus}</td>
                  <td>
                    <strong>Evidence:</strong> {row.mainEvidence}
                    <br />
                    <strong>Gap:</strong> {row.mainGap}
                  </td>
                  <td>{row.nextDefenseAction}</td>
                </tr>
              ))}
              {shareableBrief.dealRows.length === 0 && (
                <tr>
                  <td colSpan={5}>No deals available for this review.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="print-section">
        <PrintSectionHeader title="Deals To Defend / Rescue / Downgrade" />
        <div className="print-grid-three">
          <PrintDealGroup title="Defend" deals={shareableBrief.dealsToDefend} />
          <PrintDealGroup title="Rescue" deals={shareableBrief.dealsToRescue} />
          <PrintDealGroup title="Downgrade / deprioritize" deals={shareableBrief.dealsToDowngrade} />
        </div>
      </section>

      <section className="print-section">
        <PrintSectionHeader title="Top Missing Proof / MEDDIC Gaps" />
        {shareableBrief.topMissingProofGaps.length === 0 ? (
          <p className="print-empty">No repeated proof or MEDDIC gap detected.</p>
        ) : (
          <ul>
            {shareableBrief.topMissingProofGaps.slice(0, 7).map((gap) => (
              <li key={gap.label}>{gap.label}: {gap.count} deal(s) affected ({gap.accounts.join(', ')})</li>
            ))}
          </ul>
        )}
      </section>

      <section className="print-section">
        <PrintSectionHeader title="Next Defense Actions" />
        {shareableBrief.nextDefenseActions.length === 0 ? (
          <p className="print-empty">No next defense actions defined yet.</p>
        ) : (
          <div className="print-stack">
            {shareableBrief.nextDefenseActions.slice(0, 10).map((action) => (
              <div key={action.id} className="print-card print-break-inside-avoid">
                <div className="print-card-header">
                  <div>
                    <p className="print-card-kicker">{action.account} / {action.opportunity}</p>
                    <h3>{action.title}</h3>
                  </div>
                  <span className="print-pill">{action.priority}</span>
                </div>
                <PrintText label="Detail" value={action.detail} />
                <PrintText label="Source" value={action.source} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="print-section print-break-inside-avoid">
        <PrintSectionHeader title="Brief Quality Checklist" />
        <ul>
          {shareableBrief.qualityChecklist.map((item) => (
            <li key={item.id}>{item.status === 'pass' ? 'Pass' : 'Warning'} - {item.label}: {item.detail}</li>
          ))}
        </ul>
      </section>

      <section className="print-section print-break-inside-avoid">
        <PrintSectionHeader title="Brief Quality Review" />
        <dl className="print-summary-grid">
          <PrintMetric label="Readiness status" value={qualityAnalysis.status} />
          <PrintMetric label="High-risk issues" value={String(qualityAnalysis.highRiskIssues)} />
          <PrintMetric label="Medium-risk issues" value={String(qualityAnalysis.mediumRiskIssues)} />
          <PrintMetric label="Low-risk issues" value={String(qualityAnalysis.lowRiskIssues)} />
        </dl>
        {qualityAnalysis.cleanupActions.length > 0 && (
          <div className="print-field">
            <p>Recommended cleanup actions</p>
            <ul>
              {qualityAnalysis.cleanupActions.slice(0, 5).map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {actionItems.length > 0 && (
        <section className="print-section">
          <PrintSectionHeader title="Weekly Action Plan" />
          {(['Critical', 'High', 'Medium', 'Low'] as ActionPriority[]).map((priority) => {
            const priorityItems = groupedActionItems[priority];
            if (priorityItems.length === 0) return null;

            return (
              <div key={priority} className="print-field print-break-inside-avoid">
                <p>{priority}</p>
                <div className="print-stack">
                  {priorityItems.map((item) => (
                    <div key={item.id} className="print-card print-break-inside-avoid">
                      <div className="print-card-header">
                        <div>
                          <p className="print-card-kicker">{item.account} / {item.opportunity}</p>
                          <h3>{item.title}</h3>
                        </div>
                        <span className="print-pill">{item.actionType}</span>
                      </div>
                      <PrintText label="Detail" value={item.detail} />
                      <PrintText label="Reason" value={item.reason} />
                      <PrintText label="Owner" value={item.suggestedOwner} />
                      <PrintText label="Due" value={item.suggestedDueTiming} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="print-section">
        <PrintSectionHeader title="Top At-Risk Deals" />
        {deals.length === 0 ? (
          <p className="print-empty">No pipeline deals available for this review.</p>
        ) : (
          <div className="print-stack">
            {deals.map((deal) => (
              <div key={deal.id} className="print-card print-break-inside-avoid">
                <div className="print-card-header">
                  <div>
                    <p className="print-card-kicker">{deal.account || 'Unknown Account'}</p>
                    <h3>{deal.opportunity || 'Unknown Opportunity'}</h3>
                  </div>
                  <div className="print-pill-row">
                    <span className="print-pill">{deal.forecastEvidenceCategory}</span>
                    <span className="print-pill">{deal.decisionRecommendation}</span>
                  </div>
                </div>
                <PrintText label="Pipeline context" value={deal.pipelineContext} />
                <PrintText label="Deal truth" value={deal.dealTruth} />
                <PrintList label="Risk type" items={deal.riskType} />
                <PrintList label="Evidence" items={deal.evidence} />
                <PrintList label="Missing context" items={deal.missingContext} />
                <PrintText label="Recommended action" value={deal.recommendedAction} />
                <PrintText label="Pipeline review answer" value={deal.pipelineReviewAnswer} />
                {deal.assumption && <PrintText label="Assumption" value={deal.assumption} />}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="print-section">
        <PrintSectionHeader title="Missing Context Radar" />
        <div className="print-grid-two">
          {missingContextLabels.map((label) => {
            const affectedDeals = deals.filter((deal) => deal.missingContext.some((context) => normalizeMissingContext(context) === label));
            return (
              <div key={label} className="print-card print-break-inside-avoid">
                <h3>{label}</h3>
                <p>{affectedDeals.length} deals affected</p>
                <p>{affectedDeals.length > 0 ? affectedDeals.map((deal) => deal.account || 'Unknown Account').join(', ') : 'None'}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="print-section">
        <PrintSectionHeader title="Objection Debt" />
        {deals.length === 0 ? (
          <p className="print-empty">No objection debt available because no deals are in this review.</p>
        ) : (
          <div className="print-stack">
            {deals.map((deal) => (
              <div key={deal.id} className="print-card print-break-inside-avoid">
                <div className="print-card-header">
                  <div>
                    <p className="print-card-kicker">{deal.account || 'Unknown Account'}</p>
                    <h3>{deal.objectionDebt.objection || 'No objection entered yet.'}</h3>
                  </div>
                  <span className="print-pill">{deal.objectionDebt.status}</span>
                </div>
                <PrintText label="Evidence" value={deal.objectionDebt.evidence} />
                <PrintText label="Required proof/action" value={deal.objectionDebt.requiredAction} />
                <PrintText label="Owner" value={deal.objectionDebt.owner} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="print-section">
        <PrintSectionHeader title="Forecast Evidence Categories" />
        <div className="print-grid-two">
          {forecastEvidenceDefinitions.map((item) => (
            <div key={item.category} className="print-card print-break-inside-avoid">
              <h3>{item.category}</h3>
              <p>{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="print-section print-break-inside-avoid">
        <PrintSectionHeader title="Manager Question List" />
        <ol className="print-numbered-list">
          {managerQuestions.map((item) => (
            <li key={item.id}>{item.question}</li>
          ))}
        </ol>
      </section>

      <section className="print-section">
        <PrintSectionHeader title="Recommended Actions This Week" />
        {deals.length === 0 ? (
          <p className="print-empty">No recommended actions because no deals are in this review.</p>
        ) : (
          <div className="print-stack">
            {deals.map((deal) => (
              <div key={deal.id} className="print-card print-break-inside-avoid">
                <h3>{deal.account || 'Unknown Account'} / {deal.opportunity || 'Unknown Opportunity'}</h3>
                <PrintText label="Action" value={deal.recommendedAction} />
                <PrintText label="Why this week" value={deal.pipelineReviewAnswer} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="print-section">
        <PrintSectionHeader title="Decision Log" />
        {deals.length === 0 ? (
          <p className="print-empty">No decision log entries because no deals are in this review.</p>
        ) : (
          <div className="print-stack">
            {deals.map((deal) => (
              <div key={deal.id} className="print-card print-break-inside-avoid">
                <div className="print-card-header">
                  <div>
                    <p className="print-card-kicker">{deal.account || 'Unknown Account'}</p>
                    <h3>{deal.opportunity || 'Unknown Opportunity'}</h3>
                  </div>
                  <span className="print-pill">{deal.decisionRecommendation}</span>
                </div>
                <PrintText label="Next action" value={deal.recommendedAction} />
              </div>
            ))}
          </div>
        )}
      </section>
    </article>
  );
}

function PrintSectionHeader({ title }: { title: string }) {
  return <h2 className="print-section-title">{title}</h2>;
}

function PrintMeta({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || '-'}</dd>
    </div>
  );
}

function PrintMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PrintDealGroup({ title, deals }: { title: string; deals: PipelineDefenseDeal[] }) {
  return (
    <div className="print-card print-break-inside-avoid">
      <h3>{title}</h3>
      {deals.length === 0 ? (
        <p>None</p>
      ) : (
        <ul>
          {deals.map((deal) => (
            <li key={deal.id}>{deal.account || 'Unknown Account'} / {deal.opportunity || 'Unknown Opportunity'}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PrintText({ label, value }: { label: string; value?: string }) {
  return (
    <div className="print-field">
      <p>{label}</p>
      <p>{value && value.trim().length > 0 ? value : 'No entry yet.'}</p>
    </div>
  );
}

function PrintList({ label, items }: { label: string; items: string[] }) {
  const visibleItems = items.filter(Boolean);

  return (
    <div className="print-field">
      <p>{label}</p>
      {visibleItems.length > 0 ? (
        <ul>
          {visibleItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>No entry yet.</p>
      )}
    </div>
  );
}

function formatDealName(deal: PipelineDefenseDeal | null) {
  if (!deal) return 'None';
  return `${deal.account || 'Unknown Account'} / ${deal.opportunity || 'Unknown Opportunity'}`;
}

function formatPrintDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeMissingContext(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes('decision maker') || lower.includes('decision owner') || lower.includes('active decision')) return 'Decision maker';
  if (lower.includes('decision timeline') || lower.includes('timing')) return 'Decision timeline';
  if (lower.includes('procurement')) return 'Procurement path';
  if (lower.includes('next communication')) return 'Next communication date';
  if (lower.includes('evaluation criteria') || lower.includes('technical')) return 'Technical evaluation criteria';
  if (lower.includes('budget')) return 'Budget owner';
  return value;
}
