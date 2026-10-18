import { useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert.jsx';
import { Switch } from '../../components/ui/Switch.jsx';
import { CHAT_KEYS } from '../chat/api.js';
import { useUpdateSettings } from './api.js';

/**
 * Who can see my online status, last seen and read receipts, and whether people can find me.
 * The first three work both ways, like WhatsApp: hiding mine also hides other people's.
 */
export function PrivacySettings({ privacy }) {
  const update = useUpdateSettings();
  const queryClient = useQueryClient();

  const save = (changes) =>
    update.mutate(
      { privacy: changes },
      // Ticks and previews depend on read receipts (both people's settings).
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: CHAT_KEYS.conversations }) },
    );

  return (
    <div className="flex flex-col gap-1">
      <Switch
        label="Show when I’m online"
        description="Friends see “online”. If you turn this off, you won’t see theirs either."
        checked={privacy.onlineStatus === 'friends'}
        onChange={(on) => save({ onlineStatus: on ? 'friends' : 'nobody' })}
      />
      <Switch
        label="Show my last seen"
        description="Friends see when you were last online. Off also hides theirs from you."
        checked={privacy.lastSeen === 'friends'}
        onChange={(on) => save({ lastSeen: on ? 'friends' : 'nobody' })}
      />
      <Switch
        label="Read receipts"
        description="Friends see “Seen”. Off also hides when they read your messages."
        checked={privacy.readReceipts}
        onChange={(on) => save({ readReceipts: on })}
      />
      <Switch
        label="Let people find me in search"
        description="Off: people can only find you by typing your exact username."
        checked={privacy.discoverable}
        onChange={(on) => save({ discoverable: on })}
      />
      {update.isError && <Alert tone="error">{update.error.message}</Alert>}
    </div>
  );
}
