import { BioForm, NameForm, UsernameForm } from './AccountForms.jsx';
import {
  AboutPage,
  AppearancePage,
  DeleteAccountPage,
  DevicesPage,
  EmailPage,
  InstallPage,
  NotificationsPage,
  PasswordPage,
  PrivacyPage,
  ProfileFieldPage,
  ProfilePage,
  SettingsPage,
} from './SettingsPage.jsx';

/** Settings and its sub-pages (each opens like a new screen; back returns to the list). */
export const settingsRoutes = {
  path: 'settings',
  children: [
    { index: true, element: <SettingsPage /> },
    { path: 'profile', element: <ProfilePage /> },
    { path: 'profile/name', element: <ProfileFieldPage title="Name" Form={NameForm} /> },
    {
      path: 'profile/username',
      element: <ProfileFieldPage title="Username" Form={UsernameForm} />,
    },
    { path: 'profile/bio', element: <ProfileFieldPage title="Bio" Form={BioForm} /> },
    { path: 'appearance', element: <AppearancePage /> },
    { path: 'notifications', element: <NotificationsPage /> },
    { path: 'privacy', element: <PrivacyPage /> },
    { path: 'email', element: <EmailPage /> },
    { path: 'password', element: <PasswordPage /> },
    { path: 'devices', element: <DevicesPage /> },
    { path: 'install', element: <InstallPage /> },
    { path: 'about', element: <AboutPage /> },
    { path: 'delete-account', element: <DeleteAccountPage /> },
  ],
};
