import { createBrowserRouter, Navigate } from 'react-router';
import { RedirectIfSignedIn, RequireUser, RequireVerifiedUser } from '../features/auth/guards.jsx';
import { ChatScreen } from '../features/chat/pages/ChatScreen.jsx';
import { ChatsPage } from '../features/chat/pages/ChatsPage.jsx';
import { NoChatSelected } from '../features/chat/pages/NoChatSelected.jsx';
import { AppShell } from '../layouts/AppShell.jsx';
import { NotFoundPage } from '../pages/NotFoundPage.jsx';

/**
 * The chat list and chats load with the app; every other screen loads the first time it is
 * opened, so the app starts faster on phones.
 * @param {() => Promise<object>} load the screen's module
 * @param {string} name the component exported by it
 */
const screen = (load, name, props) => ({
  lazy: async () => {
    const Component = (await load())[name];
    return { Component: props ? () => <Component {...props} /> : Component };
  },
});

const loadSettings = () => import('../features/settings/routes.jsx');
const SETTINGS_PATHS = [
  'profile',
  'profile/name',
  'profile/username',
  'profile/bio',
  'appearance',
  'notifications',
  'privacy',
  'email',
  'password',
  'devices',
  'install',
  'about',
  'delete-account',
];
const settingsPage = (path) => ({
  lazy: async () => ({ Component: (await loadSettings()).SETTINGS_PAGES[path] }),
});

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
          {
            path: 'new-group',
            ...screen(
              () => import('../features/chat/pages/CreateGroupPage.jsx'),
              'CreateGroupPage',
            ),
          },
          {
            path: 'friends',
            ...screen(() => import('../features/friends/FriendsPage.jsx'), 'FriendsPage'),
          },
          {
            path: 'notifications',
            ...screen(
              () => import('../features/notifications/NotificationsPage.jsx'),
              'NotificationsPage',
            ),
          },
          {
            path: 'settings',
            children: [
              { index: true, ...settingsPage('') },
              ...SETTINGS_PATHS.map((path) => ({ path, ...settingsPage(path) })),
            ],
          },
        ],
      },
    ],
  },
  // Signed in but email not verified yet.
  {
    element: <RequireUser />,
    children: [
      {
        path: 'verify-email-notice',
        ...screen(
          () => import('../features/auth/pages/VerifyEmailNoticePage.jsx'),
          'VerifyEmailNoticePage',
        ),
      },
    ],
  },
  // Signed-out visitors (signed-in users are sent to their chats).
  {
    element: <RedirectIfSignedIn />,
    children: [
      {
        path: 'login',
        ...screen(() => import('../features/auth/pages/LoginPage.jsx'), 'LoginPage'),
      },
      {
        path: 'register',
        ...screen(() => import('../features/auth/pages/RegisterPage.jsx'), 'RegisterPage'),
      },
      {
        path: 'forgot-password',
        ...screen(
          () => import('../features/auth/pages/ForgotPasswordPage.jsx'),
          'ForgotPasswordPage',
        ),
      },
    ],
  },
  // Email links work whether or not the user is signed in on this device.
  {
    path: 'verify-email',
    ...screen(() => import('../features/auth/pages/EmailLinkPage.jsx'), 'EmailLinkPage', {
      kind: 'verify',
    }),
  },
  {
    path: 'confirm-email',
    ...screen(() => import('../features/auth/pages/EmailLinkPage.jsx'), 'EmailLinkPage', {
      kind: 'confirm-email',
    }),
  },
  {
    path: 'reset-password',
    ...screen(() => import('../features/auth/pages/ResetPasswordPage.jsx'), 'ResetPasswordPage'),
  },
  // Development builds only: API + database check, and emails that aren't delivered locally.
  ...(import.meta.env.DEV
    ? [
        {
          path: 'status',
          ...screen(() => import('../features/system/SystemStatusPage.jsx'), 'SystemStatusPage'),
        },
        {
          path: 'dev/mailbox',
          ...screen(() => import('../features/dev/DevMailboxPage.jsx'), 'DevMailboxPage'),
        },
      ]
    : []),
  { path: '*', element: <NotFoundPage /> },
];

export const router = createBrowserRouter(routes);
