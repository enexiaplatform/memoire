import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from './_env.js';

const supabase = createClient(
    getSupabaseUrl(),
    getSupabaseServiceRoleKey()
  );
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ApiRequest {
  method?: string;
  body?: {
    captureId?: unknown;
    text?: unknown;
    userId?: unknown;
  };
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  end: () => void;
}

export async function generateEmbedding(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: text,
          dimensions: 1536,
    });
    return response.data[0].embedding;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method !== 'POST') return res.status(405).end();

  const { captureId, text, userId } = req.body || {};
    if (!captureId || !text || !userId) {
          return res.status(400).json({ error: 'captureId, text, userId required' });
    }
    if (typeof captureId !== 'string' || typeof text !== 'string' || typeof userId !== 'string') {
          return res.status(400).json({ error: 'Invalid request payload' });
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
