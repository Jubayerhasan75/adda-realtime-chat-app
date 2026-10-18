import { writeFileSync } from 'node:fs';
import { test as setup } from '@playwright/test';
import {
  SHARED_CHAT,
  SIGNED_IN_STATE,
  befriendAndOpenChat,
  createVerifiedAccount,
  sendText,
  uniqueName,
} from './helpers.js';

// One shared, verified account (with one friend and a short conversation) for the tests that
// need a signed-in browser but aren't about authentication or messaging themselves.
setup('create a signed-in browser state with a conversation', async ({ page, playwright }) => {
  const me = await createVerifiedAccount(page.request, {
    username: uniqueName('e2e_user'),
    displayName: 'E2E User',
  });
  const peerRequest = await playwright.request.newContext({ baseURL: 'http://localhost:4100' });
  const peer = await createVerifiedAccount(peerRequest, {
    username: uniqueName('arif'),
    displayName: 'Arif Hossain',
  });

  const conversationId = await befriendAndOpenChat(me, peer);
  await sendText(peer, conversationId, 'Are you coming to the match on Friday?');
  await sendText(me, conversationId, 'Wouldn’t miss it');
  await sendText(
    peer,
    conversationId,
    'Here is a long message to check wrapping on narrow phones: https://example.com/a/very/long/link/that/should/wrap/without/breaking/the/layout',
  );
  await peerRequest.dispose();

  await page.context().storageState({ path: SIGNED_IN_STATE });
  writeFileSync(SHARED_CHAT, JSON.stringify({ conversationId, peerName: 'Arif Hossain' }));
});
