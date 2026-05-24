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
        'You classify B2B sales activity notes into structured CRM-lite fields.',
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
    'Classify this sales activity note.',
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
      summary: '',
      nextAction: '',
      dueDate: '',
      tags: [''],
      suggestedOpportunityId: '',
      confidence: 'Medium',
      reasoning: [''],
    }, null, 2),
    '',
    'Rules:',
    '- dueDate must be YYYY-MM-DD or empty.',
    '- suggestedOpportunityId must match a provided opportunity id or be empty.',
    '- tags should be short lowercase labels.',
    '- reasoning should explain matching/classification without revealing hidden chain-of-thought.',
  ].join('\n');
}
