# Deploy Thermalnote to Vercel

The repository includes the Vercel Function, static interface, persistent Supabase sessions, and direct image uploads. Deployment has not been completed or tested on Vercel yet.

## 1. Finish Supabase setup

Open the SQL editor for project **thermalnote** (`sedyckmbnyydsfjoycuz`). The notes schema and image bucket in `supabase.sql` have already been applied to this project. Run the additional **`supabase-auth.sql`** file to create the private session tables and login limit function. For a fresh project, run both SQL files in that order.

In Project Settings → API Keys, copy the server secret key (`sb_secret_…`) or legacy `service_role` key. The publishable key cannot access the private notes and must not be used as the server key.

## 2. Import the GitHub repository

In Vercel, create a project by importing **Robertgreenwood27/thermalnote**. Use the repository root and the **Other** framework preset. Select **Node.js 24.x**. The included `vercel.json` sets the build command and output directory.

## 3. Add Production environment variables

The private file `~/Projects/thermalnote/.env.vercel` on your computer holds the existing username and password hash. It is intentionally absent from GitHub. Replace its two placeholders with the real Supabase server key and the final deployment origin.

| Name | Value |
| --- | --- |
| `APP_USERNAME` | Copy from your private `.env.vercel` |
| `APP_PASSWORD_HASH` | Copy the entire existing hash from `.env.vercel` |
| `STORAGE_MODE` | `supabase` |
| `SUPABASE_URL` | `https://sedyckmbnyydsfjoycuz.supabase.co` |
| `SUPABASE_SECRET_KEY` | The server secret key from step 1 |
| `APP_ORIGIN` | Your final `https://…vercel.app` address, without a trailing slash |
| `COOKIE_SECURE` | `true` |

There is no plaintext `APP_PASSWORD` variable. Use the existing `APP_PASSWORD_HASH`; the original password still works with it. None of these variables should have a `NEXT_PUBLIC_` prefix. Do not put secret values in `.gitignore` itself.

If the final hostname is not known yet, omit `APP_ORIGIN` for the first deployment. Vercel's built-in deployment and production URL variables are accepted for same-site requests. Once you have the final URL, set `APP_ORIGIN` and redeploy. Custom domains require their exact origin here.

## 4. Deploy and verify

Deploy from Vercel, then sign in. Create a note, type while its letters cool, add a link and a picture, and wait for **Saved**. Reload and confirm everything returns with white text. The footer should say **Synced with Supabase**. Sign out and confirm the notebook requires login again.

Changing environment variables requires a new deployment. If login reports that cloud storage is unavailable, verify the server key and ensure `supabase-auth.sql` was applied. If a request reports that it came from another website, check `APP_ORIGIN` against the address you are using and redeploy.

Local notes stay in `data/notes.sqlite` with images in `data/uploads`. Switching to Supabase does not copy them automatically. Keep that directory as a backup; migrate any local notes you want before treating the cloud copy as complete.

Vercel limits a single note save to its 4.5 MB request limit. Images upload separately and may be up to 12 MB each. Oversized or failed saves keep a browser draft and show an error.

## Credentials and privacy

`.env`, `.env.*`, local notes, and Vercel metadata are excluded from Git. `.vercelignore` also excludes credentials and local data from deployment uploads. The browser receives neither the password hash nor the Supabase server key. Notes, sessions, and images are private; there is no sign-up route.
