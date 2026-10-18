/**
 * Tick state of one of my sent messages from the other members' watermarks
 * (docs/ARCHITECTURE.md §6, docs/GROUPS.md §4). Takes the other person's state, or a list of
 * every other member's state in a group: "delivered" once everyone's device has it, "seen" once
 * everyone read it. `readUpToSeq` is absent for anyone who doesn't share read receipts with me,
 * in which case the message never shows as "seen".
 * @param {{ seq: number }} message
 * @param {{ deliveredUpToSeq: number, readUpToSeq?: number } | Array<object>} states
 * @returns {'sent' | 'delivered' | 'seen'}
 */
export function deliveryStatus(message, states) {
  const others = (Array.isArray(states) ? states : [states]).filter(Boolean);
  if (others.length === 0) return 'sent';
  if (others.every((s) => s.readUpToSeq !== undefined && message.seq <= s.readUpToSeq)) {
    return 'seen';
  }
  if (others.every((s) => message.seq <= s.deliveredUpToSeq)) return 'delivered';
  return 'sent';
}
