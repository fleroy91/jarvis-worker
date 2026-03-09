import { inngest } from '../client'
import { findJarvisMessages, postReply, hasAlreadyReplied } from '@/lib/odoo'
import { askClaude } from '@/lib/claude'
import { getContext, appendContext } from '@/lib/context'

function extractPrompt(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/@jarvis/gi, '').trim()
}

export const pollOdoo = inngest.createFunction(
  { id: 'poll-odoo', name: 'Poll Odoo for @jarvis messages' },
  { cron: '* * * * *' },
  async ({ step }) => {
    const messages = await step.run('fetch-messages', () => findJarvisMessages())

    for (const msg of messages) {
      await step.run(`reply-${msg.id}`, async () => {
        const alreadyReplied = await hasAlreadyReplied(msg.res_id, msg.date)
        if (alreadyReplied) return

        const prompt = extractPrompt(msg.body)
        if (!prompt) return

        const authorId: number = msg.author_id[0]
        const history = await getContext(authorId)
        const reply = await askClaude(prompt, history)

        await appendContext(authorId, [
          { role: 'user', content: prompt },
          { role: 'assistant', content: reply },
        ])

        await postReply(msg.res_id, `🤖 <b>Jarvis:</b> ${reply}`)
      })
    }

    return { processed: messages.length }
  }
)
