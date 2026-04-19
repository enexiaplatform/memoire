import OpenAI from 'openai';

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

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
3. For relationships, use only: works_at / attended / mentioned_in / related_to / competitor_of
4. Tags should be 1-3 word lowercase phrases relevant to the capture
5. Return ONLY valid JSON — no markdown fences, no explanation, no preamble

Required output format (strict):
{
  "entities": [
    { "tempId": "t1", "entity_type": "contact", "name": "Dr. Minh", "description": "Contact at ABC Pharma" },
    { "tempId": "t2", "entity_type": "company", "name": "ABC Pharma", "description": "Pharmaceutical manufacturer" }
  ],
  "relationships": [
    { "sourceTempId": "t1", "targetTempId": "t2", "relationship_type": "works_at", "label": "works at" }
  ],
  "tags": ["endotoxin", "pharma", "Q3"],
  "confidence": "high"
}`;

export interface ExtractedEntity {
  tempId: string;
  entity_type: 'contact' | 'company' | 'deal' | 'meeting' | 'insight' | 'competitor';
  name: string;
  description: string;
  matchedExistingId?: string;
}

export interface ExtractedRelationship {
  sourceTempId: string;
  targetTempId: string;
  relationship_type: string;
  label: string;
}

export interface ExtractionResult {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  tags: string[];
  confidence: 'high' | 'medium' | 'low';
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { rawText, existingEntities } = req.body;

  if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
    return res.status(400).json({ error: 'rawText is required' });
  }

  const userMessage = `Raw note:\n${rawText.trim()}\n\n${
    existingEntities?.length
      ? `User's existing entities for deduplication (match by name+type if possible):\n${JSON.stringify(existingEntities)}`
      : ''
  }`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1024,
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from Groq');
    }

    const result: ExtractionResult = JSON.parse(content);

    // Validate shape — ensure required fields exist
    if (!Array.isArray(result.entities) || !Array.isArray(result.relationships)) {
      throw new Error('Invalid extraction shape');
    }

    // Match against existing entities (client sends existing for deduplication)
    if (existingEntities?.length) {
      result.entities = result.entities.map((e) => {
        const match = existingEntities.find(
          (ex: any) =>
            ex.name.toLowerCase() === e.name.toLowerCase() &&
            ex.entity_type === e.entity_type
        );
        return match ? { ...e, matchedExistingId: match.id } : e;
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('[claude-extract] Extraction failed:', err);
    return res.status(200).json({
      entities: [],
      relationships: [],
      tags: [],
      confidence: 'low',
      error: 'extraction_failed',
    });
  }
}
