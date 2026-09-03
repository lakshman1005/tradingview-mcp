import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/alerts.js';

export function registerAlertTools(server) {
  server.tool('alert_create', 'Create a price alert on the current chart symbol via TradingView\'s alert API', {
    condition: z.string().describe('Alert condition: "crossing", "greater_than", or "less_than"'),
    price: z.coerce.number().describe('Price level for the alert'),
    message: z.string().optional().describe('Alert message'),
    name: z.string().optional().describe('Alert name (shown in TradingView\'s Alert name field, and in the alert list UI)'),
    webhook: z.string().optional().describe('Webhook URL to POST the message to when the alert fires. OMIT THIS AND THE ALERT DISPATCHES NOTHING — it will fire, update last_fire_time and show a popup, but no request is ever sent.'),
    email: z.boolean().optional().describe('Also send the email notification (default false)'),
  }, async ({ condition, price, message, name, webhook, email }) => {
    try { return jsonResult(await core.create({ condition, price, message, name, webhook, email })); }
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
