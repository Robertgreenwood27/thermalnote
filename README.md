# Thermalnote

A private, black notebook with text that cools from red through orange, gold, and blue to white. Notes have titles, autosave, rich text, links, and inline images.

## Open the app

Uses Node.js 24 on Vercel. Node 26 also runs the local app. There are no application packages to install.

```sh
cd ~/Projects/thermalnote
npm start
```

Open http://127.0.0.1:4317 and sign in with the username and password supplied during setup. The password is stored as a salted scrypt hash in the private `.env` file; it is never sent to the browser. `.env` and all local note data are excluded from Git.

The server binds only to this computer by default. Keep its terminal running while using the app. `./start.sh` also starts it.

## Notes and images

- Notes save automatically after a brief pause and periodically during continuous typing. Click the save status or press Ctrl/Cmd+S to save immediately.
- Each character's heat is independent. Cooling lasts about four seconds, never blocks editing or saving, and is not included in saved notes. Existing text opens white.
- Paste links or use **Link**. Ctrl/Cmd-click a link in the editor to open it.
- Paste, drop, or choose images. PNG, JPEG, WebP, GIF, and AVIF are supported, up to 12 MB each.
- Use Ctrl/Cmd+B and Ctrl/Cmd+I, or the formatting buttons. Ctrl/Cmd+N makes a new note while the page has focus (a browser may reserve this shortcut).
- **Heat on/off** controls the effect. It starts off for reduced-motion preferences. Browsers without the CSS Custom Highlight API still provide a working editor with white text.
- There is no application-level character limit. Individual saves are subject to the host's request-size limit (4.5 MB on Vercel, 32 MB locally). Pictures upload separately and do not count toward note size.
- Browser draft backups protect unfinished work. A failed save is visibly marked; the app retries transient failures and offers recovery for conflicting edits from other windows. It never silently overwrites a newer version.
- Deleted notes are soft-deleted in the database. Images remain in storage so a recovered note can still display them.

## Storage configuration

The footer tells you which storage is active. Local mode stores notes in `data/notes.sqlite` and images in `data/uploads`. Back up the whole `data` directory while the server is stopped. Browser draft backups are only a recovery aid; the server database is the source of truth.

Supabase project: **thermalnote**, `sedyckmbnyydsfjoycuz`.

The notes schema and private image bucket were installed on September 16, 2026. Before deploying, also run `supabase-auth.sql` and supply the Supabase server credential. Local storage is active in the current private `.env` until that is configured.

To connect Supabase:

1. For a new installation, run `supabase.sql`, then `supabase-auth.sql` in this project's SQL editor. They create private notes, version-checked save/delete functions, a private images bucket, durable sessions, and a shared login attempt limit. They do not open anonymous access or alter unrelated tables.
2. Set these values in the private `.env` file:

   ```dotenv
   STORAGE_MODE=supabase
   SUPABASE_URL=https://sedyckmbnyydsfjoycuz.supabase.co
   SUPABASE_SECRET_KEY=your_server_secret_or_service_role_key
   ```

3. Restart the server. The footer will show **Synced with Supabase**. The supplied publishable key is intentionally not used for private server writes.

Local and Supabase storage are separate; switching modes does not copy existing data. Do not switch storage while an unsaved draft is open. A production migration should copy both notes and images before switching.

## Hosting

Vercel serves the interface as static files and runs the private API through `api/index.mjs`. Supabase is required on Vercel; the app refuses to save to its temporary filesystem. Sessions expire after seven days and survive server restarts. Logging out revokes the session across all instances. Changing the username or password hash also invalidates existing sessions. Images upload directly to the private bucket using short-lived upload permissions; viewing an image requires login and a temporary signed download URL.

For a conventional Node host, provide persistent storage or configure Supabase. Set `HOST=0.0.0.0`, an appropriate `PORT`, `APP_ORIGIN` to the exact HTTPS origin, and `COOKIE_SECURE=true` behind a trusted HTTPS reverse proxy. No sign-up or second-user flow exists.

## Checks

```sh
npm test
npm run check
```

Tests cover character age tracking, edits in the middle of repeated text, persistent storage, stale-save rejection, login, cross-origin write protection, private image access, image validation, and sessions and login limits shared by multiple server instances.

See [DEPLOY.md](DEPLOY.md) for the remaining Vercel setup steps.

The optional experimental WebMCP integration exposes note listing and note creation only after sign-in. Normal editing never depends on it.

## Vercel environment settings

The private `.env.vercel` file contains your existing username and password hash, plus placeholders for the Supabase server key and deployed origin. It is ignored by Git, as are `.env`, `.env.local`, and all other `.env.*` files except the blank `.env.example` template. Do not put credentials in `.gitignore` itself: it is a list of filenames and is committed to Git.

Set these variables under the Vercel project's Settings → Environment Variables:

| Name | Value |
| --- | --- |
| `APP_USERNAME` | Your username from the private `.env.vercel` file |
| `APP_PASSWORD_HASH` | Copy the full hash from `.env.vercel`; this is not the plaintext password |
| `STORAGE_MODE` | `supabase` |
| `SUPABASE_URL` | `https://sedyckmbnyydsfjoycuz.supabase.co` |
| `SUPABASE_SECRET_KEY` | Your Supabase server secret (`sb_secret_…`) or legacy `service_role` key |
| `APP_ORIGIN` | Your exact deployed HTTPS origin, with no trailing slash |
| `COOKIE_SECURE` | `true` |

Do not prefix these with `NEXT_PUBLIC_`, and do not use the publishable Supabase key in place of the server key. There is no `APP_PASSWORD` variable: the app uses `APP_PASSWORD_HASH`.

Apply both SQL files, configure the variables above for Production, and deploy with the included `vercel.json`. Use the Node.js 24 runtime. `.vercelignore` excludes credentials, local notes, and Git history from uploads. The server key and password hash are used only by the API and are never bundled into the interface.

Vercel applies environment-variable changes to new deployments: <https://vercel.com/docs/environment-variables>.
