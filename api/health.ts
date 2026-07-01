import { evaluateProductionReadiness } from '../scripts/lib/production-readiness-runtime.mjs';

type ApiRequest = {
  method?: string;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  end: () => void;
  setHeader: (name: string, value: string) => void;
};

export default function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const readiness = evaluateProductionReadiness(process.env);
  const statusCode = readiness.ok ? 200 : 503;

  if (req.method === 'HEAD') {
    return res.status(statusCode).end();
  }

  return res.status(statusCode).json(readiness);
}
