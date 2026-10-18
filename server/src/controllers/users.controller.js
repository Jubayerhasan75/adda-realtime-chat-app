import { toPrivateUser } from '../services/userService.js';
import { requestInfo } from '../utils/requestInfo.js';
import { clearSessionCookie } from '../utils/sessionCookie.js';

const users = (req) => req.app.locals.services.users;

export function getMe(req, res) {
  res.json({ data: toPrivateUser(req.auth.user) });
}

export async function updateProfile(req, res) {
  res.json({ data: await users(req).updateProfile(req.auth.user, req.body) });
}

export async function changeUsername(req, res) {
  res.json({
    data: await users(req).changeUsername(req.auth.user, req.body.username, requestInfo(req)),
  });
}

export async function deleteMe(req, res) {
  await users(req).deleteAccount(req.auth.user, req.body.password, requestInfo(req));
  clearSessionCookie(req, res);
  res.status(204).end();
}

export function getSettings(req, res) {
  res.json({ data: req.auth.user.settings.toObject() });
}

export async function updateSettings(req, res) {
  res.json({ data: await users(req).updateSettings(req.auth.user, req.body) });
}
