import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { rawText, existingEntities } = req.body;
  if (!rawText) return res.status(400).json({ error: 'rawText required' });

  const systemPrompt = `You are an AI assistant for Memoire, a professional memory OS for B2B professionals.

Your job: extract structured entities and relationships from a user's raw professional note.

Entity types you can extract:
- contact: a person (customer, colleague, prospect, vendor)
- company: an organization, firm, or institution
- deal: a business opportunity, project, or transaction
- meeting: a specific meeting, call, or event
- insight: a key observation, decision, or market intelligence
- competitor: a competing product or company

Rules:
1. Only extract entities explicitly mentioned or clearly implied — never hallucinate
2. Keep entity names short and proper (e.g. "Dr. Minh" not "the doctor")
3. For relationships, use: works_at / attended / mentioned_in / related_to / competitor_of
4. Tags should be 1-3 word lowercase phrases relevant to the capture
5. Return valid JSON only — no markdown, no explanation

Output format:
{
  "entities": [
    { "tempId": "t1", "entity_type": "contact", "name": "Dr. Minh", "description": "Contact at ABC Pharma" },
    { "tempId": "t2", "entity_type": "company", "name": "ABC Pharma", "description": "Pharmaceutical manufacturer" },
    { "tempId": "t3", "entity_type": "insight", "name": "Q3 endotoxin supplier switch", "description": "ABC Pharma planning to switch endotoxin supplier in Q3 due to budget concerns" }
  ],
  "relationships": [
    { "sourceTempId": "t1", "targetTempId": "t2", "relationship_type": "works_at", "label": "works at" },
    { "sourceTempId": "t3", "targetTempId": "t2", "relationship_type": "mentioned_in", "label": "mentioned by" }
  ],
  "tags": ["endotoxin", "pharma", "Q3", "budget"],
  "confidence": "high"
}`;

  const userMessage = `Raw note:\n${rawText}\n\n${
    existingEntities?.length
      ? `User's existing entities for deduplication:\n${JSON.stringify(existingEntities)}`
      : ''
  }`;

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      temperature: 0.2,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    try {
      const content = message.content[0].type === 'text' ? message.content[0].text : '';
      const parsed = JSON.parse(content);
      return res.json(parsed);
    } catch (parseError) {
      console.error('Claude JSON Parse Error:', parseError);
      return res.status(200).json({ error: 'extraction_failed', entities: [], relationships: [], tags: [] });
    }
  } catch (apiError) {
    console.error('Claude API Error:', apiError);
    return res.status(200).json({ error: 'extraction_failed', entities: [], relationships: [], tags: [] });
  }
}
