import json
import logging
import re

import requests

from odoo import models

_logger = logging.getLogger(__name__)

ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
ANTHROPIC_VERSION = '2023-06-01'
MODEL = 'claude-sonnet-4-6'
MAX_TOKENS = 1024
SYSTEM_PROMPT = 'You are Jarvis, a helpful AI assistant embedded in Odoo Discuss.'


class DiscussChannel(models.Model):
    _inherit = 'discuss.channel'

    # ------------------------------------------------------------------
    # Slash command: /jarvis <prompt>
    # ------------------------------------------------------------------

    def _execute_command_jarvis(self, **kwargs):
        """Handle the /jarvis slash command."""
        body_html = kwargs.get('body', '')
        # Strip HTML tags and the "/jarvis" prefix to get the plain prompt
        prompt = re.sub(r'<[^>]+>', '', body_html)
        prompt = re.sub(r'^/jarvis\s*', '', prompt, flags=re.IGNORECASE).strip()

        if not prompt:
            self._send_jarvis_reply('Usage: <b>/jarvis</b> &lt;your question&gt;')
            return

        partner = self.env.user.partner_id
        context_record = self.env['jarvis.context'].sudo().get_or_create(
            user_id=self.env.uid,
            channel_id=self.id,
        )
        history = context_record.get_messages()

        try:
            reply = self._call_claude(prompt, history)
        except Exception as e:
            _logger.exception('Jarvis: Claude API call failed')
            self._send_jarvis_reply(f'Sorry, I encountered an error: {e}')
            return

        context_record.sudo().append_messages([
            {'role': 'user', 'content': prompt},
            {'role': 'assistant', 'content': reply},
        ])

        # Format reply preserving newlines as HTML
        reply_html = reply.replace('\n', '<br/>')
        self._send_jarvis_reply(reply_html)

    def _send_jarvis_reply(self, body: str) -> None:
        """Post a message from OdooBot as Jarvis."""
        odoobot_id = self.env['ir.model.data']._xmlid_to_res_id('base.partner_root')
        self.sudo().with_context(mail_create_nosubscribe=True).message_post(
            body=body,
            author_id=odoobot_id,
            message_type='comment',
            subtype_xmlid='mail.mt_comment',
        )

    def _call_claude(self, prompt: str, history: list) -> str:
        api_key = (
            self.env['ir.config_parameter'].sudo().get_param('jarvis.anthropic_api_key') or ''
        )
        if not api_key:
            raise ValueError(
                'Anthropic API key not configured. '
                'Go to Settings → Technical → System Parameters and set jarvis.anthropic_api_key.'
            )

        messages = history + [{'role': 'user', 'content': prompt}]

        response = requests.post(
            ANTHROPIC_API_URL,
            headers={
                'x-api-key': api_key,
                'anthropic-version': ANTHROPIC_VERSION,
                'content-type': 'application/json',
            },
            json={
                'model': MODEL,
                'max_tokens': MAX_TOKENS,
                'system': SYSTEM_PROMPT,
                'messages': messages,
            },
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()
        return data['content'][0]['text']
