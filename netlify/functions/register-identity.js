const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

const MAX_NAME_LEN = 16;

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
  const name = String(body.name || '').slice(0, MAX_NAME_LEN).trim();

  if (!deviceId) return json(400, { error: 'deviceId required' });
  if (!name) return json(400, { error: 'name required' });

  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      { device_id: deviceId, name, updated_at: new Date().toISOString() },
      { onConflict: 'device_id' }
    )
    .select('device_id, name')
    .single();

  if (error) return json(500, { error: error.message });
  return json(200, { ok: true, profile: data });
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
