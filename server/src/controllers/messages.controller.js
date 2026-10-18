const messages = (req) => req.app.locals.services.messages;
const conversations = (req) => req.app.locals.services.conversations;
const me = (req) => req.auth.user;

export async function edit(req, res) {
  res.json({ data: await messages(req).edit(me(req), req.params.messageId, req.body.envelope) });
}

export async function remove(req, res) {
  const message = await messages(req).remove(
    me(req),
    req.params.messageId,
    req.validatedQuery.scope,
  );
  if (message) res.json({ data: message });
  else res.status(204).end();
}

export async function react(req, res) {
  res.json({ data: await messages(req).react(me(req), req.params.messageId, req.body.emoji) });
}

export async function unreact(req, res) {
  res.json({ data: await messages(req).unreact(me(req), req.params.messageId) });
}

export async function pin(req, res) {
  res.json({ data: await messages(req).pin(me(req), req.params.messageId) });
}

export async function unpin(req, res) {
  res.json({ data: await messages(req).unpin(me(req), req.params.messageId) });
}

export async function listPins(req, res) {
  res.json({ data: await messages(req).listPins(me(req), req.params.conversationId) });
}

export async function clearChat(req, res) {
  res.json({ data: await conversations(req).clearChat(me(req), req.params.conversationId) });
}

export async function deleteChat(req, res) {
  await conversations(req).deleteChat(me(req), req.params.conversationId);
  res.status(204).end();
}

export async function updateSettings(req, res) {
  res.json({
    data: await conversations(req).updateSettings(me(req), req.params.conversationId, req.body),
  });
}
