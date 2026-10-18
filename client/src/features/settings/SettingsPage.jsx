import {
  AtSign,
  Bell,
  ChevronRight,
  Download,
  Info,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  MonitorSmartphone,
  Palette,
  PenLine,
  Trash2,
  UserRound,
} from 'lucide-react';
import { Link } from 'react-router';
import { Alert } from '../../components/ui/Alert.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { useGoBack } from '../../hooks/useGoBack.js';
import { PageLayout } from '../../layouts/PageLayout.jsx';
import { CURRENT_RELEASE } from '../../releaseNotes.js';
import { useLogout, useSession } from '../auth/api.js';
import { AboutSection } from '../pwa/AboutSection.jsx';
import { InstallAppSection } from '../pwa/InstallAppSection.jsx';
import { NotificationSettings } from '../pwa/NotificationSettings.jsx';
import { isIos, isStandalone, promptInstall, usePwa } from '../pwa/pwaStore.js';
import { BioForm, EmailForm, NameForm, PasswordForm, UsernameForm } from './AccountForms.jsx';
import { useUpdateSettings } from './api.js';
import { AvatarEditor } from './AvatarEditor.jsx';
import { PrivacySettings } from './PrivacySettings.jsx';
import { DeleteAccountForm, SessionsList } from './SecuritySection.jsx';
import { SettingsCard, SettingsGroup, SettingsRow } from './SettingsList.jsx';
import { ThemeSelector } from './ThemeSelector.jsx';
import { useTheme } from './useTheme.js';

const THEME_LABELS = { system: 'Same as device', light: 'Light', dark: 'Dark' };

/** The signed-in user (guaranteed by RequireVerifiedUser). */
function useMe() {
  return useSession().data.user;
}

/** "Install Adda" right on the Settings page: one tap opens the browser's install dialog. */
function InstallRow() {
  const { installPrompt, installed } = usePwa();
  if (installed || isStandalone()) return null;
  const label = 'Install Adda';
  const value = 'Use it like a normal app on this device';
  return (
    <SettingsGroup>
      {installPrompt && !isIos() ? (
        <SettingsRow
          icon={Download}
          color="violet"
          label={label}
          value={value}
          onClick={promptInstall}
        />
      ) : (
        <SettingsRow
          icon={Download}
          color="violet"
          label={label}
          value={value}
          to="/settings/install"
        />
      )}
    </SettingsGroup>
  );
}

export function SettingsPage() {
  const user = useMe();
  const { preference } = useTheme();
  const { updateReady } = usePwa();
  const logout = useLogout();

  return (
    <PageLayout title="Settings">
      <div className="flex flex-col gap-6 pb-6">
        <Link
          to="/settings/profile"
          className="flex items-center gap-4 rounded-xl p-2 transition-colors duration-(--duration-fast) hover:bg-surface-hover active:bg-surface-active"
        >
          <Avatar name={user.displayName} src={user.avatar} size="lg" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg font-semibold text-text">
              {user.displayName}
            </span>
            <span className="block truncate text-sm text-muted">@{user.username}</span>
            <span className="mt-0.5 block text-sm font-medium text-link">Edit profile</span>
          </span>
          <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-subtle" />
        </Link>

        <InstallRow />

        <SettingsGroup title="Preferences">
          <SettingsRow
            icon={Palette}
            color="violet"
            label="Appearance"
            value={THEME_LABELS[preference]}
            to="/settings/appearance"
          />
          <SettingsRow
            icon={Bell}
            color="red"
            label="Notifications"
            value={user.settings.notifications.enabled ? 'On' : 'Off'}
            to="/settings/notifications"
          />
          <SettingsRow
            icon={Lock}
            color="blue"
            label="Privacy"
            value="Online status, last seen, read receipts"
            to="/settings/privacy"
          />
        </SettingsGroup>

        <SettingsGroup title="Account">
          <SettingsRow
            icon={Mail}
            color="sky"
            label="Email"
            value={user.email}
            to="/settings/email"
          />
          <SettingsRow
            icon={KeyRound}
            color="amber"
            label="Password"
            value="Change your password"
            to="/settings/password"
          />
          <SettingsRow
            icon={MonitorSmartphone}
            color="green"
            label="Where you’re signed in"
            value="See and sign out your devices"
            to="/settings/devices"
          />
        </SettingsGroup>

        <SettingsGroup title="About">
          <SettingsRow
            icon={Info}
            color="gray"
            label="About & updates"
            value={`Adda ${CURRENT_RELEASE.version}`}
            badge={updateReady ? 'Update' : undefined}
            to="/settings/about"
          />
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow
            icon={LogOut}
            color="gray"
            label="Log out"
            loading={logout.isPending}
            onClick={() => logout.mutate()}
          />
          <SettingsRow
            icon={Trash2}
            color="danger"
            tone="danger"
            label="Delete account"
            to="/settings/delete-account"
          />
        </SettingsGroup>
      </div>
    </PageLayout>
  );
}

function SubPage({ title, children }) {
  return (
    <PageLayout title={title} backTo="/settings">
      <div className="flex flex-col gap-6 pb-6">{children}</div>
    </PageLayout>
  );
}

export function ProfilePage() {
  const user = useMe();
  return (
    <SubPage title="Edit profile">
      <AvatarEditor user={user} />
      <SettingsGroup>
        <SettingsRow
          icon={UserRound}
          color="blue"
          label="Name"
          value={user.displayName}
          to="/settings/profile/name"
        />
        <SettingsRow
          icon={AtSign}
          color="teal"
          label="Username"
          value={`@${user.username}`}
          to="/settings/profile/username"
        />
        <SettingsRow
          icon={PenLine}
          color="amber"
          label="Bio"
          value={user.bio || 'Add a few words about you'}
          to="/settings/profile/bio"
        />
      </SettingsGroup>
    </SubPage>
  );
}

/** A one-field edit page that returns to Edit profile after saving. */
export function ProfileFieldPage({ title, Form }) {
  const user = useMe();
  const goBack = useGoBack('/settings/profile');
  return (
    <PageLayout title={title} backTo="/settings/profile">
      <Form user={user} onDone={goBack} />
    </PageLayout>
  );
}

export function AppearancePage() {
  const updateSettings = useUpdateSettings();
  return (
    <SubPage title="Appearance">
      <SettingsCard>
        <ThemeSelector onChange={(theme) => updateSettings.mutate({ theme })} />
        {updateSettings.isError && (
          <Alert tone="error" className="mt-3">
            Applied on this device, but couldn’t save to your account. It will reset when you sign
            in elsewhere.
          </Alert>
        )}
      </SettingsCard>
    </SubPage>
  );
}

export function NotificationsPage() {
  const user = useMe();
  return (
    <SubPage title="Notifications">
      <SettingsCard>
        <NotificationSettings notifications={user.settings.notifications} />
      </SettingsCard>
    </SubPage>
  );
}

export function PrivacyPage() {
  const user = useMe();
  return (
    <SubPage title="Privacy">
      <SettingsCard>
        <PrivacySettings privacy={user.settings.privacy} />
      </SettingsCard>
      <p className="px-1 text-sm text-muted">
        Your messages, photos and videos are end-to-end encrypted: only you and the friend you’re
        chatting with can read them.
      </p>
    </SubPage>
  );
}

export function EmailPage() {
  const user = useMe();
  return (
    <SubPage title="Email">
      <EmailForm user={user} />
    </SubPage>
  );
}

export function PasswordPage() {
  const goBack = useGoBack('/settings');
  return (
    <SubPage title="Change password">
      <PasswordForm onDone={goBack} />
    </SubPage>
  );
}

export function DevicesPage() {
  return (
    <SubPage title="Where you’re signed in">
      <p className="px-1 text-sm text-muted">Sign out any device you don’t recognise.</p>
      <SettingsCard className="py-1">
        <SessionsList />
      </SettingsCard>
    </SubPage>
  );
}

export function InstallPage() {
  return (
    <SubPage title="Install Adda">
      <SettingsCard>
        <InstallAppSection />
      </SettingsCard>
    </SubPage>
  );
}

export function AboutPage() {
  return (
    <SubPage title="About & updates">
      <SettingsCard>
        <AboutSection />
      </SettingsCard>
    </SubPage>
  );
}

export function DeleteAccountPage() {
  return (
    <SubPage title="Delete account">
      <Alert tone="error">
        This removes your profile and signs you out everywhere. Messages you already sent stay in
        your friends’ chat history as “Deleted account”. This can’t be undone.
      </Alert>
      <DeleteAccountForm />
    </SubPage>
  );
}

export const NamePage = () => <ProfileFieldPage title="Name" Form={NameForm} />;
export const UsernamePage = () => <ProfileFieldPage title="Username" Form={UsernameForm} />;
export const BioPage = () => <ProfileFieldPage title="Bio" Form={BioForm} />;
