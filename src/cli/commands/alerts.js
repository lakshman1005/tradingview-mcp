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
        condition: { type: 'string', short: 'c', description: 'Condition: crossing, greater_than, less_than' },
        message: { type: 'string', short: 'm', description: 'Alert message' },
        name: { type: 'string', short: 'n', description: 'Alert name (shown in TradingView\'s Alert name field)' },
        webhook: { type: 'string', short: 'w', description: 'Webhook URL. WITHOUT THIS THE ALERT DISPATCHES NOTHING — it fires and shows a popup, but sends no request' },
        email: { type: 'boolean', short: 'e', description: 'Also send the email notification' },
      },
      handler: (opts) => core.create({
        price: Number(opts.price),
        condition: opts.condition || 'crossing',
        message: opts.message,
        name: opts.name,
        webhook: opts.webhook,
        email: opts.email,
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
