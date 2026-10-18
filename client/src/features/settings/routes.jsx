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
  BioPage,
  NamePage,
  ProfilePage,
  SettingsPage,
  UsernamePage,
} from './SettingsPage.jsx';

/**
 * Settings and its sub-pages by path (each opens like a new screen; back returns to the list).
 * Loaded only when Settings is opened (see app/router.jsx).
 */
export const SETTINGS_PAGES = {
  '': SettingsPage,
  profile: ProfilePage,
  'profile/name': NamePage,
  'profile/username': UsernamePage,
  'profile/bio': BioPage,
  appearance: AppearancePage,
  notifications: NotificationsPage,
  privacy: PrivacyPage,
  email: EmailPage,
  password: PasswordPage,
  devices: DevicesPage,
  install: InstallPage,
  about: AboutPage,
  'delete-account': DeleteAccountPage,
};
