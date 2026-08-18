# Static blog generator — setup

This fixes the SEO/crawler problem by generating real, static HTML for every
blog post (title, meta tags, and content baked into the markup) instead of
relying on the browser to fetch it from Firestore after the page loads.

## What changes

- New URL structure: posts live at `/blog/<slug>/` instead of
  `/blog-post?slug=<slug>`. This is required because GitHub Pages can't serve
  different pre-rendered content based on a query string — it can only serve
  distinct files/folders.
- `/blog/index.html` becomes a static, generated listing page (replaces the
  old `blog.html`).
- A `sitemap.xml` is generated automatically listing `/`, `/blog/`, and every
  post.
- `admin-blog.html` and Firestore itself are untouched — you keep publishing
  posts exactly the same way. This just adds a generation step after.

## One-time setup

1. **Copy these files into your GitHub Pages repo, at the repo root:**
   - `scripts/generate-blog.js`
   - `.github/workflows/generate-blog.yml`

2. **Remove or rename the old `blog.html`** at the repo root, so it doesn't
   conflict with the new `/blog/` directory. (Your existing `blog-post.html`
   can stay — it won't conflict, since it's a different filename. Old
   `?slug=` links will keep working as a fallback, they just won't be the
   pre-rendered version.)

3. **Update internal links** that point to `/blog` to point to `/blog/`
   (trailing slash) instead — e.g. in `index.html`'s nav, and any "All posts"
   links. Functionally these usually resolve the same way, but the trailing
   slash avoids ambiguity with GitHub Pages' routing.

4. **Commit and push.** Once the workflow file is in `.github/workflows/`,
   GitHub will pick it up automatically — no extra setup, secrets, or paid
   plan needed. It uses your Firestore project's public read access (same as
   your existing pages already use client-side).

5. **Run it once manually** to generate the initial pages:
   - Go to your repo → **Actions** tab → **Generate static blog pages** →
     **Run workflow** → **Run workflow** (green button).
   - Wait ~30 seconds, refresh the Actions tab, confirm it succeeded.
   - Check your repo — you should now see a new `blog/` folder with an
     `index.html` and one folder per published post.

6. **Verify live:** once GitHub Pages redeploys (usually under a minute),
   visit `friendhub.space/blog/` and `friendhub.space/blog/<your-slug>/` —
   both should show real content immediately, with **JavaScript disabled**,
   confirming crawlers will see it too.

## After that

- The workflow re-runs automatically every 30 minutes and picks up any newly
  published (or edited/unpublished) posts from Firestore.
- You can also trigger it manually anytime right after publishing, from the
  Actions tab, instead of waiting for the next scheduled run.
- Submit `friendhub.space/sitemap.xml` in Google Search Console once it
  exists, so Google discovers all your posts faster.
