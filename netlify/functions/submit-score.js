const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

const MAX_SCORE = 999999;
const MIN_PLAY_MS = 1500;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders() };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'POST only' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }

  const deviceId = String(body.deviceId || '').slice(0, 64).trim();
  const score = Number(body.score);
  const playMs = Number(body.playMs);

  if (!deviceId) return json(400, { error: 'deviceId required' });
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
    return json(400, { error: 'Invalid score' });
  }
  if (Number.isFinite(playMs) && playMs < MIN_PLAY_MS) {
    return json(400, { error: 'Too fast to be legit' });
  }

  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('name')
    .eq('device_id', deviceId)
    .single();

  if (pErr || !profile) return json(400, { error: 'Unknown deviceId (register first)' });

  const { data, error } = await supabase
    .from('scores')
    .insert({ device_id: deviceId, name: profile.name, score })
    .select('name, score, created_at')
    .single();

  if (error) return json(500, { error: error.message });
  return json(200, { ok: true, score: data });
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    body: JSON.stringify(body),
  };
}
