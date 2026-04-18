import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536,
  });
  return response.data[0].embedding;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const { captureId, text, userId } = req.body;
  if (!captureId || !text || !userId) {
    return res.status(400).json({ error: 'captureId, text, userId required' });
  }

  try {
    const embedding = await generateEmbedding(text);

    await supabase
      .from('captures')
      .update({ embedding })
      .eq('id', captureId)
      .eq('user_id', userId);

    res.json({ success: true });
  } catch (err) {
    console.error('Embedding generation failed:', err);
    res.status(500).json({ error: 'embedding_failed' });
  }
}
