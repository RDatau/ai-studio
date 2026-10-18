import type { VercelRequest, VercelResponse } from '@vercel/node';
import { testToken } from '../src/services/hfBackendService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const { token } = req.body;
  const result = await testToken(token);
  return res.json(result);
}
