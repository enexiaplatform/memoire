import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from './generate-embedding.js';
import { verifyUserToken } from './_auth.js';
import { enforceRateLimit } from './_rateLimit.js';

// Groq uses OpenAI-compatible API — no extra package needed
export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') return res.status(405).end();

  const { query, userId, authToken } = req.body;
    if (!query || !userId || !authToken) {
          return res.status(400).json({ error: 'query, userId, authToken required' });
    }
    if (typeof query !== 'string' || query.length > 1000 || !await verifyUserToken(authToken, userId)) {
          return res.status(401).json({ error: 'Unauthorized or invalid request' });
    }
    const rateLimit = enforceRateLimit(req, 'search', userId, 12);
    if (!rateLimit.allowed) {
          return res.status(429).json({ error: 'Too many requests', retryAfterSeconds: rateLimit.retryAfterSeconds });
    }
    if (!process.env.OPENAI_API_KEY || !process.env.GROQ_API_KEY) {
          return res.status(503).json({ error: 'Search providers are not configured' });
    }

  // Use user's auth token to enforce RLS
  const supabase = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.VITE_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${authToken}` } } }
      );

  try {
        const groq = new OpenAI({
          apiKey: process.env.GROQ_API_KEY,
          baseURL: 'https://api.groq.com/openai/v1',
        });
        // Step 1: Embed the query (OpenAI text-embedding-3-small)
      const queryEmbedding = await generateEmbedding(query);

      // Step 2: Vector search in user's captures
      const { data: matches, error } = await supabase.rpc('match_captures', {
              query_embedding: queryEmbedding,
              match_threshold: 0.65,
              match_count: 8,
              p_user_id: userId,
      });

      if (error) throw error;

      if (!matches || matches.length === 0) {
              return res.json({
                        answer: "I couldn't find anything relevant in your captures. Try capturing more notes first.",
                        sources: [],
                        suggested_questions: [],
                        has_results: false,
              });
      }

      // Step 3: Synthesize answer with Groq (llama-3.3-70b-versatile)
      const context = matches
          .map((m: any, i: number) => `[Source ${i + 1}] Captured ${m.captured_at}:\n${m.raw_text}`)
          .join('\n\n---\n\n');

      const synthesisPrompt = `You are a professional memory assistant. Answer the user's question based ONLY on their captured notes below.

      Rules:
      - Answer concisely and directly (2-4 sentences max)
      - Cite sources by number [Source 1], [Source 2] etc.
      - If the answer is not clearly in the sources, say "I don't have enough information about this in your captures"
      - Never invent or infer facts not in the sources
      - Write in second person ("you met", "your contact said")

      User's question: ${query}

      Their captured notes:
      ${context}

      Also generate 2-3 short follow-up questions the user might want to ask next. Return ONLY a JSON object:
      {
        "answer": "...",
          "suggested_questions": ["...", "...", "..."]
          }`;

      const completion = await groq.chat.completions.create({
              model: 'llama-3.3-70b-versatile',
              max_tokens: 512,
              temperature: 0.1,
              messages: [{ role: 'user', content: synthesisPrompt }],
              response_format: { type: 'json_object' },
      });

      const text = completion.choices[0]?.message?.content || '';
        let parsed = { answer: '', suggested_questions: [] as string[] };
        try {
                parsed = JSON.parse(text);
        } catch {
                parsed.answer = text || 'Unable to synthesize answer.';
        }

      res.json({
              answer: parsed.answer,
              sources: matches,
              suggested_questions: parsed.suggested_questions || [],
              has_results: true,
      });

  } catch (err) {
        console.error('Search failed:', err);
        res.status(500).json({ error: 'search_failed' });
  }
}
