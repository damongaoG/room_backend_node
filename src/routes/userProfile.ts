import { NextFunction, Router, Request, Response } from 'express';
import { UserProfileInsert, UserProfileUpdate } from '../types/userProfile.js';
import { supabase } from '../supabaseClient.js';

const router = Router();

// Optional simple API key gate
function apiKeyGuard(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) return next();
  const provided = req.header('x-internal-api-key');
  if (provided !== expected) return res.status(401).json({ error: 'Unauthorized' });
  return next();
}

router.post('/api/user-profile', apiKeyGuard, async (req: Request, res: Response) => {
  const body = req.body as Partial<UserProfileInsert>;

  if (!body || typeof body.user_id !== 'string' || typeof body.role !== 'string') {
    return res.status(400).json({ error: 'user_id and role are required as strings' });
  }

  const payload: UserProfileInsert = {
    user_id: body.user_id,
    role: body.role,
  };

  // Insert new record
  const { data, error } = await supabase.from('user_profile').insert([payload]).select();

  if (error) {
    const status = error.code === '23505' ? 409 : 400;
    return res.status(status).json({ error: error.message, details: error.details });
  }

  return res.status(200).json({ data });
});

router.put('/api/user-profile/:user_id', apiKeyGuard, async (req: Request, res: Response) => {
  const { user_id } = req.params as { user_id: string };
  const body = req.body as Partial<UserProfileUpdate>;

  if (!user_id || typeof user_id !== 'string') {
    return res.status(400).json({ error: 'user_id param is required' });
  }

  const update: UserProfileUpdate = {};
  if (typeof body.role === 'string') update.role = body.role;

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'At least one field to update is required' });
  }

  const { data, error } = await supabase
    .from('user_profile')
    .update(update as Record<string, unknown>)
    .eq('user_id', user_id)
    .select();

  if (error) {
    return res.status(400).json({ error: error.message, details: error.details });
  }

  if (!data || data.length === 0) {
    return res.status(404).json({ error: 'User profile not found' });
  }

  return res.status(200).json({ data });
});

export default router;
