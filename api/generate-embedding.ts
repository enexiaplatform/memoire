import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from './_env';
import { verifyUserToken } from './_auth';
import { enforceRateLimit } from './_rateLimit';

interface ApiRequest {
  method?: string;
  headers?: Record<string, unknown>;
  socket?: { remoteAddress?: string };
  body?: {
    captureId?: unknown;
    text?: unknown;
    userId?: unknown;
    authToken?: unknown;
  };
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  end: () => void;
}

export async function generateEmbedding(text: string): Promise<number[]> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Embedding provider is not configured');
    }
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: text,
          dimensions: 1536,
    });
    return response.data[0].embedding;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method !== 'POST') return res.status(405).end();

  const { captureId, text, userId, authToken } = req.body || {};
    if (!captureId || !text || !userId || !authToken) {
          return res.status(400).json({ error: 'Authentication and capture data required' });
    }
    if (typeof captureId !== 'string' || typeof text !== 'string' || typeof userId !== 'string' || text.length > 8000) {
          return res.status(400).json({ error: 'Invalid request payload' });
    }
    if (!await verifyUserToken(authToken, userId)) {
          return res.status(401).json({ error: 'Unauthorized' });
    }
    const rateLimit = enforceRateLimit(req, 'generate-embedding', userId, 20);
    if (!rateLimit.allowed) {
          return res.status(429).json({ error: 'Too many requests', retryAfterSeconds: rateLimit.retryAfterSeconds });
    }
    if (!process.env.OPENAI_API_KEY) {
          return res.status(503).json({ error: 'Embedding provider is not configured' });
    }

  try {
        const supabase = createClient(
          getSupabaseUrl(),
          getSupabaseServiceRoleKey(),
        );
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
