# Phone experience checklist

The bar is WhatsApp/Messenger-level smoothness. Before finishing **every** phase I go through this list myself: automated phone-size tests where possible, plus phone screenshots in light and dark mode. Anything that fails gets fixed in the same phase or written down in STATUS.md with a reason. The person testing the app should never be the first to find these.

## Typing and sending

- [x] The keyboard stays open after tapping Send (no close/reopen flicker).
- [x] The emoji panel replaces the keyboard, below the typing box; the message being typed stays visible with its cursor.
- [x] Several emojis in a row; ⌫ deletes one whole emoji; recently used emojis come first.
- [x] Back gesture, a tap outside, Escape or ⌨ close the panel; Back never leaves the chat by surprise.
- [x] Text inputs are 16 px, so iPhones don't zoom in when typing.
- [x] Enter makes a new line on phones (Send sends); IME keyboards (Bangla) never send half-typed words.
- [ ] Long-press text selection in the typing box: native on real phones. In the computer's DevTools phone mode it's simulated and slow. **To check on a real phone** (`npm run dev:phone`).

## Message list

- [x] Opens at the first unread message, otherwise at the newest.
- [x] Stays at the newest message when the keyboard, emoji panel, photo tray or "typing…" changes the space.
- [x] Scrolled up: new messages don't yank the view; a ↓ button shows how many arrived and jumps down.
- [x] Photos and videos reserve their space before loading (no jumping).
- [x] Loading older messages keeps the reading position.

## Touch feel

- [x] No blue/grey tap flash; buttons show a pressed state.
- [x] Long-press opens message actions; scrolling never triggers it.
- [x] Touch targets are at least 44 × 44 px.
- [x] No sideways scrolling on 360–430 px wide screens.

## Connection

- [x] Offline at startup: "You're offline", and the app continues by itself when back (no endless spinner).
- [x] Connection lost inside the app: a "Connecting…" / "You're offline" pill. Messages typed meanwhile are sent automatically.
- [x] Phone offline/online is noticed at once, and missed messages are caught up after reconnecting.

## Settings

- [x] Switches and choices react instantly (saved in the background, rolled back with an error if saving fails).
- [x] Grouped like Messenger (profile card, Install Adda, Preferences, Account, About); each row opens its own page with a back arrow, and the phone's back gesture returns to the list.
- [x] Edit pages: one full-width Save button that stays off until something changed; saving shows "Saved" and goes back.
- [x] Passwords are never shown on screen: no show/hide button, and Edge's built-in reveal eye is hidden.
- [x] Change password asks for the new password twice.
- [x] "Install Adda" is one tap on the Settings page (iPhone: opens the Add to Home Screen guide).
- [x] New accounts see "Welcome to Adda" + Find friends instead of an empty chat list.

## Groups

- [x] "New group" is labelled on the Chats screen; Create stays off until a name and 2 friends are chosen, and says how many more are needed.
- [x] Sender names above and photos beside other people's messages; group notices are quiet centered lines.
- [x] Header shows "N members · M online" or "Nadia is typing…"; tapping the name opens Group info.
- [x] A removed member's open chat closes with "You're no longer in this group" instead of an error.

## Popups

- [x] Every popup (menus, options, photo viewer, emoji panel) closes with the phone's Back button.
- [x] Bottom sheets on phones, centered dialogs on desktop.

## Still to check on real devices

- [ ] Android Chrome and iPhone Safari: keyboard/emoji panel switching, selection handles, photo picking (HEIC), video playback.
- [ ] Installed app (PWA, Phase 9): status bar color, safe areas, notifications.
