import OpenAI from 'openai';

interface ApiRequest {
  method?: string;
  body?: {
    rawNote?: unknown;
  };
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
}

interface AnthropicTextBlock {
  type?: string;
  text?: string;
}

interface AnthropicMessageResponse {
  content?: AnthropicTextBlock[];
}

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

const groq = process.env.GROQ_API_KEY
  ? new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    })
  : null;

const systemPrompt = `You structure raw sales notes for Memoire, a personal sales memory system for individual B2B sellers.

Return ONLY JSON. Do not add markdown.

Required schema:
{
  "type": "call" | "email" | "meeting" | "note" | "proposal" | "other",
  "account": "company or account name, empty string if unknown",
  "contact": "person name, empty string if unknown",
  "contact_role": "role/title, empty string if unknown",
  "opportunity": "short opportunity name, empty string if unknown",
  "opportunity_stage": "new" | "active" | "proposal" | "negotiation" | "won" | "lost" | "paused",
  "estimated_value": "plain number only if stated, otherwise empty string",
  "interaction_summary": "1-2 sentence factual summary",
  "pain_point": "customer pain point, empty string if unknown",
  "objection": "objection or blocker, empty string if unknown",
  "next_action": "specific next action, empty string if none",
  "follow_up_date": "YYYY-MM-DD if explicit or confidently relative, otherwise empty string",
  "urgency": "low" | "medium" | "high",
  "confidence": "low" | "medium" | "high"
}

Rules:
- Preserve the raw note separately; do not rewrite it.
- Only infer practical sales structure from the note.
- Do not invent CRM fields or manager reporting data.
- If the note says next Tuesday, resolve it relative to today's date: ${new Date().toISOString().slice(0, 10)}.`;

function heuristicStructure(rawNote: string) {
  const accountMatch = rawNote.match(/\bat\s+([A-Z][A-Za-z0-9&.\- ]{2,60})/);
  const contactMatch = rawNote.match(/\b(?:called|met|emailed|spoke with|talked to)\s+([A-Z][A-Za-z.\- ]{1,40})(?:\s+at\b|\s+from\b|,|\.|$)/i);
  const hasProposal = /proposal/i.test(rawNote);
  const hasFollowUp = /follow up|follow-up|next step|next action/i.test(rawNote);

  return {
    type: /call|called|spoke/i.test(rawNote) ? 'call' : /email/i.test(rawNote) ? 'email' : /meeting|met/i.test(rawNote) ? 'meeting' : 'note',
    account: accountMatch?.[1]?.trim() || '',
    contact: contactMatch?.[1]?.trim() || '',
    contact_role: '',
    opportunity: hasProposal ? 'Proposal review' : '',
    opportunity_stage: hasProposal ? 'proposal' : 'active',
    estimated_value: '',
    interaction_summary: rawNote.trim(),
    pain_point: '',
    objection: /concerned about ([^,.]+)/i.exec(rawNote)?.[1]?.trim() || '',
    next_action: hasFollowUp ? 'Follow up with customer' : '',
    follow_up_date: '',
    urgency: hasFollowUp ? 'high' : 'medium',
    confidence: 'medium',
  };
}

async function callClaude(rawNote: string) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 800,
      temperature: 0.1,
      system: systemPrompt,
      messages: [{ role: 'user', content: rawNote }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude request failed: ${response.status}`);
  }

  const data = await response.json() as AnthropicMessageResponse;
  const text = data.content?.[0]?.text;
  if (!text) throw new Error('Empty Claude response');
  return JSON.parse(text);
}

async function callGroq(rawNote: string) {
  if (!groq) throw new Error('Groq is not configured');

  const completion = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    max_tokens: 800,
    temperature: 0.1,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: rawNote },
    ],
    response_format: { type: 'json_object' },
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error('Empty Groq response');
  return JSON.parse(text);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { rawNote } = req.body || {};
  if (!rawNote || typeof rawNote !== 'string' || rawNote.trim().length < 5) {
    return res.status(400).json({ error: 'rawNote is required' });
  }

  try {
    const structured = process.env.ANTHROPIC_API_KEY
      ? await callClaude(rawNote.trim())
      : await callGroq(rawNote.trim());

    return res.status(200).json(structured);
  } catch (err) {
    console.error('[structure-capture] AI structure failed, using heuristic fallback:', err);
    return res.status(200).json(heuristicStructure(rawNote));
  }
}
