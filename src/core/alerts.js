/**
 * Core alert logic.
 *
 * Alerts are created / listed / deleted through TradingView's pricealerts REST API
 * (https://pricealerts.tradingview.com) using the desktop app's authenticated session.
 * Requests are sent as text/plain so the browser does not issue a CORS preflight that
 * the endpoint rejects. The create/delete bodies must be wrapped in a `payload` object.
 */
import { evaluate, evaluateAsync, safeString, requireFinite } from '../connection.js';

// Map the tool's friendly condition names to TradingView's alert condition types.
const CONDITION_TYPE_MAP = {
  crossing: 'cross', cross: 'cross',
  greater_than: 'greater', greater: 'greater', above: 'greater', '>': 'greater',
  less_than: 'less', less: 'less', below: 'less', '<': 'less',
  // DIRECTIONAL crossing (2026-09-03). TradingView supports these; only the
  // undirected 'cross' was exposed.
  //
  // ⚠️ For a stop-loss, plain 'cross' is WRONG and dangerous: it fires when price
  // crosses the level in EITHER direction, so a rally back up through a sell level
  // dispatches a sell. Use cross_down for a level below price, cross_up for one above.
  //
  // Why cross_* at all, vs less/greater: 'less' is a STATE (true continuously while
  // price is below), so it must be paired with fire-once + auto-deactivate or it
  // alerts forever. 'cross_down' is an EVENT, so the alert can stay armed and
  // re-fires only after price retraces above and genuinely crosses down again —
  // self-re-arming, with no re-creation job.
  //
  // ⚠️ The trade-off: an EVENT needs a crossing. If price is ALREADY below the level
  // when the alert is created, cross_down will not fire until price goes back above
  // and returns. Set these while price is on the correct side.
  cross_down: 'cross_down', crossing_down: 'cross_down', down: 'cross_down',
  cross_up: 'cross_up', crossing_up: 'cross_up', up: 'cross_up',
};

export async function create({ condition, price, message, name, webhook, email,
                               resolution, frequency, expiration, auto_deactivate }) {
  const p = requireFinite(price, 'price');
  const condType = CONDITION_TYPE_MAP[String(condition || 'crossing').trim().toLowerCase()] || 'cross';
  // ⚠️ web_hook and email used to be HARDCODED to null/false here (fixed 2026-09-03).
  // An alert created that way fires, updates last_fire_time and shows a popup — and
  // dispatches NOTHING. That is invisible unless you diff TradingView's alert log
  // against your own server's access log: the Log panel entry simply has no delivery
  // status line under it, neither success nor failure.
  //
  // It cost a missed entry signal and, worse, left 17 script-created STOP-LOSS alerts
  // silently unable to fire. Callers that put a webhook JSON payload in `message`
  // (e.g. zerodha-api/tv_price_alert.py) were the ones most affected: the message was
  // perfect, and there was no channel to send it on.
  const hook = (typeof webhook === 'string' && webhook.trim()) ? webhook.trim() : null;
  const wantEmail = email === true;

  // ⚠️ resolution was HARDCODED to '1' (fixed 2026-09-03). An alert stores its OWN
  // resolution — the chart you happen to be looking at is irrelevant once it is saved.
  // For a bare price cross that mostly changes when it is evaluated, but for an
  // INDICATOR condition it changes the MEANING: VWAP or RSI on 1-minute is a different
  // number from the same condition on 5-minute. Default is now the CHART's resolution,
  // read live below, so an alert matches the timeframe you built it on.
  const wantRes = (resolution == null || resolution === '') ? null : String(resolution);

  // 'never' / null => open-ended. TradingView represents that as expiration: null with
  // expiration_policy {time: null, policy: 'never'} — verified against alerts created
  // in the UI. The old hardcoded 30 days is a silent failure with a timer on it: a
  // stop-loss that quietly stops existing.
  const expNever = expiration == null || expiration === 'never' || expiration === 0;
  const expDays = expNever ? null : Number(expiration);
  if (!expNever && (!Number.isFinite(expDays) || expDays <= 0)) {
    throw new Error(`expiration must be a positive number of days, or 'never' (got ${expiration})`);
  }
  // Default true only to preserve historic behaviour for fire-once conditions; a
  // self-re-arming cross_* alert wants false, and the caller says so explicitly.
  const autoDeact = auto_deactivate === undefined ? true : auto_deactivate === true;
  const freq = (typeof frequency === 'string' && frequency.trim())
    ? frequency.trim() : 'on_first_fire';

  return evaluate(`
    (function() {
      try {
        var ms = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries();
        var sym = (ms.proSymbol && ms.proSymbol()) || (ms.symbol && ms.symbol());
        if (!sym) return { success: false, error: 'Could not read current chart symbol from TradingView' };
        var price = ${JSON.stringify(p)};
        var condType = ${safeString(condType)};
        var msg = ${safeString(message || '')};
        var nm = ${safeString(name || '')};
        var hook = ${hook === null ? 'null' : safeString(hook)};
        var wantEmail = ${wantEmail ? 'true' : 'false'};
        var wantRes = ${wantRes === null ? 'null' : safeString(wantRes)};
        var freq = ${safeString(freq)};
        var autoDeact = ${autoDeact ? 'true' : 'false'};
        var expDays = ${expDays === null ? 'null' : JSON.stringify(expDays)};
        // Default to the CHART's own resolution rather than a hardcoded '1', so an
        // alert means on the server what it meant on screen.
        var res = wantRes;
        if (!res) {
          try { res = String(window.TradingViewApi._activeChartWidgetWV.value().resolution()); }
          catch (e) { res = '1'; }
        }
        if (!msg) {
          var verb = condType === 'greater' ? 'above'
            : (condType === 'less' ? 'below'
            : (condType === 'cross_down' ? 'crossing down'
            : (condType === 'cross_up' ? 'crossing up' : 'crossing')));
          msg = sym.split(':').pop() + ' ' + verb + ' ' + price;
        }
        var cond = { type: condType, frequency: freq, series: [{ type: 'barset' }, { type: 'value', value: price }], resolution: res };
        var payload = {
          conditions: [cond],
          symbol: '={"symbol":"' + sym + '"}',
          resolution: res,
          message: msg,
          sound_file: 'alert/fired', sound_duration: 0,
          popup: true, auto_deactivate: autoDeact,
          email: wantEmail, sms_over_email: false, mobile_push: true,
          web_hook: hook, name: nm || null,
          active: true, ignore_warnings: true
        };
        if (expDays === null) {
          payload.expiration = null;
          payload.expiration_policy = { time: null, policy: 'never' };
        } else {
          payload.expiration = new Date(Date.now() + expDays * 24 * 3600 * 1000).toISOString();
        }
        var x = new XMLHttpRequest();
        x.open('POST', 'https://pricealerts.tradingview.com/create_alert', false);
        x.withCredentials = true;
        x.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
        x.send(JSON.stringify({ payload: payload }));
        var data = {};
        try { data = JSON.parse(x.responseText); } catch (e) {}
        if (data.s === 'ok') {
          return { success: true, source: 'internal_api', symbol: sym, price: price, condition: condType, message: msg, name: nm || null, web_hook: hook, email: wantEmail, resolution: res, frequency: freq, auto_deactivate: autoDeact, expiration: payload.expiration, alert_id: (data.r && data.r.alert_id) || null };
        }
        return { success: false, source: 'internal_api', error: (data.err && data.err.code) || data.errmsg || ('HTTP ' + x.status), response: (x.responseText || '').slice(0, 200) };
      } catch (e) {
        return { success: false, source: 'internal_api', error: e.message };
      }
    })()
  `);
}

export async function list() {
  // Use pricealerts REST API — returns structured data with alert_id, symbol, price, conditions
  const result = await evaluateAsync(`
    fetch('https://pricealerts.tradingview.com/list_alerts', { credentials: 'include' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.s !== 'ok' || !Array.isArray(data.r)) return { alerts: [], error: data.errmsg || 'Unexpected response' };
        return {
          alerts: data.r.map(function(a) {
            var sym = '';
            try { sym = JSON.parse(a.symbol.replace(/^=/, '')).symbol || a.symbol; } catch(e) { sym = a.symbol; }
            return {
              alert_id: a.alert_id,
              symbol: sym,
              type: a.type,
              name: a.name,
              message: a.message,
              active: a.active,
              condition: a.condition,
              resolution: a.resolution,
              created: a.create_time,
              last_fired: a.last_fire_time,
              expiration: a.expiration,
              // Notification channels — surfaced 2026-09-03. These were dropped here,
              // which is what made a silently-unarmed alert impossible to audit: the
              // API returns them, the mapping just threw them away. An alert with
              // web_hook null and email false fires and dispatches NOTHING.
              web_hook: a.web_hook || null,
              email: !!a.email,
              popup: !!a.popup,
              mobile_push: !!a.mobile_push,
              // Why TradingView last refused/stopped it, when it says anything.
              last_error: a.last_error || null,
              last_stop_reason: a.last_stop_reason || null,
            };
          })
        };
      })
      .catch(function(e) { return { alerts: [], error: e.message }; })
  `);
  return { success: true, alert_count: result?.alerts?.length || 0, source: 'internal_api', alerts: result?.alerts || [], error: result?.error };
}

export async function deleteAlerts({ delete_all, alert_ids, alert_id } = {}) {
  // Resolve the set of alert ids to delete.
  let ids = [];
  if (Array.isArray(alert_ids)) ids = ids.concat(alert_ids);
  if (alert_id != null) ids.push(alert_id);
  if (delete_all) {
    const listed = await list();
    ids = (listed.alerts || []).map((a) => a.alert_id);
  }
  ids = ids.filter((x) => x != null);
  if (!ids.length) {
    return { success: false, source: 'internal_api', error: delete_all ? 'No alerts to delete.' : 'Provide delete_all: true or an alert_id to delete.' };
  }

  const result = await evaluate(`
    (function() {
      try {
        var x = new XMLHttpRequest();
        x.open('POST', 'https://pricealerts.tradingview.com/delete_alerts', false);
        x.withCredentials = true;
        x.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
        x.send(JSON.stringify({ payload: { alert_ids: ${JSON.stringify(ids)} } }));
        var data = {}; try { data = JSON.parse(x.responseText); } catch (e) {}
        return { ok: data.s === 'ok', status: x.status, response: (x.responseText || '').slice(0, 200) };
      } catch (e) { return { ok: false, error: e.message }; }
    })()
  `);
  if (result && result.ok) {
    return { success: true, source: 'internal_api', deleted_count: ids.length, alert_ids: ids };
  }
  return { success: false, source: 'internal_api', alert_ids: ids, error: (result && (result.error || result.response)) || 'delete failed' };
}
