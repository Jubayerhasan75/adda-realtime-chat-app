import { CHAT_ACCENTS, HEX_COLOR } from '@chat/shared';
import { ImagePlus, Palette, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Alert } from '../../../components/ui/Alert.jsx';
import { cn } from '../../../lib/cn.js';
import { ACCENT_LABELS } from '../lib/chatTheme.js';
import {
  DIM_LEVELS,
  WALLPAPER_PRESETS,
  clearWallpaper,
  setWallpaperDim,
  setWallpaperPhoto,
  setWallpaperPreset,
  useWallpaper,
} from '../wallpaper.js';

const swatch =
  'flex size-10 cursor-pointer items-center justify-center rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--focus-ring)';
const selectedRing = 'ring-2 ring-text ring-offset-2 ring-offset-surface';

function ChatColor({ conversationId, accent, onChange }) {
  const custom = accent && HEX_COLOR.test(accent) ? accent : null;
  const [draft, setDraft] = useState(custom ?? '#592e83');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  // The color picker reports every movement: save once it settles.
  const pickCustom = (value) => {
    setDraft(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange({ conversationId, accent: value }), 400);
  };

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-text">Chat color</legend>
      <div className="flex flex-wrap gap-3">
        {CHAT_ACCENTS.map((preset) => {
          const selected = (accent ?? 'teakhelet') === preset;
          return (
            <label key={preset} className="flex flex-col items-center gap-1 text-xs text-muted">
              <input
                type="radio"
                name="accent"
                className="peer sr-only"
                checked={selected}
                onChange={() =>
                  onChange({ conversationId, accent: preset === 'teakhelet' ? null : preset })
                }
              />
              <span
                style={{ backgroundColor: `var(--accent-${preset})` }}
                className={cn(swatch, selected && selectedRing)}
              />
              {ACCENT_LABELS[preset]}
            </label>
          );
        })}
        <label className="flex flex-col items-center gap-1 text-xs text-muted">
          <input
            type="color"
            aria-label="Custom color"
            value={custom ?? draft}
            onChange={(event) => pickCustom(event.target.value)}
            className="peer sr-only"
          />
          <span
            style={{
              background: custom
                ? custom
                : 'conic-gradient(#e53935, #fdd835, #43a047, #1e88e5, #8e24aa, #e53935)',
            }}
            className={cn(swatch, custom && selectedRing)}
          >
            <Palette aria-hidden="true" className="size-4 text-white drop-shadow" />
          </span>
          Custom
        </label>
      </div>
    </fieldset>
  );
}

function ChatBackground({ userId, conversationId }) {
  const wallpaper = useWallpaper(userId, conversationId);
  const inputRef = useRef(null);
  const [error, setError] = useState(null);
  const run = (action) => {
    setError(null);
    action().catch((err) => setError(err.message));
  };

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-text">Background</legend>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          aria-pressed={!wallpaper}
          aria-label="No background"
          onClick={() => run(() => clearWallpaper(userId, conversationId))}
          className={cn(
            'flex size-14 items-center justify-center rounded-lg border border-border bg-chat-bg text-muted',
            !wallpaper && selectedRing,
          )}
        >
          <X aria-hidden="true" className="size-5" />
        </button>
        {WALLPAPER_PRESETS.map((preset) => {
          const selected = wallpaper?.presetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={selected}
              aria-label={`${preset.label} background`}
              title={preset.label}
              onClick={() =>
                run(() => setWallpaperPreset(userId, conversationId, preset.id, wallpaper?.dim))
              }
              style={{ backgroundImage: preset.css }}
              className={cn('size-14 rounded-lg', selected && selectedRing)}
            />
          );
        })}
        <button
          type="button"
          aria-pressed={wallpaper?.kind === 'photo'}
          aria-label="Choose a photo"
          onClick={() => inputRef.current.click()}
          style={wallpaper?.url ? { backgroundImage: `url("${wallpaper.url}")` } : undefined}
          className={cn(
            'flex size-14 items-center justify-center rounded-lg border border-dashed border-border bg-cover bg-center text-muted',
            wallpaper?.kind === 'photo' && selectedRing,
          )}
        >
          {wallpaper?.kind !== 'photo' && <ImagePlus aria-hidden="true" className="size-5" />}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          data-testid="wallpaper-input"
          onChange={(event) => {
            const [file] = event.target.files;
            event.target.value = '';
            if (file) run(() => setWallpaperPhoto(userId, conversationId, file, wallpaper?.dim));
          }}
        />
      </div>

      {wallpaper && (
        <div role="radiogroup" aria-label="Dim the background" className="mt-3 flex gap-2">
          {Object.keys(DIM_LEVELS).map((level) => (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={wallpaper.dim === level}
              onClick={() => run(() => setWallpaperDim(userId, conversationId, level))}
              className={cn(
                'flex-1 rounded-lg border px-2 py-1.5 text-sm capitalize',
                wallpaper.dim === level
                  ? 'border-primary bg-primary-soft text-text'
                  : 'border-border text-muted',
              )}
            >
              {level}
            </button>
          ))}
        </div>
      )}
      {error && (
        <Alert tone="error" className="mt-2">
          {error}
        </Alert>
      )}
      <p className="mt-2 text-xs text-muted">
        Everyone in this chat sees the color. The background is only for you: a photo stays on this
        device and is never uploaded.
      </p>
    </fieldset>
  );
}

/** This chat's color (synced to my account) and background (this device only). */
export function ChatAppearance({ conversation, currentUserId, onChange }) {
  return (
    <>
      <ChatColor
        conversationId={conversation.id}
        accent={conversation.myState.accent}
        onChange={onChange}
      />
      <ChatBackground userId={currentUserId} conversationId={conversation.id} />
    </>
  );
}
