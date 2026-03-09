const BASE = process.env.ODOO_URL!

export interface OdooMessage {
  id: number
  body: string
  res_id: number
  date: string
  author_id: [number, string]
  res_model: string
}

// Authenticate with email + API key to get a session cookie.
// Called once per Inngest invocation (serverless = fresh process each time).
async function authenticate(): Promise<string> {
  const res = await fetch(`${BASE}/web/session/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      id: 1,
      params: {
        db: false, // Odoo Online auto-detects the DB from the hostname
        login: process.env.ODOO_EMAIL,
        password: process.env.ODOO_API_KEY,
      },
    }),
  })
  const setCookie = res.headers.get('set-cookie') ?? ''
  const sessionId = setCookie.match(/session_id=([^;]+)/)?.[1]
  if (!sessionId) {
    const body = (await res.json()) as unknown
    throw new Error(`Odoo auth failed: ${JSON.stringify(body)}`)
  }
  return sessionId
}

async function rpc(
  sessionId: string,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {}
): Promise<unknown> {
  const res = await fetch(`${BASE}/web/dataset/call_kw`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `session_id=${sessionId}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      id: 1,
      params: { model, method, args, kwargs },
    }),
  })
  const json = (await res.json()) as { result?: unknown; error?: unknown }
  if (json.error) throw new Error(JSON.stringify(json.error))
  return json.result
}

export async function findJarvisMessages(): Promise<OdooMessage[]> {
  const sessionId = await authenticate()
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19)

  return rpc(
    sessionId,
    'mail.message',
    'search_read',
    [
      [
        ['body', 'ilike', '@jarvis'],
        ['date', '>=', twoMinutesAgo],
        ['author_id', '!=', parseInt(process.env.ODOO_BOT_USER_ID!)],
        ['message_type', 'in', ['comment', 'email']],
      ],
    ],
    { fields: ['id', 'body', 'res_id', 'res_model', 'date', 'author_id'], limit: 10 }
  ) as Promise<OdooMessage[]>
}

export async function hasAlreadyReplied(
  channelId: number,
  afterDate: string
): Promise<boolean> {
  const sessionId = await authenticate()
  const results = (await rpc(
    sessionId,
    'mail.message',
    'search_read',
    [
      [
        ['res_id', '=', channelId],
        ['author_id', '=', parseInt(process.env.ODOO_BOT_USER_ID!)],
        ['date', '>=', afterDate],
      ],
    ],
    { fields: ['id'], limit: 1 }
  )) as unknown[]
  return results.length > 0
}

export async function postReply(channelId: number, body: string): Promise<void> {
  const sessionId = await authenticate()
  await rpc(sessionId, 'mail.channel', 'message_post', [channelId], {
    body,
    message_type: 'comment',
    subtype_xmlid: 'mail.mt_comment',
  })
}
