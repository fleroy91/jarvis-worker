import Anthropic from '@anthropic-ai/sdk'
import type { Message } from './context'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function askClaude(prompt: string, history: Message[]): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: 'You are Jarvis, a helpful assistant embedded in Odoo Discuss.',
    messages: [
      ...history,
      { role: 'user', content: prompt },
    ],
  })
  const block = response.content[0]
  return block.type === 'text' ? block.text : ''
}
