import { useMutation } from '@tanstack/react-query';
import { Camera, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { apiRequest } from '../../lib/http.js';
import { useSetSessionUser } from '../auth/api.js';
import { checkFile, uploadFile } from '../media/upload.js';

/** Profile photo: upload a new one (shown to friends and in search) or remove it. */
export function AvatarEditor({ user }) {
  const setUser = useSetSessionUser();
  const inputRef = useRef(null);
  const [progress, setProgress] = useState(null);

  const change = useMutation({
    mutationFn: async (file) => {
      const checked = checkFile(file, { imagesOnly: true });
      if (checked.error) throw new Error(checked.error);
      setProgress(0);
      const attachment = await uploadFile({
        file,
        kind: checked.kind,
        mimeType: checked.mimeType,
        purpose: 'avatar',
        onProgress: setProgress,
      });
      const { user: updated } = await apiRequest('/api/users/me/avatar', {
        method: 'PUT',
        body: { attachmentId: attachment.id },
      });
      return updated;
    },
    onSuccess: setUser,
    onSettled: () => setProgress(null),
  });

  const remove = useMutation({
    mutationFn: () => apiRequest('/api/users/me/avatar', { method: 'DELETE' }),
    onSuccess: ({ user: updated }) => setUser(updated),
  });

  const error = change.error ?? remove.error;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <Avatar name={user.displayName} src={user.avatar} size="xl" />
        <button
          type="button"
          aria-label={user.avatar ? 'Change photo' : 'Add photo'}
          disabled={change.isPending}
          onClick={() => inputRef.current.click()}
          className="absolute right-0 bottom-0 flex size-9 items-center justify-center rounded-full border-2 border-surface bg-surface-muted text-text shadow-sm hover:bg-surface-hover disabled:opacity-60"
        >
          <Camera aria-hidden="true" className="size-4" />
        </button>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          loading={change.isPending}
          onClick={() => inputRef.current.click()}
        >
          {user.avatar ? 'Change photo' : 'Add photo'}
        </Button>
        {user.avatar && (
          <Button
            size="sm"
            variant="ghost"
            loading={remove.isPending}
            onClick={() => remove.mutate()}
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Remove photo
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          hidden
          data-testid="avatar-input"
          onChange={(event) => {
            const [file] = event.target.files;
            event.target.value = '';
            if (file) change.mutate(file);
          }}
        />
      </div>
      {progress !== null && (
        <p role="status" className="text-sm text-muted">
          Uploading… {Math.round(progress * 100)}%
        </p>
      )}
      {error && <Alert tone="error">{error.message}</Alert>}
    </div>
  );
}
