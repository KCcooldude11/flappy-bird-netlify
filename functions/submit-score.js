// netlify/functions/submit-score.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

// Simple anti-spam knobs
const MAX_NAME_LEN = 16;
const MAX_SCORE = 999999;         // sanity cap
const MIN_PLAY_MS = 1500;         // optional: client sends playtime

export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { name, score, playMs } = req.body || {};
    const cleanName = String(name ?? '').trim().slice(0, MAX_NAME_LEN);
    const cleanScore = Number(score);

    if (!cleanName) return res.status(400).json({ error: 'Name required' });
    if (!Number.isFinite(cleanScore) || cleanScore < 0 || cleanScore > MAX_SCORE) {
      return res.status(400).json({ error: 'Invalid score' });
    }
    if (Number.isFinite(playMs) && playMs < MIN_PLAY_MS) {
      // quick reject for obvious scripts
      return res.status(400).json({ error: 'Too fast to be legit' });
    }

    const { data, error } = await supabase
      .from('scores')
      .insert({ name: cleanName, score: cleanScore })
      .select('name, score, created_at')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, score: data });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
};
