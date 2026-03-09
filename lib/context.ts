import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

const TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

function contextKey(odooUserId: number): string {
  return `context:user:${odooUserId}`
}

export async function getContext(odooUserId: number): Promise<Message[]> {
  return (await redis.get<Message[]>(contextKey(odooUserId))) ?? []
}

export async function appendContext(odooUserId: number, messages: Message[]): Promise<void> {
  const existing = await getContext(odooUserId)
  const updated = [...existing, ...messages].slice(-20) // keep last 20 turns
  await redis.set(contextKey(odooUserId), updated, { ex: TTL_SECONDS })
}

export async function clearContext(odooUserId: number): Promise<void> {
  await redis.del(contextKey(odooUserId))
}
