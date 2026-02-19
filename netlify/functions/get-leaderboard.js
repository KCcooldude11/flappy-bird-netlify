const { supabase } = require('./_utils/supabase');

exports.handler = async (event) => {
  try {
    const url = new URL(event.rawUrl || `http://x${event.path}`);
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 10)));

    const { data, error } = await supabase
      .from('player_best_scores')
      .select('name, best_score, first_achieved_at')
      .order('best_score', { ascending: false })
      .order('first_achieved_at', { ascending: true })
      .limit(limit);

    if (error) {
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scores: (data || []).map(r => ({ name: r.name, score: r.best_score, created_at: r.first_achieved_at }))
      })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
