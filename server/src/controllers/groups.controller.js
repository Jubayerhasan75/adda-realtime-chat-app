const groups = (req) => req.app.locals.services.groups;
const me = (req) => req.auth.user;

export async function create(req, res) {
  res.status(201).json({ data: await groups(req).create(me(req), req.body) });
}

export async function addMembers(req, res) {
  res.json({ data: await groups(req).addMembers(me(req), req.params.groupId, req.body) });
}

export async function removeMember(req, res) {
  const data = await groups(req).removeMember(me(req), req.params.groupId, req.params.userId);
  if (data) res.json({ data });
  else res.status(204).end();
}

export async function setRole(req, res) {
  res.json({
    data: await groups(req).setRole(me(req), req.params.groupId, req.params.userId, req.body.role),
  });
}

export async function leave(req, res) {
  await groups(req).leave(me(req), req.params.groupId);
  res.status(204).end();
}

export async function update(req, res) {
  res.json({ data: await groups(req).update(me(req), req.params.groupId, req.body) });
}

export async function myKeys(req, res) {
  res.json({ data: await groups(req).myKeys(me(req), req.params.groupId) });
}

export async function requestKeys(req, res) {
  await groups(req).requestKeys(me(req), req.params.groupId);
  res.status(204).end();
}

export async function shareKeys(req, res) {
  await groups(req).shareKeys(me(req), req.params.groupId, req.body);
  res.status(204).end();
}

export async function rotateKey(req, res) {
  res.json({ data: await groups(req).rotateKey(me(req), req.params.groupId, req.body) });
}
