import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/alerts.js';

export function registerAlertTools(server) {
  server.tool('alert_create', 'Create a price alert on the current chart symbol via TradingView\'s alert API', {
    condition: z.string().describe('"crossing", "cross_up", "cross_down", "greater_than" or "less_than". For a stop-loss use cross_down/cross_up — plain "crossing" fires in BOTH directions.'),
    price: z.coerce.number().describe('Price level for the alert'),
    message: z.string().optional().describe('Alert message'),
    name: z.string().optional().describe('Alert name (shown in TradingView\'s Alert name field, and in the alert list UI)'),
    webhook: z.string().optional().describe('Webhook URL to POST the message to when the alert fires. OMIT THIS AND THE ALERT DISPATCHES NOTHING — it will fire, update last_fire_time and show a popup, but no request is ever sent.'),
    email: z.boolean().optional().describe('Also send the email notification (default false)'),
    resolution: z.string().optional().describe("Timeframe the alert evaluates on (default: the CHART's own). Changes the MEANING of indicator conditions — VWAP on 1m is not VWAP on 5m."),
    frequency: z.string().optional().describe('on_first_fire (default) | on_bar_close | ...'),
    expiration: z.union([z.string(), z.number()]).optional().describe("Days until expiry, or 'never' for open-ended (default: never)"),
    auto_deactivate: z.boolean().optional().describe('Switch the alert off after it fires (default true). Set false with cross_up/cross_down so it re-arms on the next genuine crossing.'),
  }, async ({ condition, price, message, name, webhook, email, resolution, frequency, expiration, auto_deactivate }) => {
    try { return jsonResult(await core.create({ condition, price, message, name, webhook, email, resolution, frequency, expiration, auto_deactivate })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('alert_list', 'List active alerts', {}, async () => {
    try { return jsonResult(await core.list()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('alert_delete', 'Delete a specific alert by id, or all active alerts', {
    alert_id: z.coerce.number().optional().describe('Alert id to delete (from alert_list)'),
    delete_all: z.coerce.boolean().optional().describe('Delete all active alerts'),
  }, async ({ alert_id, delete_all }) => {
    try { return jsonResult(await core.deleteAlerts({ alert_id, delete_all })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}
