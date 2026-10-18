import { createBrowserRouter, Navigate } from 'react-router';
import { RedirectIfSignedIn, RequireUser, RequireVerifiedUser } from '../features/auth/guards.jsx';
import { EmailLinkPage } from '../features/auth/pages/EmailLinkPage.jsx';
import { ForgotPasswordPage } from '../features/auth/pages/ForgotPasswordPage.jsx';
import { LoginPage } from '../features/auth/pages/LoginPage.jsx';
import { RegisterPage } from '../features/auth/pages/RegisterPage.jsx';
import { ResetPasswordPage } from '../features/auth/pages/ResetPasswordPage.jsx';
import { VerifyEmailNoticePage } from '../features/auth/pages/VerifyEmailNoticePage.jsx';
import { DevMailboxPage } from '../features/dev/DevMailboxPage.jsx';
import { ChatScreen } from '../features/chat/pages/ChatScreen.jsx';
import { ChatsPage } from '../features/chat/pages/ChatsPage.jsx';
import { NoChatSelected } from '../features/chat/pages/NoChatSelected.jsx';
import { FriendsPage } from '../features/friends/FriendsPage.jsx';
import { settingsRoutes } from '../features/settings/routes.jsx';
import { SystemStatusPage } from '../features/system/SystemStatusPage.jsx';
import { AppShell } from '../layouts/AppShell.jsx';
import { NotFoundPage } from '../pages/NotFoundPage.jsx';

export const routes = [
  // Signed-in, verified users only.
  {
    element: <RequireVerifiedUser />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/chats" replace /> },
          {
            path: 'chats',
            element: <ChatsPage />,
            children: [
              { index: true, element: <NoChatSelected /> },
              { path: ':conversationId', element: <ChatScreen /> },
            ],
          },
          { path: 'friends', element: <FriendsPage /> },
          settingsRoutes,
        ],
      },
    ],
  },
  // Signed in but email not verified yet.
  {
    element: <RequireUser />,
    children: [{ path: 'verify-email-notice', element: <VerifyEmailNoticePage /> }],
  },
  // Signed-out visitors (signed-in users are sent to their chats).
  {
    element: <RedirectIfSignedIn />,
    children: [
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
    ],
  },
  // Email links work whether or not the user is signed in on this device.
  { path: 'verify-email', element: <EmailLinkPage kind="verify" /> },
  { path: 'confirm-email', element: <EmailLinkPage kind="confirm-email" /> },
  { path: 'reset-password', element: <ResetPasswordPage /> },
  // Development check of API + database connectivity (docs/STATUS.md, Phase 2).
  { path: 'status', element: <SystemStatusPage /> },
  // Development builds only: read emails that aren't delivered locally.
  ...(import.meta.env.DEV ? [{ path: 'dev/mailbox', element: <DevMailboxPage /> }] : []),
  { path: '*', element: <NotFoundPage /> },
];

export const router = createBrowserRouter(routes);
