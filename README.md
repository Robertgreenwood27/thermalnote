# Thermalnote

Two modes behind one sign-in, for the two things being worked on daily.

- **Lift** — a training log built for speed: structured sets, last session's numbers already filled in, personal bests, food and protein, and a copy button that puts the whole day on the clipboard.
- **Notes** — a private, black notebook with text that cools from red through orange, gold, and blue to white. Notes have titles, autosave, rich text, links, and inline images. Cards made from your notes carry that same temperature in their borders, so the page shows what you still need to study.

The app opens in whichever mode was used last. The switch in the top bar moves between them, and the mode lives in the address (`#/workout`, `#/notes`), so either one can be pinned to a phone's home screen as its own icon.

## Open the app

Uses Node.js 24 on Vercel. Node 26 also runs the local app. There are no application packages to install.

```sh
cd ~/Projects/thermalnote
npm start
```

Open http://127.0.0.1:4317 and sign in with the username and password supplied during setup. The password is stored as a salted scrypt hash in the private `.env` file; it is never sent to the browser. `.env` and all local note data are excluded from Git.

The server binds only to this computer by default. Keep its terminal running while using the app. `./start.sh` also starts it.

## Lift

The day is chosen automatically and rolls over at **4am**, so a session finished at 1am still files under the night it started. The arrows move between days; tapping the date returns to today. Everything saves as it is typed.

### Logging a movement

**+ Add movement** opens the catalogue: most-used first, then 99 movements across eleven muscle groups, plus search. The magnifier beside any movement opens a Google image search for it — the fastest way to learn a lift that is only a name so far. Searching something not in the list offers to add it as a new movement, and it joins the catalogue from then on.

Adding a movement **fills in what was done last time**, so the starting question is "can this be beaten" rather than "what was it again". Untouched numbers are dimmed until edited, to show at a glance what has not been confirmed yet.

Sets are a plain list, which is what makes uneven sets a non-event. **+ Set** copies the row above it, so three identical sets are one entry and two taps, and 30×10, 30×5, 20×8 is the same action with two numbers changed. There is no separate mode to switch into.

Each movement carries three columns depending on what it is: weight/reps/RIR for loaded lifts, reps/added weight/RIR for bodyweight movements, and seconds for held positions like planks. **RIR** is reps in reserve — how many more were left in the tank. It is always optional, and it is the thing that separates a hard set from an easy one at the same weight.

### Knowing whether it is working

Under every movement: what was done last time and its total volume, then the personal best (best session volume, and best estimated one-rep max by the Epley formula). Beating the previous session shows a green gain beside the day's total for that movement.

**History** lists every past day with its movements, volume, and protein. Any day can be opened and edited.

### The body

**Body** opens a rotatable 3D muscular figure. Drag to turn it, pinch or scroll to zoom, and **Front** / **Back** spin it round without having to work out which way it is facing.

A muscle worked recently is red, and cools over the following days exactly the way a marked passage in Notes does. The red is not a flag but a reading: how much work the muscle took, faded by how long ago it took it. Each logged set counts, a movement's primary muscles take the full stimulus and its secondary muscles a little under half, and the heat halves every 60 hours — so a muscle is about two thirds lit the next morning, a third after three days, and all but cool after a week. Sessions stack without ever passing fully worked. Sets are the unit rather than pounds, because pounds, reps, and seconds are not comparable and set count is what every movement has in common.

Tapping a muscle names it, says when it was last trained and with what, and lists every movement in the catalogue that trains it — the ones it is the point of first, then the ones that also work it. Tapping one of those puts it on today's page, with last time's numbers already filled in, the same as adding it from the picker. Under the figure, when nothing is selected, the muscles with the most heat left in them are ranked, so the question "what is still recovering" is answered without touching the model.

Movements added by hand in the picker are not mapped to muscles yet and stay dark. The mapping lives in `public/muscles.js` as two plain tables — one naming the meshes that make up each muscle, one naming the muscles each movement trains — and the recovery curve lives alone in `public/recovery.js`. Neither knows anything about the 3D view, so either can be changed by editing a line and reloading.

The figure downloads only the first time the Body pane is opened, and nothing is drawn while it is out of sight.

### Food

Meals are a description and grams of protein, with a running total. Meals eaten recently appear as chips — one tap to log the same thing again.

### Copy day

**Copy day** puts the whole day on the clipboard as plain text, with each movement's previous session and the change beneath it, ready to paste into a chatbot for review:

```
Monday, September 21, 2026

WORKOUT
Barbell Curl — 40×8 RIR1, 30×10 RIR2, 25×12 RIR0 · 920 lb
  prev Sat, Sep 19 — 35×8, 30×10, 30×8 · 820 lb (+100)
Day volume: 4,110 lb

FOOD
Chicken bowl — 55 g protein
Total protein: 55 g
```

A day is stored as one versioned document, so the whole history loads at sign-in and previous bests appear instantly with nothing to fetch. Unsaved changes are mirrored to the browser and replayed if a save is interrupted.

## Notes and images

- Notes save automatically after a brief pause and periodically during continuous typing. Click the save status or press Ctrl/Cmd+S to save immediately.
- Each character's heat is independent. It runs red, orange, yellow, blue, then white. Cooling lasts about four seconds, never blocks editing or saving, and is not included in saved notes. Existing text opens white.
- Paste links or use **Link**. Ctrl/Cmd-click a link in the editor to open it.
- Paste, drop, or choose images. PNG, JPEG, WebP, GIF, and AVIF are supported, up to 12 MB each.
- Click an image to open it over the page, sized to the screen. Click it again or press + and − to zoom, drag to pan, **Full screen** or F fills the display, and Esc or a click outside closes it. Ctrl/Cmd-click an image instead to select it in the editor.
- Use Ctrl/Cmd+B and Ctrl/Cmd+I, or the formatting buttons. Ctrl/Cmd+N makes a new note while the page has focus (a browser may reserve this shortcut).
- **Heat on/off** controls the effect. It starts off for reduced-motion preferences. Browsers without the CSS Custom Highlight API still provide a working editor with white text.
- There is no application-level character limit. Individual saves are subject to the host's request-size limit (4.5 MB on Vercel, 32 MB locally). Pictures upload separately and do not count toward note size.
- Browser draft backups protect unfinished work. A failed save is visibly marked; the app retries transient failures and offers recovery for conflicting edits from other windows. It never silently overwrites a newer version.
- Deleted notes are soft-deleted in the database. Images remain in storage so a recovered note can still display them.

## Cards

Writing stays writing. When a passage is something you could not repeat back, select it and press Ctrl/Cmd+M (or **Card**). It becomes a card where it sits: a block with a front and a back, and its border takes the temperature. There is no deck to file it in.

- **Splitting a card.** Select part of a card and press Ctrl/Cmd+B (or **To back**) to send it to the back. What stays is the prompt; what moved is the answer. The same keys on the back send words back to the front. Outside a card, Ctrl/Cmd+B is still bold.
- **Flipping.** Click the strip at the top of a card, where it says **↻ Flip**, to turn it over.
- **New cards.** Type `/card` at the start of a line or after a space for a blank card showing both sides. Type the front, Tab to the back, then Ctrl/Cmd+Enter to finish. A card left empty is removed.
- **Releasing.** Ctrl/Cmd+M with the cursor inside a card turns it back into ordinary text, front then back.
- **The border is the signal.** A new card is red. It cools through orange, yellow, and blue as you recall it, then goes grey once you know it. Confidence decays: each successful recall extends the half-life (about 14 hours, then 2, 5, 12, 30, and 75 days), so the page warms up again over time and asks again.
- **Review happens in place.** **◈ n warm** in the top bar counts every warm card across every note, hottest first. Each card shows its front where it sits, and Space flips it. Answer Forgot, Hard, or Got it (keys 1, 2, 3); Esc leaves.
- A card's confidence is stored on the card itself in the note's HTML, so it needs no extra database column and moves with the card. Flip state and colors are painted while the note is open and are never saved.
- Passages marked before cards existed still paint and still come up for review. Selecting one and pressing Ctrl/Cmd+M turns it into a card and carries its review history over.

## Storage configuration

The `STORAGE_MODE` setting selects storage. Local mode stores notes in `data/notes.sqlite` and images in `data/uploads`. Back up the whole `data` directory while the server is stopped. Browser draft backups are only a recovery aid; the server database is the source of truth.

Supabase project: **thermalnote**, `sedyckmbnyydsfjoycuz`.

The notes schema and private image bucket were installed on September 16, 2026. Before deploying, also run `supabase-auth.sql` and supply the Supabase server credential. Local storage is active in the current private `.env` until that is configured.

To connect Supabase:

1. For a new installation, run `supabase.sql`, `supabase-auth.sql`, then `supabase-workout.sql` in this project's SQL editor. A notebook installed before study marks existed needs `supabase-marks.sql` once as well; it adds the `marks` column and replaces the save function, and it does not touch a word of existing notes. They create private notes, version-checked save/delete functions, a private images bucket, durable sessions, a shared login attempt limit, and the training-day table with its own version-checked save. They do not open anonymous access or alter unrelated tables.
2. Set these values in the private `.env` file:

   ```dotenv
   STORAGE_MODE=supabase
   SUPABASE_URL=https://sedyckmbnyydsfjoycuz.supabase.co
   SUPABASE_SECRET_KEY=your_server_secret_or_service_role_key
   ```

3. Restart the server. The supplied publishable key is intentionally not used for private server writes.

Local and Supabase storage are separate; switching modes does not copy existing data. Do not switch storage while an unsaved draft is open. A production migration should copy both notes and images before switching.

## Hosting

Vercel serves the interface as static files and runs the private API through `api/index.mjs`. Supabase is required on Vercel; the app refuses to save to its temporary filesystem. Sessions expire after seven days and survive server restarts. Logging out revokes the session across all instances. Changing the username or password hash also invalidates existing sessions. Images upload directly to the private bucket using short-lived upload permissions; viewing an image requires login and a temporary signed download URL.

For a conventional Node host, provide persistent storage or configure Supabase. Set `HOST=0.0.0.0`, an appropriate `PORT`, `APP_ORIGIN` to the exact HTTPS origin, and `COOKIE_SECURE=true` behind a trusted HTTPS reverse proxy. No sign-up or second-user flow exists.

## Checks

```sh
npm test
npm run check
```

Tests cover character age tracking, edits in the middle of repeated text, persistent storage, stale-save rejection, login, cross-origin write protection, private image access, image validation, and sessions and login limits shared by multiple server instances. They also cover confidence decay and review, marks riding along with edits, confidence resetting when a marked passage changes, re-anchoring marks whose text has moved, and storing marks beside a note without altering it. On the training side they cover day storage and its version conflicts, the day API's authentication and date validation, the 4am day boundary, and the set arithmetic behind volume and summaries. For the body they check that every muscle's meshes exist in the shipped model and every movement targets muscles that exist, that a logged day heats its primary muscles harder than its secondary ones and leaves untrained muscles cold, that heat halves on its half-life and stacked sessions never pass fully worked, and that unlogged sets and unmapped movements contribute nothing.

## The 3D model

`public/body-muscles.glb` is built from [body-anatomy-3d-viewer](https://github.com/hpfrei/body-anatomy-3d-viewer) by hpfrei, whose model comes in turn from [Z-Anatomy](https://www.z-anatomy.com/). Both are licensed **CC BY-SA 4.0**, and so is the model file here: it is an adaptation, so it keeps that licence and its attribution wherever the app is deployed. The licence and the full attribution chain travel with it in [`public/body-muscles.LICENSE.md`](public/body-muscles.LICENSE.md). The rest of Thermalnote is unaffected — the app's own code is not an adaptation of the model. `public/vendor/` holds Three.js r160 (MIT) with its loader and orbit controls, vendored rather than loaded from a CDN because the Content-Security-Policy allows scripts only from this origin.

Rebuilding the model is a one-time step, and only needed if the source model changes:

```sh
git clone --depth 1 https://github.com/hpfrei/body-anatomy-3d-viewer.git /tmp/bav
node tools/build-body-model.mjs --source /tmp/bav/public
```

It drops the skeleton, drops the anatomy encyclopedia embedded in every mesh, and decodes the DRACO compression, taking 7.9 MB down to 2.5 MB. Decoding at build time is deliberate: the browser-side DRACO decoder needs a `blob:` worker and WebAssembly, and widening `script-src` to allow them costs more than the bytes do. Normals are recomputed at load instead of stored, which is invisible on organic shapes and saves 1.3 MB.

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
