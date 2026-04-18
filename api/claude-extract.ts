import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { rawText } = req.body;
  if (!rawText) return res.status(400).json({ error: 'rawText required' });

  // Placeholder — full extraction logic in Prompt 02
  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: `Extract entities from: ${rawText}` }],
  });

  res.json({ result: message.content });
}
