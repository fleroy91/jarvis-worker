{
    'name': 'Jarvis AI Assistant',
    'version': '17.0.1.0.0',
    'category': 'Discuss',
    'summary': 'Claude-powered AI assistant via /jarvis slash command in Odoo Discuss',
    'depends': ['mail', 'discuss'],
    'data': [
        'security/ir.model.access.csv',
        'data/jarvis_command.xml',
        'data/jarvis_cron.xml',
    ],
    'license': 'LGPL-3',
    'installable': True,
    'application': False,
}
