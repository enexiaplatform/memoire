import type { CaptureAiRequest } from '../services/captureAiProvider';
import type { SalesActivityType } from './salesActivityClassifier';

export const captureAiActivityTypes: SalesActivityType[] = [
  'Customer meeting',
  'Follow-up',
  'Demo / technical discussion',
  'Quote / proposal',
  'Tender / procurement',
  'Internal coordination',
  'Objection handling',
  'Admin / CRM',
  'Other',
];

export function buildCaptureAiMessages(request: CaptureAiRequest) {
  return [
    {
      role: 'system',
      content: [
        'You turn B2B sales and business notes into structured evidence for a Personal Business Activity OS.',
        'Return strict JSON only. Do not include markdown, prose, code fences, or extra keys.',
        'Be conservative. If a field is not clearly present, return an empty string.',
        'Use only the allowed activity types and confidence values.',
      ].join(' '),
    },
    {
      role: 'user',
      content: buildCaptureAiPrompt(request),
    },
  ];
}

export function buildCaptureAiPrompt(request: CaptureAiRequest) {
  return [
    'Classify this sales activity note or pasted email/thread.',
    '',
    `Activity date: ${request.activityDate}`,
    '',
    'Raw note:',
    request.rawNote,
    '',
    'Allowed activity types:',
    captureAiActivityTypes.map((type) => `- ${type}`).join('\n'),
    '',
    'Allowed confidence values:',
    '- High',
    '- Medium',
    '- Low',
    '',
    'Known opportunities. Use these only for lightweight matching; do not invent IDs.',
    JSON.stringify(request.opportunities || [], null, 2),
    '',
    'Known accounts. Use these only for lightweight matching; do not invent IDs.',
    JSON.stringify(request.accounts || [], null, 2),
    '',
    'Return JSON with this exact schema:',
    JSON.stringify({
      activityType: 'Customer meeting',
      accountName: '',
      opportunityName: '',
      contactName: '',
      stakeholderName: '',
      stakeholderRole: '',
      summary: '',
      nextAction: '',
      dueDate: '',
      nextActions: [
        {
          title: '',
          dueDate: '',
          owner: '',
          sourceText: '',
        },
      ],
      competitors: [''],
      buyingSignals: [''],
      risks: [''],
      timelineSignals: [''],
      tags: [''],
      suggestedOpportunityId: '',
      confidence: 'Medium',
      reasoning: [''],
    }, null, 2),
    '',
    'Rules:',
    '- dueDate must be YYYY-MM-DD or empty.',
    '- If multiple actions are present, put all of them in nextActions and set nextAction/dueDate from the first action.',
    '- Extract contactName/stakeholderName separately from accountName. Example: "Met with Dr. Avery at Apex Labs" means stakeholderName "Dr. Avery" and accountName "Apex Labs".',
    '- Account is an organization. A person or honorific name (Ms., Mr., Mrs., Dr.) must never be accountName.',
    '- For pasted email/thread source text, use Subject, Sender, Recipients, Account hint, Opportunity hint, and Body excerpt as evidence, but do not dump raw thread text into the summary.',
    '- opportunityName must match a provided opportunity or explicit opportunity/project/deal wording in the note. Otherwise leave it empty. Never infer an opportunity from a product, quote, tender, or contact name.',
    '- stakeholderRole must stay empty unless the note explicitly states a MEDDIC role or role evidence. Do not auto-confirm Champion or Economic Buyer from enthusiasm, seniority, or email sender status.',
    '- A timeline statement such as "Tender decision expected end of July" belongs in timelineSignals, not nextAction or nextActions.',
    '- Extract competitors, buying signals, risks, timeline signals, stakeholder evidence, and commercial signals such as PO, payment, delivery, quote, or procurement movement as arrays where they fit.',
    '- suggestedOpportunityId must match a provided opportunity id or be empty.',
    '- tags should be short lowercase labels.',
    '- reasoning should explain matching/classification without revealing hidden chain-of-thought.',
  ].join('\n');
}
