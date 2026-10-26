import type { Chat } from './chat.ts'

/**
 * A chat with `model` on whichever Text backend Settings send it to at each call (ADR 0022), so a
 * change in Settings reaches running Sessions. `chatOn` gives the chat on that backend; it should
 * give the same one for the same backend, which keeps what it has learnt (that the model can't
 * think).
 */
export function routedChat(model: string, thinking: boolean, chatOn: () => Promise<Chat>): Chat {
  let last: Chat | undefined
  return {
    model,
    get thinks() {
      return last?.thinks ?? thinking
    },
    async stream(call) {
      last = await chatOn()
      return last.stream(call)
    },
  }
}
