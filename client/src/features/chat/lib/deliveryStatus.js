/**
 * Tick state of one of my sent messages from the other person's watermarks
 * (docs/ARCHITECTURE.md §6). `readUpToSeq` is absent when either person turned read receipts
 * off, in which case a message never shows as "seen".
 * @param {{ seq: number }} message
 * @param {{ deliveredUpToSeq: number, readUpToSeq?: number }} peerState
 * @returns {'sent' | 'delivered' | 'seen'}
 */
export function deliveryStatus(message, peerState) {
  if (peerState?.readUpToSeq !== undefined && message.seq <= peerState.readUpToSeq) return 'seen';
  if (peerState && message.seq <= peerState.deliveredUpToSeq) return 'delivered';
  return 'sent';
}
