import OpenAI from 'openai';
import { verifyUserToken } from './_auth';
import { enforceRateLimit } from './_rateLimit';

// Groq uses OpenAI-compatible API — no extra package needed
export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') return res.status(405).end();

    const { text, authToken } = req.body;
    if (!text || !authToken) {
        return res.status(400).json({ error: 'text and authToken required' });
    }
    if (typeof text !== 'string' || text.length > 4000) {
        return res.status(400).json({ error: 'Invalid request' });
    }
    const user = await verifyUserToken(authToken);
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const rateLimit = enforceRateLimit(req, 'anonymize', user.id, 12);
    if (!rateLimit.allowed) {
        return res.status(429).json({ error: 'Too many requests', retryAfterSeconds: rateLimit.retryAfterSeconds });
    }
    if (!process.env.GROQ_API_KEY) {
        return res.status(503).json({ error: 'Anonymization is not configured.' });
    }

    try {
        const groq = new OpenAI({
            apiKey: process.env.GROQ_API_KEY,
            baseURL: 'https://api.groq.com/openai/v1',
        });
        const systemPrompt = `You are a privacy-preserving rewriter for a personal sales-knowledge tool.

Rewrite the user's note so that it preserves PROFESSIONAL KNOWLEDGE (industry, role, technique, lesson learned) but strips PROPRIETARY CUSTOMER DATA (specific company names, exact revenue figures, contract values, internal codenames, customer PII).

Replacements rule:
- Company names → "[mid-market <industry> company]" or "[Fortune 500 <industry>]" sized appropriately
- Revenue/deal values → bands: "<$10K", "$10-50K", "$50-250K", "$250K-$1M", ">$1M"
- Person names of external contacts → role only ("VP Finance", "QC Manager")
- Internal codenames / project names → "[internal project]"
- Geographic specifics → region only ("Southeast Asia", "DACH")

Preserve:
- Industry vertical
- Job role / persona
- Technique, methodology, objection-handling pattern
- Personal reflection ("what I learned", "what I'd do differently")
- Generic product category (NOT SKU)

Return JSON: { "suggested": "<rewritten>", "replacements": [{ "from": "...", "to": "...", "reason": "..." }] }`;

        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            max_tokens: 512,
            temperature: 0.2,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: text }
            ],
            response_format: { type: 'json_object' },
        });

        const outputText = completion.choices[0]?.message?.content || '';
        let parsed = { suggested: '', replacements: [] };
        
        try {
            parsed = JSON.parse(outputText);
        } catch {
            return res.status(500).json({ error: 'Failed to parse anonymization suggestion.' });
        }

        res.json(parsed);

    } catch (err) {
        console.error('Anonymization failed:', err);
        res.status(500).json({ error: 'anonymization_failed' });
    }
}
