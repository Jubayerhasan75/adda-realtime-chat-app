/**
 * Names and pictures for direct chats and groups (docs/GROUPS.md), so screens don't need to
 * care which kind of chat they show.
 */

/** The chat's title and picture: the friend's, or the group's. */
export function chatTitle(conversation) {
  if (conversation?.group) {
    return { name: conversation.group.name, avatar: conversation.group.photo, isGroup: true };
  }
  return {
    name: conversation?.peer?.displayName ?? '',
    avatar: conversation?.peer?.avatar ?? null,
    isGroup: false,
  };
}

/** userId → { displayName, avatar, username, role } for everyone currently in the chat. */
export function peopleOf(conversation) {
  const people = new Map();
  if (conversation?.group) {
    for (const member of conversation.group.members) people.set(member.id, member);
  } else if (conversation?.peer) {
    people.set(conversation.peer.id, conversation.peer);
  }
  return people;
}

/** "You", the person's name, or "Former member" for someone who left the group. */
export function nameOf(conversation, userId, currentUserId, { you = 'You' } = {}) {
  if (userId === currentUserId) return you;
  return peopleOf(conversation).get(userId)?.displayName ?? 'Former member';
}

/** "Arif", "Arif and Sadia", "Arif, Sadia and 2 others". */
export function listNames(names) {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
}

/** The sentence for a group notice ("Nadia added Arif"). */
export function systemText(message, conversation, currentUserId) {
  const system = message.system;
  if (!system) return '';
  const actor = nameOf(conversation, message.senderId, currentUserId);
  const targets = listNames(
    system.targetIds.map((id) => nameOf(conversation, id, currentUserId, { you: 'you' })),
  );
  switch (system.action) {
    case 'created':
      return `${actor} created the group “${system.name}”`;
    case 'added':
      return `${actor} added ${targets}`;
    case 'removed':
      return `${actor} removed ${targets}`;
    case 'left':
      return `${actor} left the group`;
    case 'renamed':
      return `${actor} named the group “${system.name}”`;
    case 'photo':
      return `${actor} changed the group photo`;
    case 'admin':
      return `${actor} made ${targets} an admin`;
    default:
      return '';
  }
}

/** "Nadia is typing…", "Nadia and Arif are typing…", or for direct chats just "typing…". */
export function typingText(conversation, userIds, currentUserId) {
  if (userIds.length === 0) return '';
  if (!conversation?.group) return 'typing…';
  const names = userIds.map((id) => nameOf(conversation, id, currentUserId).split(' ')[0]);
  return `${listNames(names)} ${names.length === 1 ? 'is' : 'are'} typing…`;
}
