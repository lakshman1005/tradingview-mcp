import { register } from '../router.js';
import * as core from '../../core/alerts.js';

register('alert', {
  description: 'Alert tools (list, create, delete)',
  subcommands: new Map([
    ['list', {
      description: 'List active alerts',
      handler: () => core.list(),
    }],
    ['create', {
      description: 'Create a price alert',
      options: {
        price: { type: 'string', short: 'p', description: 'Price level' },
        condition: { type: 'string', short: 'c', description: 'crossing | cross_up | cross_down | greater_than | less_than. For a stop-loss use cross_down/cross_up — plain crossing fires in BOTH directions' },
        message: { type: 'string', short: 'm', description: 'Alert message' },
        name: { type: 'string', short: 'n', description: 'Alert name (shown in TradingView\'s Alert name field)' },
        webhook: { type: 'string', short: 'w', description: 'Webhook URL. WITHOUT THIS THE ALERT DISPATCHES NOTHING — it fires and shows a popup, but sends no request' },
        email: { type: 'boolean', short: 'e', description: 'Also send the email notification' },
        resolution: { type: 'string', short: 'r', description: "Timeframe the alert evaluates on (default: the CHART's). Matters for indicator conditions" },
        frequency: { type: 'string', short: 'f', description: 'on_first_fire (default) | on_bar_close | ...' },
        expiration: { type: 'string', short: 'x', description: "Days until expiry, or 'never' for open-ended (default: never)" },
        'keep-active': { type: 'boolean', description: 'Do NOT auto-deactivate after firing (use with cross_up/cross_down so it re-arms)' },
      },
      handler: (opts) => core.create({
        price: Number(opts.price),
        condition: opts.condition || 'crossing',
        message: opts.message,
        name: opts.name,
        webhook: opts.webhook,
        email: opts.email,
        resolution: opts.resolution,
        frequency: opts.frequency,
        expiration: opts.expiration === undefined ? 'never' : opts.expiration,
        auto_deactivate: opts['keep-active'] ? false : undefined,
      }),
    }],
    ['delete', {
      description: 'Delete alerts',
      options: {
        all: { type: 'boolean', description: 'Delete all alerts' },
        id: { type: 'string', description: 'Alert id to delete (from alert list)' },
      },
      handler: (opts) => core.deleteAlerts({ delete_all: opts.all, alert_id: opts.id ? Number(opts.id) : undefined }),
    }],
  ]),
});
