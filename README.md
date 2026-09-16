# Thermalnote

A private, black notebook with text that cools from red through orange, gold, and blue to white. Notes have titles, autosave, rich text, links, and inline images.

## Open the app

Requires Node.js 24 or newer (Node 26 is installed on this computer). There are no packages to install.

```sh
cd ~/Projects/thermalnote
npm start
```

Open http://127.0.0.1:4317 and sign in as **Arris** with the password supplied during setup. The password is stored as a salted scrypt hash in the private `.env` file; it is never sent to the browser. `.env` and all local note data are excluded from Git.

The server binds only to this computer by default. Keep its terminal running while using the app. `./start.sh` also starts it.

## Notes and images

- Notes save automatically after a brief pause and periodically during continuous typing. Click the save status or press Ctrl/Cmd+S to save immediately.
- Each character's heat is independent. Cooling lasts about four seconds, never blocks editing or saving, and is not included in saved notes. Existing text opens white.
- Paste links or use **Link**. Ctrl/Cmd-click a link in the editor to open it.
- Paste, drop, or choose images. PNG, JPEG, WebP, GIF, and AVIF are supported, up to 12 MB each.
- Use Ctrl/Cmd+B and Ctrl/Cmd+I, or the formatting buttons. Ctrl/Cmd+N makes a new note while the page has focus (a browser may reserve this shortcut).
- **Heat on/off** controls the effect. It starts off for reduced-motion preferences. Browsers without the CSS Custom Highlight API still provide a working editor with white text.
- There is no application-level character limit. Individual save requests have a 32 MB safety limit.
- Browser draft backups protect unfinished work. A failed save is visibly marked; the app retries transient failures and offers recovery for conflicting edits from other windows. It never silently overwrites a newer version.
- Deleted notes are soft-deleted in the database. Images remain in storage so a recovered note can still display them.

## Storage configuration

The footer tells you which storage is active. Local mode stores notes in `data/notes.sqlite` and images in `data/uploads`. Back up the whole `data` directory while the server is stopped. Browser draft backups are only a recovery aid; the server database is the source of truth.

Supabase project: **thermalnote**, `sedyckmbnyydsfjoycuz`.

The private Supabase schema and image bucket were installed on September 16, 2026. The final server credential is pending approval; local storage is active until that is supplied.

To connect Supabase:

1. For a new installation, run `supabase.sql` in this project's SQL editor. It creates a private notes table, version-checked save/delete functions, and a private images bucket. It does not open anonymous access or alter existing unrelated tables.
2. Set these values in the private `.env` file:

   ```dotenv
   STORAGE_MODE=supabase
   SUPABASE_URL=https://sedyckmbnyydsfjoycuz.supabase.co
   SUPABASE_SECRET_KEY=your_server_secret_or_service_role_key
   ```

3. Restart the server. The footer will show **Synced with Supabase**. The supplied publishable key is intentionally not used for private server writes.

Local and Supabase storage are separate; switching modes does not copy existing data. Do not switch storage while an unsaved draft is open. A production migration should copy both notes and images before switching.

## Hosting

This is a Node server, not a static site. For hosting, provide persistent storage or configure Supabase. Set `HOST=0.0.0.0`, an appropriate `PORT`, `APP_ORIGIN` to the exact HTTPS origin, and `COOKIE_SECURE=true` behind a trusted HTTPS reverse proxy. Sessions expire after seven days; a server restart signs you out. No sign-up or second-user flow exists. Public publishing is not configured.

## Checks

```sh
npm test
npm run check
```

Tests cover character age tracking, edits in the middle of repeated text, persistent storage, stale-save rejection, login, cross-origin write protection, private image access, and image validation.

The optional experimental WebMCP integration exposes note listing and note creation only after sign-in. Normal editing never depends on it.
