const { supabase } = require('./_utils/supabase');

exports.handler = async (event) => {
  try {
    const url = new URL(event.rawUrl || `http://x${event.path}`);
    const deviceId = url.searchParams.get('deviceId');

    if (!deviceId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'deviceId is required' }) };
    }

    // 1) Get this player’s best
    const { data: me, error: meErr } = await supabase
      .from('player_best_scores')
      .select('name, best_score, first_achieved_at')
      .eq('device_id', deviceId)
      .single();

    if (meErr || !me) {
      return { statusCode: 200, body: JSON.stringify({ hasScore: false }) };
    }

    // 2) Count how many players are ahead of me:
    // - higher best_score
    // - or same best_score but achieved earlier (tie-break)
    const { count: higherCount, error: higherErr } = await supabase
      .from('player_best_scores')
      .select('*', { count: 'exact', head: true })
      .gt('best_score', me.best_score);

    if (higherErr) {
      return { statusCode: 500, body: JSON.stringify({ error: higherErr.message }) };
    }

    const { count: tieEarlierCount, error: tieErr } = await supabase
      .from('player_best_scores')
      .select('*', { count: 'exact', head: true })
      .eq('best_score', me.best_score)
      .lt('first_achieved_at', me.first_achieved_at);

    if (tieErr) {
      return { statusCode: 500, body: JSON.stringify({ error: tieErr.message }) };
    }

    const { count: totalPlayers, error: totalErr } = await supabase
      .from('player_best_scores')
      .select('*', { count: 'exact', head: true });

    if (totalErr) {
      return { statusCode: 500, body: JSON.stringify({ error: totalErr.message }) };
    }

    const rank = (higherCount || 0) + (tieEarlierCount || 0) + 1;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hasScore: true,
        rank,
        totalPlayers: totalPlayers || 0,
        name: me.name,
        bestScore: me.best_score,
      }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
