const { supabase } = require('./_utils/supabase');

exports.handler = async (event) => {
  try {
    const url = new URL(event.rawUrl || `http://x${event.path}`);
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 10)));

    const { data, error } = await supabase
      .from('scores')
      .select('device_id, name, score, created_at')
      .order('score', { ascending: false })
      .order('created_at', { ascending: true }) // ties: first achieved wins
      .limit(limit);

    if (error) {
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scores: data || [] }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
