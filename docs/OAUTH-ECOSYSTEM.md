# FreeSurf Ecosystem — Social OAuth Setup (Google, Apple, Facebook)

> One Supabase project, one OAuth setup per provider, **every FreeSurf app**.
>
> All FreeSurf apps share the same Supabase project
> (`jstojewashwoswsskwjk.supabase.co`), so they share one `auth.users` table.
> OAuth is configured once at the Supabase **project** level — the providers'
> redirect is always Supabase's own callback, never a per-app URL. Each app
> simply passes its own origin as `redirectTo` when it starts a sign-in.
>
> This doc is the ecosystem version; adapt the single-app copy you may find in
> per-repo `docs/` folders.

---

## The Supabase callback URL (used by every provider)

```
https://jstojewashwoswsskwjk.supabase.co/auth/v1/callback
```

This is the **only** redirect URI each provider needs to allow.

---

## Step 0 — Supabase Redirect URLs (do this once, per app)

Supabase blocks returning to any app origin that isn't allow-listed. Add **every**
login-capable origin under:

Supabase Dashboard → Authentication → URL Configuration → **Redirect URLs**

```
https://post.freesurf.tools
https://links.freesurf.tools
https://hire.freesurf.tools
https://invoices.freesurf.tools
https://freesurf.tools
```

When a new app joins the ecosystem, add its origin here too (and to the table
at the bottom of this doc).

---

## Provider checklist (one-time, ecosystem-wide)

| Provider | Where you create it | Needs an Apple/Google/Meta account |
|---|---|---|
| Google | Google Cloud Console | Google account |
| Apple | Apple Developer Portal | Apple Developer ($99/yr) |
| Facebook | Meta for Developers | Facebook account |

All three follow the same pattern:

1. Create an OAuth app on the provider's developer console (branded **FreeSurf**).
2. Allow the Supabase callback URL above as the redirect URI.
3. Paste the Client ID + Secret (or key) into Supabase.

---

## 1. Google

### Create credentials
1. [console.cloud.google.com](https://console.cloud.google.com) — create/select a
   **"FreeSurf"** project (all ecosystem apps share this one OAuth client).
2. **APIs & Services → Credentials → + Create Credentials → OAuth client ID**
3. Application type: **Web application**, name `FreeSurf`
4. **Authorized redirect URIs** → add:
   ```
   https://jstojewashwoswsskwjk.supabase.co/auth/v1/callback
   ```
5. Create → copy **Client ID** and **Client Secret**.

### Consent screen (FreeSurf branding)
- App name: `FreeSurf`
- User support email: `hello@freesurf.tools`
- App home page: `https://freesurf.tools`
- Privacy policy URL: `https://freesurf.tools/privacy.html`
- Terms of service URL: `https://freesurf.tools/terms.html`
- Authorized domains: `freesurf.tools`
- Scopes: `email`, `profile`, `openid`
- Test users: add your email while testing
- Google verification is optional for now — until verified, users see
  "Google hasn't verified this app" in **every** FreeSurf app.

### Add to Supabase
- Supabase → Authentication → Providers → **Google** → Enable
- Paste Client ID + Client Secret → Save

---

## 2. Apple (web Sign in with Apple)

> You **can** set this up now even though no iOS app is in the App Store. Web
> Sign in with Apple only needs an App ID, a **Services ID**, and a key. The
> App ID you register now can be a placeholder for a future iOS bundle — it
> just anchors the Services ID. Native in-app "Sign in with Apple" is a later,
> per-app step once iOS apps ship.

Prereq: Apple Developer account.

### Create an App ID (placeholder for the future iOS app)
1. Developer Portal → **Certificates, Identifiers & Profiles → Identifiers**
2. **+ → App IDs → App**
3. Description: `FreeSurf`
4. Bundle ID (Explicit): a future FreeSurf iOS bundle, e.g. `tools.freesurf.post`
5. Capabilities: **Sign In with Apple** → Continue → Register

### Create a Services ID (this is the web OAuth client)
1. Identifiers → **+ → Services IDs**
2. Description: `FreeSurf Web`, Identifier: e.g. `tools.freesurf.web`
3. Register, then open it → enable **Sign In with Apple → Configure**
4. Primary App ID: select the FreeSurf App ID above
5. **Domains and Subdomains**: `freesurf.tools`
6. **Return URLs**:
   ```
   https://jstojewashwoswsskwjk.supabase.co/auth/v1/callback
   ```
7. Save → Continue → Register

### Create a key
1. Keys → **+** → name `FreeSurf Sign in with Apple`
2. Check **Sign In with Apple** → Configure → Primary App ID: the FreeSurf App ID
3. Register → **download the `.p8`** (one-time) → note the **Key ID**

### Add to Supabase
- Supabase → Authentication → Providers → **Apple** → Enable
- **Client ID (Services ID)** = your Services ID (e.g. `tools.freesurf.web`)
- **Team ID** = your 10-char Apple Team ID (top-right of developer portal)
- **Key ID** = from the key detail page
- **Private Key** = full `.p8` contents (including the `-----BEGIN PRIVATE KEY-----` line)

---

## 3. Facebook / Meta

### Create the app
1. [developers.facebook.com](https://developers.facebook.com) → **My Apps → Create App**
2. Use case: **Authenticate and request data from users with Facebook Login**
3. App name: `FreeSurf`, contact email: `hello@freesurf.tools`

### Configure Facebook Login
1. **Add Product → Facebook Login → Set Up (Web)**
2. Site URL: `https://freesurf.tools`
3. **Facebook Login → Settings → Valid OAuth Redirect URIs**:
   ```
   https://jstojewashwoswsskwjk.supabase.co/auth/v1/callback
   ```
4. Save Changes

### Credentials
- **App Settings → Basic** → copy **App ID** and **App Secret** (click Show).

### Go live
- Toggle from **In development** to **Live**; add a Privacy Policy URL:
  `https://freesurf.tools/privacy.html`

### Add to Supabase
- Supabase → Authentication → Providers → **Facebook** → Enable
- Paste **App ID** (Client ID) + **App Secret** (Client Secret) → Save

---

## Wiring into the apps

Every app uses the same Supabase browser client and the same providers. The only
per-app difference is `redirectTo` (the app's own origin, which must be in
Supabase's Redirect URLs from Step 0):

```ts
const client = getSupabaseBrowserClient();

async function signIn(provider: "google" | "apple" | "facebook", redirectTo: string) {
  await client.auth.signInWithOAuth({ provider, options: { redirectTo } });
}
```

| App | URL | `redirectTo` |
|---|---|---|
| Post | post.freesurf.tools | `https://post.freesurf.tools` |
| Links | links.freesurf.tools | `https://links.freesurf.tools` |
| Hire | hire.freesurf.tools | `https://hire.freesurf.tools` |
| Invoices | invoices.freesurf.tools | `https://invoices.freesurf.tools` |
| Hub | freesurf.tools | `https://freesurf.tools` |

Supabase redirects to the provider, exchanges the token, creates/links the user
in `auth.users`, and returns to `redirectTo` with a session. Because the
ecosystem shares one `auth.users`, a user is the same person across every app.

---

## Testing checklist

- [ ] Google sign-in works from `post.freesurf.tools` → lands back there
- [ ] Repeat from `links.freesurf.tools`, `hire.freesurf.tools`, `freesurf.tools`
- [ ] Existing email user signs in with Google (same email) → accounts link
- [ ] Apple (web) sign-in completes
- [ ] Facebook sign-in completes
- [ ] Supabase → Authentication → Users → provider column populated correctly
- [ ] Any new app's origin added to Redirect URLs before it goes live

## Notes

- One Google consent screen means verification status is ecosystem-wide.
- Native iOS "Sign in with Apple" and Android Google Sign-In are configured
  **per app** later, when native builds ship — they don't affect this web setup.
- Keeping this file in the ecosystem means "FreeSurf" branding stays consistent.
