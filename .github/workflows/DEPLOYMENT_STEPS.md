# Deployment Setup for cnxt-to-post

## Prerequisites

### 1. Cloudflare Secrets Required
Add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

```
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token
```

To generate this token:
1. Go to Cloudflare Dashboard → My Profile → API Tokens
2. Create a token with permissions:
   - Account - Cloudflare Pages - Edit
   - Account - Workers Scripts - Edit
3. Use Account ID: `f36a642be747735c06e3772bd879ce50`

### 2. Supabase Setup
Run the database schema:
```bash
# Go to Supabase Dashboard → SQL Editor
# Paste and run: supabase/setup.sql
```

### 3. Environment Variables (Cloudflare Pages)
Set these in Cloudflare Pages → Settings → Environment Variables:

```
SUPABASE_URL=your-supabase-project-url
SUPABASE_ANON_KEY=your-supabase-anon-key
ENCRYPTION_KEY=your-32-byte-encryption-key-hex
```

For the API Worker (Cloudflare Workers):

```
SUPABASE_URL=your-supabase-project-url
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
ENCRYPTION_KEY=your-32-byte-encryption-key-hex

# OAuth Client IDs and Secrets
LINKEDIN_CLIENT_ID=your-linkedin-client-id
LINKEDIN_CLIENT_SECRET=your-linkedin-client-secret
FACEBOOK_CLIENT_ID=your-facebook-client-id
FACEBOOK_CLIENT_SECRET=your-facebook-client-secret
INSTAGRAM_CLIENT_ID=your-instagram-client-id
INSTAGRAM_CLIENT_SECRET=your-instagram-client-secret
THREADS_CLIENT_ID=your-threads-client-id
THREADS_CLIENT_SECRET=your-threads-client-secret
TIKTOK_CLIENT_ID=your-tiktok-client-id
TIKTOK_CLIENT_SECRET=your-tiktok-client-secret
X_API_KEY=your-x-api-key
X_API_SECRET=your-x-api-secret
```

### 4. OAuth App Registration
Register these apps with each platform:

| Platform | Developer Portal | Callback URL |
|----------|-----------------|--------------|
| Bluesky | blueskyweb.dev | Not needed (uses app password) |
| X (Twitter) | developer.twitter.com | `https://post.freesurf.tools/api/auth/callback/x` |
| LinkedIn | developer.linkedin.com | `https://post.freesurf.tools/api/auth/callback/linkedin` |
| Facebook | developers.facebook.com | `https://post.freesurf.tools/api/auth/callback/facebook` |
| Instagram | developers.facebook.com | `https://post.freesurf.tools/api/auth/callback/instagram` |
| Threads | developers.facebook.com | `https://post.freesurf.tools/api/auth/callback/threads` |
| TikTok | developers.tiktok.com | `https://post.freesurf.tools/api/auth/callback/tiktok` |

## Deployment Flow

### Automatic Deployment
When you push to `main` branch, GitHub Actions automatically:
1. Deploys dashboard to Cloudflare Pages (if dashboard/ changed)
2. Deploys API worker to Cloudflare Workers (if src/ changed)

### Manual Deployment

#### Deploy Dashboard:
```bash
cd cnxt-to-post
npx wrangler pages deploy dashboard --project-name post-cnxt-dashboard
```

#### Deploy Worker:
```bash
cd cnxt-to-post
npm install
npx wrangler deploy
```

## First-Time Setup Checklist

- [ ] Add `CLOUDFLARE_API_TOKEN` to GitHub secrets
- [ ] Run `supabase/setup.sql` in Supabase SQL Editor
- [ ] Add environment variables to Cloudflare Pages (dashboard)
- [ ] Add environment variables to Cloudflare Workers (API)
- [ ] Register OAuth apps for all platforms
- [ ] Test the dashboard at `https://post.freesurf.tools/`
- [ ] Test OAuth flow for each platform
- [ ] Test API endpoints

## Local Development

### Dashboard:
```bash
cd dashboard
python -m http.server 8080
# Open http://localhost:8080
```

### API Worker:
```bash
npm install
npx wrangler dev
# Test at http://localhost:8787
```

## Troubleshooting

### "Invalid API token"
- Verify CLOUDFLARE_API_TOKEN has correct permissions
- Check Account ID matches: `f36a642be747735c06e3772bd879ce50`

### "Supabase connection failed"
- Verify SUPABASE_URL is correct
- Check that service_role key (not anon key) is used for API worker

### "OAuth callback error"
- Verify callback URLs match in developer portals exactly
- Check that OAuth apps are in "Live" mode (not sandbox)

### "Token decryption failed"
- Ensure ENCRYPTION_KEY matches between dashboard and worker
- Generate new key: `openssl rand -hex 32`