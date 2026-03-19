/**
 * Signal extraction: filter session messages to only save turns
 * containing important keywords (+ context turns before them).
 */

export interface MessageTurn {
  messages: string[];
  hasSignal: boolean;
}

/**
 * Group messages into user-assistant turns.
 * A new turn starts with each user message (not prefixed with [assistant]).
 */
export function groupIntoTurns(messages: string[]): MessageTurn[] {
  const turns: MessageTurn[] = [];
  let current: string[] = [];

  for (const msg of messages) {
    const isAssistant = msg.startsWith("[assistant]");
    if (!isAssistant && current.length > 0) {
      turns.push({ messages: current, hasSignal: false });
      current = [];
    }
    current.push(msg);
  }

  if (current.length > 0) {
    turns.push({ messages: current, hasSignal: false });
  }

  return turns;
}

/**
 * Find turn indices that contain any of the signal keywords.
 */
export function findSignalTurns(turns: MessageTurn[], keywords: string[]): number[] {
  const indices: number[] = [];
  const lowerKeywords = keywords.map((k) => k.toLowerCase());

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i]!;
    const text = turn.messages.join(" ").toLowerCase();
    for (const kw of lowerKeywords) {
      if (text.includes(kw)) {
        indices.push(i);
        turn.hasSignal = true;
        break;
      }
    }
  }

  return indices;
}

/**
 * Get turns around signal indices (including N turns before for context).
 */
export function getContextualTurns(
  turns: MessageTurn[],
  signalIndices: number[],
  turnsBefore: number
): MessageTurn[] {
  if (signalIndices.length === 0) return [];

  const includeSet = new Set<number>();
  for (const idx of signalIndices) {
    const start = Math.max(0, idx - turnsBefore);
    for (let i = start; i <= idx; i++) {
      includeSet.add(i);
    }
  }

  return Array.from(includeSet)
    .sort((a, b) => a - b)
    .map((i) => turns[i]!);
}

/**
 * Apply signal extraction to a list of messages.
 * Returns filtered messages or null if no signals found.
 */
export function applySignalExtraction(
  messages: string[],
  keywords: string[],
  turnsBefore: number
): string[] | null {
  const turns = groupIntoTurns(messages);
  const signalIndices = findSignalTurns(turns, keywords);

  if (signalIndices.length === 0) return null;

  const contextualTurns = getContextualTurns(turns, signalIndices, turnsBefore);
  return contextualTurns.flatMap((t) => t.messages);
}
