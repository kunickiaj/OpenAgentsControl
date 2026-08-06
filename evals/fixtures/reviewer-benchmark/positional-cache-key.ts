type Message = { id?: string; role: 'user' | 'assistant'; text: string };

const injectedBySession = new Map<string, Map<string, string>>();

function messageKey(message: Message, index: number): string {
  return message.id || `message-${index}`;
}

export function appendInjectedContext(
  sessionId: string | undefined,
  messages: Message[],
  newestContext: string
): Message[] {
  const sessionKey = sessionId || 'unknown';
  const cache = injectedBySession.get(sessionKey) || new Map<string, string>();
  injectedBySession.set(sessionKey, cache);

  return messages.map((message, index) => {
    if (message.role !== 'user') return message;
    const key = messageKey(message, index);
    const injected = index === messages.length - 1
      ? newestContext
      : cache.get(key);
    if (injected) cache.set(key, injected);
    return injected ? { ...message, text: `${message.text}\n${injected}` } : message;
  });
}
