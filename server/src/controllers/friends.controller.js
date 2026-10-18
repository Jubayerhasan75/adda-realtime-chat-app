import { ERROR_CODES } from '@chat/shared';
import { listNotifications, markNotificationsRead } from '../services/notificationService.js';
import { AppError } from '../utils/AppError.js';

const friends = (req) => req.app.locals.services.friends;
const directory = (req) => req.app.locals.services.directory;
const me = (req) => req.auth.user;

export async function search(req, res) {
  res.json({ data: await directory(req).search(me(req), req.validatedQuery.q) });
}

export async function getProfile(req, res) {
  res.json({
    data: await directory(req).getProfile(me(req), String(req.params.username).toLowerCase()),
  });
}

export async function report(req, res) {
  await directory(req).report(me(req), req.params.userId, req.body);
  res.status(201).json({ data: { message: 'Thanks. We received your report.' } });
}

export async function listFriends(req, res) {
  res.json({ data: await friends(req).listFriends(me(req)) });
}

export async function listRequests(req, res) {
  const { direction } = req.query;
  if (direction !== 'incoming' && direction !== 'outgoing') {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_FAILED,
      'direction must be incoming or outgoing',
    );
  }
  res.json({ data: await friends(req).listRequests(me(req), direction) });
}

export async function sendRequest(req, res) {
  res.status(201).json({ data: await friends(req).sendRequest(me(req), req.body.userId) });
}

export async function acceptRequest(req, res) {
  await friends(req).acceptRequest(me(req), req.params.requestId);
  res.status(204).end();
}

export async function declineRequest(req, res) {
  await friends(req).declineRequest(me(req), req.params.requestId);
  res.status(204).end();
}

export async function cancelRequest(req, res) {
  await friends(req).cancelRequest(me(req), req.params.requestId);
  res.status(204).end();
}

export async function removeFriend(req, res) {
  await friends(req).removeFriend(me(req), req.params.userId);
  res.status(204).end();
}

export async function listBlocked(req, res) {
  res.json({ data: await friends(req).listBlocked(me(req)) });
}

export async function block(req, res) {
  await friends(req).block(me(req), req.body.userId);
  res.status(204).end();
}

export async function unblock(req, res) {
  await friends(req).unblock(me(req), req.params.userId);
  res.status(204).end();
}

export async function getNotifications(req, res) {
  res.json({ data: await listNotifications(me(req)._id) });
}

export async function readNotifications(req, res) {
  await markNotificationsRead(me(req)._id, req.body);
  res.status(204).end();
}
