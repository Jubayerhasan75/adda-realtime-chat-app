import { colorName } from './chatTheme.js';

/**
 * Names and pictures for direct chats and groups (docs/GROUPS.md), so screens don't need to
 * care which kind of chat they show.
 */

const nicknameOf = (conversation, userId) => conversation?.nicknameMap?.[userId] || null;

/** The chat's title and picture: the friend's (or their nickname here), or the group's. */
export function chatTitle(conversation) {
  if (conversation?.group) {
    return { name: conversation.group.name, avatar: conversation.group.photo, isGroup: true };
  }
  return {
    name: nicknameOf(conversation, conversation?.peer?.id) ?? conversation?.peer?.displayName ?? '',
    avatar: conversation?.peer?.avatar ?? null,
    isGroup: false,
  };
}

/**
 * userId → { displayName, avatar, username, role } for everyone currently in the chat.
 * `displayName` is their nickname in this chat when one is set (`realName` keeps the original).
 */
export function peopleOf(conversation) {
  const people = new Map();
  const add = (person) =>
    people.set(person.id, {
      ...person,
      realName: person.displayName,
      displayName: nicknameOf(conversation, person.id) ?? person.displayName,
    });
  if (conversation?.group) conversation.group.members.forEach(add);
  else if (conversation?.peer) add(conversation.peer);
  return people;
}

/** "You", the person's name (or nickname), or "Former member" for someone who left a group. */
export function nameOf(conversation, userId, currentUserId, { you = 'You', real = false } = {}) {
  if (userId === currentUserId) return you;
  const person = peopleOf(conversation).get(userId);
  if (!person) return 'Former member';
  return real ? person.realName : person.displayName;
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
    case 'theme':
      return `${actor} changed the chat color to ${colorName(system.name)}`;
    case 'nickname':
      return nicknameText(message, conversation, currentUserId, actor);
    default:
      return '';
  }
}

function nicknameText(message, conversation, currentUserId, actor) {
  const targetId = message.system.targetIds[0];
  if (message.undecryptable) return `${actor} changed a nickname`;
  const own = targetId === message.senderId;
  const mine = targetId === currentUserId;
  const subject = own
    ? `${message.senderId === currentUserId ? 'your' : 'their'} nickname`
    : mine
      ? 'your nickname'
      : `the nickname for ${nameOf(conversation, targetId, currentUserId, { real: true })}`;
  return message.nickname
    ? `${actor} set ${subject} to “${message.nickname}”`
    : `${actor} cleared ${subject}`;
}

/** "Nadia is typing…", "Nadia and Arif are typing…", or for direct chats just "typing…". */
export function typingText(conversation, userIds, currentUserId) {
  if (userIds.length === 0) return '';
  if (!conversation?.group) return 'typing…';
  const names = userIds.map((id) => nameOf(conversation, id, currentUserId).split(' ')[0]);
  return `${listNames(names)} ${names.length === 1 ? 'is' : 'are'} typing…`;
}
