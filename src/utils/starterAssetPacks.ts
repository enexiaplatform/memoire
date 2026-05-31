import type { SalesAssetInput, SalesAssetType } from '../services/salesAssetStore';

export type StarterAssetPack = {
  id: string;
  name: string;
  industry: string;
  description: string;
  assets: StarterAsset[];
};

export type StarterAsset = Pick<SalesAssetInput, 'title' | 'assetType' | 'summary' | 'content' | 'tags' | 'useCase' | 'relatedObjectionType'>;

function asset(
  title: string,
  assetType: SalesAssetType,
  summary: string,
  content: string,
  tags: string[],
  useCase: string,
  relatedObjectionType = ''
): StarterAsset {
  return { title, assetType, summary, content, tags, useCase, relatedObjectionType };
}

export const starterAssetPacks: StarterAssetPack[] = [
  {
    id: 'pharma-life-science-lab',
    name: 'Pharma / Life Science / Lab Sales',
    industry: 'Pharma, lab, validation, testing, GMP environments',
    description: 'Proof notes and response snippets for validation, GMP, lead time, tender, and technical evaluation cycles.',
    assets: [
      asset(
        'IQ/OQ/PQ documentation proof response',
        'Validation / Documentation Note',
        'Reusable response for validation teams asking how installation and qualification evidence will be handled.',
        'We can support IQ/OQ/PQ readiness with documented installation steps, qualification evidence, acceptance criteria, and a validation handover checklist. The goal is to reduce audit risk and make technical acceptance clear before procurement closes.',
        ['pharma', 'validation', 'iq-oq-pq', 'documentation'],
        'Use when QA, validation, or technical buyers ask for proof that the solution can pass internal validation.',
        'Documentation'
      ),
      asset(
        'GMP compliance validation note',
        'Compliance Note',
        'Short GMP-oriented proof note for regulated lab and manufacturing conversations.',
        'For GMP environments, we should align early on documentation expectations, change-control impact, calibration or service evidence, operator training, and records needed for QA approval. This prevents a late-stage compliance objection from blocking procurement.',
        ['gmp', 'compliance', 'qa', 'regulated'],
        'Use in proposal or follow-up when compliance risk is part of the buying decision.',
        'Compliance / validation'
      ),
      asset(
        'Premium solution procurement justification',
        'Procurement Justification',
        'Value justification for a premium solution when procurement compares lowest-price options.',
        'The recommendation is not only based on unit price. The premium solution should be evaluated against validation risk, downtime avoidance, local support, documentation readiness, service responsiveness, and total lifecycle cost.',
        ['procurement', 'premium', 'tco', 'value'],
        'Use when procurement challenges price or asks why the customer should not choose the lowest bid.',
        'Price'
      ),
      asset(
        'Lead time objection response for validated projects',
        'Objection Response',
        'Response for lead time concern in projects where validation and implementation timing matter.',
        'Lead time is a real project risk, so we should confirm the required go-live date, identify which items can be prepared in parallel, and agree on a delivery-risk mitigation plan. We can also separate commercial approval from documentation preparation to avoid losing time.',
        ['lead-time', 'delivery', 'project-risk'],
        'Use when the customer worries that delivery timing may miss validation or tender milestones.',
        'Lead time'
      ),
      asset(
        'Competitor comparison response for regulated lab buyers',
        'Competitor Response',
        'Balanced competitor response focused on evidence, support, and implementation risk.',
        'Instead of making a feature-by-feature claim, we should compare the options on validation evidence, local support, reference fit, service responsiveness, documentation completeness, and risk if something goes wrong after installation.',
        ['competitor', 'comparison', 'regulated-lab'],
        'Use when a competitor remains in the loop and the buyer needs a defensible comparison.',
        'Competitor'
      ),
      asset(
        'Technical evaluation discovery questions',
        'Discovery Question Set',
        'Questions for technical buyer alignment before demo, proposal, or tender response.',
        '1. What technical criteria will be used to compare vendors?\n2. Which validation documents must be approved before purchase?\n3. Who signs off technical acceptance?\n4. What failure mode would make this project unacceptable?\n5. What reference or proof would reduce risk for QA?',
        ['discovery', 'technical-buyer', 'evaluation'],
        'Use before technical discussion to clarify decision criteria and proof needs.'
      ),
      asset(
        'Post-demo follow-up script for lab stakeholders',
        'Follow-up Script',
        'Concise follow-up after a demo or technical discussion.',
        'Thank you for the technical discussion today. My understanding is that the key decision points are validation readiness, local support, lead time, and fit with your current workflow. I will send the revised proof package and confirm the next procurement or QA review step.',
        ['follow-up', 'demo', 'lab'],
        'Use after demo when the next step needs to be made explicit.'
      ),
      asset(
        'Tender clarification email snippet',
        'Email Template',
        'Email snippet for clarifying tender requirements without sounding defensive.',
        'To make sure our tender response is accurate, could you confirm the expected documentation package, required delivery window, evaluation criteria weighting, and whether equivalent proof or reference evidence can be submitted?',
        ['tender', 'procurement', 'clarification'],
        'Use when tender requirements are unclear or likely to create hidden risk.',
        'Procurement'
      ),
      asset(
        'Validation risk mitigation note',
        'Proof Asset',
        'Proof note that frames validation risk as a managed implementation workstream.',
        'Validation risk can be reduced by aligning acceptance criteria before PO, preparing documentation in parallel, confirming stakeholder sign-off, and scheduling a handover review with QA or technical owners before installation.',
        ['validation-risk', 'qa', 'implementation'],
        'Use when the customer is worried about validation burden or audit exposure.',
        'Compliance / validation'
      ),
      asset(
        'Total cost of ownership proposal snippet',
        'Proposal Snippet',
        'Proposal language for cost justification beyond initial purchase price.',
        'The total cost of ownership should include equipment cost, validation effort, downtime risk, service responsiveness, documentation effort, operator adoption, and the commercial impact of delayed implementation.',
        ['tco', 'proposal', 'business-case'],
        'Use in proposal sections where price needs to be defended with lifecycle value.',
        'Price'
      ),
      asset(
        'Local support proof note',
        'Proof Asset',
        'Reusable support proof for buyers worried about post-sale service.',
        'Local support should be evaluated by response process, escalation path, spare-part access, technical availability, and documented service history. We should provide a clear support plan before procurement closes.',
        ['local-support', 'service', 'risk'],
        'Use when service or local support confidence is a blocker.',
        'Local support'
      ),
      asset(
        'Budget approval confirmation email',
        'Email Template',
        'Short email to confirm budget and decision sequence after a buying signal.',
        'Thanks for confirming budget alignment. To keep the project moving, can we confirm who owns final budget approval, what procurement step comes next, and what proof package is required before the decision meeting?',
        ['budget', 'economic-buyer', 'procurement'],
        'Use after the customer indicates budget approval or funding availability.',
        'Budget'
      ),
    ],
  },
  {
    id: 'b2b-saas-enterprise',
    name: 'B2B SaaS / Enterprise Software Sales',
    industry: 'Enterprise software, SaaS, security, procurement, expansion',
    description: 'Templates for security review, ROI, champion enablement, legal delay, implementation proof, and buying committee discovery.',
    assets: [
      asset(
        'Security review response',
        'Compliance Note',
        'Short response for security and IT review blockers.',
        'We can support security review with architecture overview, data handling summary, access-control model, audit/logging posture, subprocessors if applicable, and answers to the customer security questionnaire.',
        ['saas', 'security', 'it-review'],
        'Use when IT or security review becomes a late-stage blocker.',
        'Compliance / validation'
      ),
      asset(
        'ROI justification snippet',
        'Proposal Snippet',
        'Reusable ROI language for enterprise software business case.',
        'The business case should compare current process cost, productivity loss, risk of delay, adoption cost, and measurable improvement expected from the new workflow. The strongest case ties ROI to a team metric the buyer already tracks.',
        ['roi', 'business-case', 'enterprise'],
        'Use in proposal and champion enablement notes.',
        'Budget'
      ),
      asset(
        'Champion enablement email',
        'Email Template',
        'Email that equips a champion to explain value internally.',
        'Here is a short internal summary you can reuse: the main problem is [problem], the business impact is [impact], the proposed next step is [next step], and the decision needs [security/procurement/budget] confirmation by [date].',
        ['champion', 'enablement', 'internal-selling'],
        'Use when a champion needs help selling internally.'
      ),
      asset(
        'Procurement legal delay response',
        'Objection Response',
        'Response for procurement or legal delay that protects deal momentum.',
        'If legal or procurement review may take time, we should confirm the review owner, expected turnaround, blocking clauses, security dependencies, and a parallel workstream so business evaluation does not stall.',
        ['legal', 'procurement', 'delay'],
        'Use when legal/procurement timing becomes a deal risk.',
        'Procurement'
      ),
      asset(
        'Competitor displacement talk track',
        'Competitor Response',
        'Positioning response for replacing an incumbent or competitive SaaS option.',
        'The comparison should focus on why the current approach is not solving the business problem, what measurable improvement is required, and what switching risk can be reduced with implementation support and proof.',
        ['competitor', 'displacement', 'incumbent'],
        'Use when displacing an incumbent vendor or defending against a short-listed competitor.',
        'Competitor'
      ),
      asset(
        'Implementation risk proof note',
        'Proof Asset',
        'Proof note for buyers worried about rollout complexity.',
        'Implementation risk can be managed through phased rollout, clear owner map, integration checklist, success criteria, enablement plan, and post-launch adoption review. The buyer should know what happens in the first 30-60 days.',
        ['implementation', 'adoption', 'rollout'],
        'Use when implementation risk is raised by operations, IT, or a skeptical buyer.',
        'Technical fit'
      ),
      asset(
        'Enterprise buying committee discovery questions',
        'Discovery Question Set',
        'Questions to map the enterprise buying committee and decision path.',
        '1. Who owns the business metric this project improves?\n2. Who controls budget approval?\n3. Who can block the security or legal review?\n4. What internal event is driving timing?\n5. What proof would make this safe to approve?',
        ['discovery', 'buying-committee', 'economic-buyer'],
        'Use in discovery when multiple stakeholders influence the decision.'
      ),
      asset(
        'Renewal expansion follow-up script',
        'Follow-up Script',
        'Follow-up for expansion or renewal conversations.',
        'Based on the usage and goals discussed, the next step is to confirm expansion value, identify the stakeholder who owns the budget, and align on the timeline for renewal or additional seats.',
        ['renewal', 'expansion', 'follow-up'],
        'Use after renewal/expansion discovery.'
      ),
      asset(
        'Data privacy objection response',
        'Objection Response',
        'Response for data privacy or customer data handling concerns.',
        'That concern is valid. We should separate what data is processed, where it is stored, who can access it, what controls exist, and which contractual or security documents are needed before approval.',
        ['privacy', 'data', 'security'],
        'Use when customer data privacy becomes a blocker.',
        'Compliance / validation'
      ),
      asset(
        'Pilot success criteria template',
        'Proposal Snippet',
        'A concise pilot acceptance criteria snippet.',
        'Pilot success should be measured by agreed usage, workflow completion, stakeholder feedback, time saved, integration readiness, and a clear go/no-go decision date.',
        ['pilot', 'success-criteria', 'evaluation'],
        'Use when a customer asks for a pilot or proof of concept.',
        'Technical fit'
      ),
      asset(
        'Executive sponsor business case note',
        'Proof Asset',
        'Business case note for executive sponsor alignment.',
        'The executive sponsor needs a simple case: the business problem, cost of inaction, expected measurable gain, implementation risk, and decision deadline. Without this, the deal may stay interesting but unfunded.',
        ['executive-sponsor', 'business-case', 'budget'],
        'Use when the economic buyer is not yet engaged.',
        'Budget'
      ),
      asset(
        'Mutual action plan email snippet',
        'Email Template',
        'Email snippet to align timeline and ownership.',
        'To keep momentum, here is the proposed mutual action plan: confirm success criteria, complete security review, align commercial scope, confirm procurement owner, and schedule decision review by [date].',
        ['mutual-action-plan', 'timeline', 'procurement'],
        'Use when the deal has momentum but lacks a clear process.',
        'Timing'
      ),
    ],
  },
  {
    id: 'industrial-manufacturing-equipment',
    name: 'Industrial / Manufacturing / Equipment Sales',
    industry: 'Manufacturing, equipment, CAPEX, maintenance, distributor sales',
    description: 'Reusable proof and commercial responses for downtime, maintenance cost, CAPEX, lead time, after-sales support, and production efficiency.',
    assets: [
      asset(
        'Downtime reduction justification',
        'Procurement Justification',
        'Justification focused on reducing production downtime.',
        'The commercial value should include avoided downtime, faster recovery, stable production output, maintenance efficiency, and reduced risk from equipment failure during peak production windows.',
        ['downtime', 'production', 'business-case'],
        'Use when the buyer needs to justify equipment investment to operations or finance.',
        'Budget'
      ),
      asset(
        'Maintenance cost proof note',
        'Proof Asset',
        'Proof note for maintenance and service cost concerns.',
        'Maintenance cost should be assessed through service interval, spare-part access, failure risk, operator training, troubleshooting process, and total cost over the equipment lifecycle.',
        ['maintenance', 'service', 'tco'],
        'Use when the customer is concerned about operating cost after purchase.',
        'Price'
      ),
      asset(
        'CAPEX procurement justification',
        'Procurement Justification',
        'Reusable justification for CAPEX approval.',
        'CAPEX approval is stronger when tied to capacity, uptime, safety, quality, labor efficiency, and cost of delaying the investment. Procurement should compare lifecycle value, not only acquisition cost.',
        ['capex', 'procurement', 'finance'],
        'Use for finance or procurement justification in equipment deals.',
        'Procurement'
      ),
      asset(
        'Lead time mitigation response for equipment',
        'Objection Response',
        'Response for long delivery or installation lead time.',
        'Lead time can be mitigated by confirming the required production date, locking specification early, preparing site readiness in parallel, and agreeing on a milestone plan for delivery, installation, and acceptance.',
        ['lead-time', 'installation', 'equipment'],
        'Use when delivery timing threatens the decision.',
        'Lead time'
      ),
      asset(
        'After-sales support proof',
        'Proof Asset',
        'Proof note for support and service confidence.',
        'After-sales support should be demonstrated through response process, escalation path, service coverage, training, spare-part plan, preventive maintenance guidance, and documented ownership after commissioning.',
        ['after-sales', 'support', 'service'],
        'Use when buyer risk centers on what happens after installation.',
        'Local support'
      ),
      asset(
        'Technical spec comparison snippet',
        'Competitor Response',
        'Balanced technical comparison snippet for equipment evaluations.',
        'The comparison should include performance fit, tolerance or spec requirements, serviceability, operator usability, spare-part availability, safety, and lifecycle cost rather than only headline specification.',
        ['technical-spec', 'comparison', 'competitor'],
        'Use when the customer compares vendors by spec sheet alone.',
        'Competitor'
      ),
      asset(
        'Production efficiency discovery questions',
        'Discovery Question Set',
        'Questions to quantify production or operational value.',
        '1. Which production bottleneck is this project meant to solve?\n2. What is the cost of downtime today?\n3. Who owns maintenance and acceptance?\n4. What installation window is realistic?\n5. What proof would convince production leadership?',
        ['discovery', 'production', 'operations'],
        'Use in discovery with plant, operations, or maintenance stakeholders.'
      ),
      asset(
        'Distributor follow-up script',
        'Follow-up Script',
        'Follow-up script for distributor-led opportunities.',
        'Thanks for the update. To help move this through the distributor/customer process, can we confirm the end-user decision maker, technical requirement, delivery timeline, and who owns the next customer meeting?',
        ['distributor', 'follow-up', 'channel'],
        'Use when a distributor or partner is between you and the end customer.'
      ),
      asset(
        'Site readiness checklist snippet',
        'Proposal Snippet',
        'Short proposal snippet for site readiness.',
        'Before installation, the customer should confirm site access, utilities, footprint, safety constraints, operator availability, acceptance criteria, and commissioning owner.',
        ['site-readiness', 'installation', 'acceptance'],
        'Use when installation risk needs to be clarified early.',
        'Technical fit'
      ),
      asset(
        'Safety and compliance proof note',
        'Compliance Note',
        'Proof note for safety or compliance-heavy equipment decisions.',
        'Safety and compliance review should cover applicable standards, operator training, maintenance instructions, documentation, risk assessment, and any customer-specific acceptance requirements.',
        ['safety', 'compliance', 'equipment'],
        'Use when EHS, QA, or technical compliance is part of the evaluation.',
        'Compliance / validation'
      ),
      asset(
        'Budget timing objection response',
        'Objection Response',
        'Response when the customer says budget timing is not ready.',
        'If budget timing is unclear, we should confirm the next budget window, the internal sponsor, the cost of waiting, and whether a phased scope or approval package can keep the project alive.',
        ['budget', 'timing', 'capex'],
        'Use when the deal is real but funding timing is uncertain.',
        'Timing'
      ),
      asset(
        'Operator adoption proof note',
        'Proof Asset',
        'Proof note for concerns about user adoption or operator training.',
        'Operator adoption improves when training, SOP impact, usability, troubleshooting, and handover ownership are planned before commissioning, not after installation.',
        ['operators', 'training', 'adoption'],
        'Use when the user team may resist change or needs training proof.',
        'Trust / relationship'
      ),
    ],
  },
];
