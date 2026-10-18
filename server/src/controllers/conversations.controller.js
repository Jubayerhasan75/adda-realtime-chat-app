const conversations = (req) => req.app.locals.services.conversations;
const me = (req) => req.auth.user;

export async function list(req, res) {
  res.json({ data: await conversations(req).listConversations(me(req)) });
}

export async function open(req, res) {
  res.json({ data: await conversations(req).openDirectConversation(me(req), req.body.peerUserId) });
}

export async function get(req, res) {
  res.json({ data: await conversations(req).getConversation(me(req), req.params.conversationId) });
}

export async function listMessages(req, res) {
  res.json({
    data: await conversations(req).listMessages(
      me(req),
      req.params.conversationId,
      req.validatedQuery,
    ),
  });
}

/** REST fallback for sending while the live connection is down (same idempotency rules). */
export async function sendMessage(req, res) {
  const { message, duplicate } = await conversations(req).sendMessage(me(req), {
    conversationId: req.params.conversationId,
    ...req.body,
  });
  res.status(duplicate ? 200 : 201).json({ data: { message } });
}

export async function markRead(req, res) {
  res.json({
    data: await conversations(req).markRead(me(req), req.params.conversationId, req.body.upToSeq),
  });
}
