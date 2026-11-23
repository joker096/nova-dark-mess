/**
 * Quick reply suggestions shown above the composer.
 *
 * The messenger has no local language model, so the suggestions are
 * deterministic and derived from the last incoming message: a question gets an
 * answer, gratitude gets acknowledged, anything else gets a friendly follow-up.
 * They are never shown for an outgoing last message, so the bar disappears as
 * soon as the user replies.
 */

export const MAX_SMART_REPLIES = 3;

/** Returns 0–3 short replies for the last incoming message. */
export function suggestSmartReplies(text: string): string[] {
  const body = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'?]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!body) return [];

  if (/\b(thank|thanks|thx)\b/.test(body)) {
    return ['You’re welcome 👍', '😊', 'Anytime ❤️'];
  }

  if (/\b(bye|good night|goodnight|see you)\b/.test(body)) {
    return ['See you 👋', 'Take care ❤️', 'Bye!'];
  }

  if (/\b(when|time|tomorrow|today|tonight|later|soon)\b/.test(body)) {
    return ['On my way 🚗', 'Soon 😊', 'Give me a minute ⏳'];
  }

  if (
    /\b(ok|okay|are you|is it|can you|could you|will you|do you|ready|coming|there|what|how|why|where|which)\b/.test(
      body,
    ) ||
    body.includes('?')
  ) {
    return ['Yes', 'No', 'Sure!'];
  }

  return ['Thanks ❤️', 'Sounds good 👍', '😊'];
}
