import json
from datetime import timedelta

from odoo import api, fields, models


class JarvisContext(models.Model):
    _name = 'jarvis.context'
    _description = 'Jarvis Conversation Context'
    _rec_name = 'user_id'

    user_id = fields.Many2one('res.users', required=True, ondelete='cascade', index=True)
    channel_id = fields.Many2one('discuss.channel', required=True, ondelete='cascade', index=True)
    messages_json = fields.Text(default='[]')
    last_activity = fields.Datetime(default=fields.Datetime.now)

    _sql_constraints = [
        ('user_channel_uniq', 'UNIQUE(user_id, channel_id)',
         'A context record must be unique per user/channel pair.'),
    ]

    def get_messages(self) -> list:
        self.ensure_one()
        return json.loads(self.messages_json or '[]')

    def append_messages(self, new_messages: list) -> None:
        """Append new messages and keep only the last 20 turns. Resets 7-day TTL."""
        self.ensure_one()
        updated = (self.get_messages() + new_messages)[-20:]
        self.write({
            'messages_json': json.dumps(updated),
            'last_activity': fields.Datetime.now(),
        })

    @api.model
    def get_or_create(self, user_id: int, channel_id: int) -> 'JarvisContext':
        record = self.search([('user_id', '=', user_id), ('channel_id', '=', channel_id)], limit=1)
        if not record:
            record = self.create({'user_id': user_id, 'channel_id': channel_id})
        return record

    @api.model
    def cleanup_expired(self) -> None:
        """Called by cron — remove contexts inactive for more than 7 days."""
        cutoff = fields.Datetime.now() - timedelta(days=7)
        expired = self.search([('last_activity', '<', cutoff)])
        expired.unlink()
