#!/usr/bin/env node

/**
 * generate-blog.js
 *
 * Generates static HTML pages from Firestore blogPosts.
 *
 * Run:
 *   node scripts/generate-blog.js
 */

const fs = require("fs");
const path = require("path");

const PROJECT_ID = "friendhub-9f934";
const API_KEY = "AIzaSyAGq-OE8k2tfF0xIQHMYWIfAQ4JVS69gKs";
const SITE_URL = "https://www.friendhub.space";

const OUT_ROOT = path.join(__dirname, "..");
const BLOG_ROOT = path.join(OUT_ROOT, "blog");

const FIRESTORE_BASE =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/* =========================================================
   FIRESTORE
========================================================= */

function fsValueToJs(value) {
  if (value == null) return null;

  if ("stringValue" in value) return value.stringValue;

  if ("integerValue" in value) {
    return parseInt(value.integerValue, 10);
  }

  if ("doubleValue" in value) {
    return value.doubleValue;
  }

  if ("booleanValue" in value) {
    return value.booleanValue;
  }

  if ("timestampValue" in value) {
    return new Date(value.timestampValue);
  }

  if ("nullValue" in value) {
    return null;
  }

  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(fsValueToJs);
  }

  if ("mapValue" in value) {
    return fsFieldsToJs(value.mapValue.fields || {});
  }

  return null;
}

function fsFieldsToJs(fields) {
  const output = {};

  for (const [key, value] of Object.entries(fields || {})) {
    output[key] = fsValueToJs(value);
  }

  return output;
}

async function fetchAllPosts() {
  const posts = [];
  let pageToken = null;

  do {
    const url = new URL(`${FIRESTORE_BASE}/blogPosts`);

    url.searchParams.set("key", API_KEY);
    url.searchParams.set("pageSize", "300");

    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      const body = await response.text();

      throw new Error(
        `Firestore request failed: ${response.status}\n${body}`
      );
    }

    const data = await response.json();

    for (const document of data.documents || []) {
      const post = fsFieldsToJs(document.fields || {});

      /*
       * Keep the Firestore document name as a fallback.
       * This helps if an old post does not have a slug field.
       */
      if (!post.slug && document.name) {
        post.slug = document.name.split("/").pop();
      }

      posts.push(post);
    }

    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return posts;
}

/* =========================================================
   HELPERS
========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readMinutes(html) {
  const text = stripHtml(html);
  const words = text ? text.split(/\s+/).length : 0;

  return Math.max(1, Math.round(words / 200));
}

function formatDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function toDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 120);
}

function getSlug(post) {
  return (
    slugify(post.slug) ||
    slugify(post.title) ||
    `post-${Date.now()}`
  );
}

/*
 * Supports the most common Firestore publishing fields.
 *
 * If your documents use:
 *   published: true
 *   status: "published"
 *   publishedAt: timestamp
 *
 * this will correctly include them.
 */
function isPublished(post) {
  if (post.published === true) {
    return true;
  }

  if (String(post.status || "").toLowerCase() === "published") {
    return true;
  }

  if (post.isPublished === true) {
    return true;
  }

  /*
   * If there is a publishedAt date, consider it published.
   * This makes the generator compatible with systems that only
   * store publishedAt.
   */
  if (post.publishedAt instanceof Date) {
    return !Number.isNaN(post.publishedAt.getTime());
  }

  return false;
}

/* =========================================================
   DESIGN
========================================================= */

const BASE_STYLE = `
:root{
  --bg:#0B0F1A;
  --bg-2:#0E1424;
  --panel:#121A2C;
  --panel-2:#0D1322;
  --line:#212C42;
  --text:#EDE7DA;
  --muted:#8B96AC;
  --violet:#9C8CFB;
  --violet-dim:#5142C4;
  --mint:#5EEAD4;
  --amber:#FFB84D;
}

*{
  box-sizing:border-box;
}

html{
  scroll-behavior:smooth;
}

body{
  margin:0;
  background:var(--bg);
  color:var(--text);
  font-family:'Inter',sans-serif;
  -webkit-font-smoothing:antialiased;
}

a{
  color:inherit;
}

body::before{
  content:"";
  position:fixed;
  inset:0;
  z-index:-1;
  pointer-events:none;
  background:
    radial-gradient(
      640px 420px at 12% -6%,
      rgba(156,140,251,0.16),
      transparent 60%
    ),
    radial-gradient(
      560px 380px at 96% 8%,
      rgba(94,234,212,0.10),
      transparent 60%
    ),
    var(--bg);
}

nav.topnav{
  position:sticky;
  top:0;
  z-index:50;
  background:rgba(11,15,26,0.78);
  backdrop-filter:blur(10px);
  border-bottom:1px solid var(--line);
}

.topnav-inner{
  max-width:1100px;
  margin:0 auto;
  padding:16px 24px;
  display:flex;
  align-items:center;
  justify-content:space-between;
}

.brand{
  display:flex;
  align-items:center;
  gap:10px;
  text-decoration:none;
}

.brand svg{
  width:30px;
  height:30px;
  flex-shrink:0;
}

.brand span{
  font-family:'Space Grotesk',sans-serif;
  font-weight:700;
  font-size:18px;
  letter-spacing:-0.01em;
  color:#fff;
}

.brand span em{
  font-style:normal;
  color:var(--mint);
}

.topnav a.back{
  display:inline-flex;
  align-items:center;
  gap:7px;
  text-decoration:none;
  color:var(--muted);
  font-size:13.5px;
  font-weight:500;
  padding:8px 14px;
  border-radius:20px;
  border:1px solid var(--line);
}

.topnav a.back:hover{
  color:var(--text);
  border-color:var(--violet-dim);
  background:rgba(156,140,251,0.06);
}

.topnav a.back svg{
  width:14px;
  height:14px;
}

footer.site-footer{
  border-top:1px solid var(--line);
  padding:28px 24px;
  text-align:center;
  color:var(--muted);
  font-size:12.5px;
}

.tag-pill{
  font-family:'IBM Plex Mono',monospace;
  font-size:10.5px;
  color:var(--violet);
  background:rgba(156,140,251,0.1);
  border:1px solid rgba(156,140,251,0.2);
  padding:3px 9px;
  border-radius:20px;
  letter-spacing:.02em;
}
`;

const LOGO_SVG = `
<svg viewBox="0 0 100 100"
     xmlns="http://www.w3.org/2000/svg"
     aria-hidden="true">

  <defs>
    <linearGradient
      id="navBgGrad"
      x1="0%"
      y1="0%"
      x2="100%"
      y2="100%"
    >
      <stop offset="0%" stop-color="#9C8CFB"/>
      <stop offset="100%" stop-color="#5142C4"/>
    </linearGradient>
  </defs>

  <rect
    x="0"
    y="0"
    width="100"
    height="100"
    rx="22"
    fill="url(#navBgGrad)"
  />

  <path
    d="M14,44 a22,22 0 1,1 22,26 l-7,10 l-2,-12 a22,22 0 0,1 -13,-24 z"
    fill="#FFFFFF"
  />

  <path
    d="M86,48 a22,22 0 1,0 -22,26 l7,10 l2,-12 a22,22 0 0,0 13,-24 z"
    fill="#5EEAD4"
    fill-opacity="0.88"
  />

  <path
    d="M79,17 l2.6,6.4 6.4,2.6 -6.4,2.6 -2.6,6.4 -2.6,-6.4 -6.4,-2.6 6.4,-2.6 z"
    fill="#FFB84D"
  />

</svg>
`;

const FONTS = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link
  href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
  rel="stylesheet"
>
`;

const FAVICON_TAG = `
<link
  rel="icon"
  type="image/svg+xml"
  href="data:image/svg+xml,${encodeURIComponent(LOGO_SVG)}"
>
`;

function navBar(backHref, backLabel) {
  return `
<nav class="topnav">
  <div class="topnav-inner">

    <a class="brand" href="/">
      ${LOGO_SVG}
      <span>Friend<em>Hub</em></span>
    </a>

    <a href="${escapeHtml(backHref)}" class="back">

      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M19 12H5"/>
        <path d="M12 19l-7-7 7-7"/>
      </svg>

      ${escapeHtml(backLabel)}

    </a>

  </div>
</nav>
`;
}

function siteFooter() {
  return `
<footer class="site-footer">
  © ${new Date().getFullYear()} FriendHub. All rights reserved.
</footer>
`;
}

/* =========================================================
   BLOG POST PAGE
========================================================= */

function renderPostPage(post) {
  const title = post.title || "FriendHub Blog";

  const metaTitle =
    post.metaTitle ||
    title;

  const metaDescription =
    post.metaDescription ||
    post.excerpt ||
    "";

  const slug = getSlug(post);

  const url =
    `${SITE_URL}/blog/${encodeURIComponent(slug)}/`;

  const dateObj =
    toDate(post.publishedAt);

  const dateStr =
    formatDate(dateObj);

  const tags =
    Array.isArray(post.tags)
      ? post.tags.slice(0, 5)
      : [];

  const content =
    post.content || "";

  const coverImage =
    post.coverImageUrl ||
    "";

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": title,
    "description": metaDescription,
    "url": url,
    "datePublished": dateObj
      ? dateObj.toISOString()
      : undefined,
    "author": {
      "@type": "Organization",
      "name": "FriendHub"
    },
    "publisher": {
      "@type": "Organization",
      "name": "FriendHub",
      "url": `${SITE_URL}/`
    }
  };

  if (coverImage) {
    articleLd.image = coverImage;
  }

  const coverBlock = coverImage
    ? `
<div class="post-cover">
  <img
    src="${escapeHtml(coverImage)}"
    alt="${escapeHtml(title)}"
  >
</div>
`
    : "";

  return `<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

${FAVICON_TAG}

<title>
${escapeHtml(metaTitle)} — FriendHub Blog
</title>

<meta
  name="description"
  content="${escapeHtml(metaDescription)}"
>

<meta
  name="robots"
  content="index, follow, max-image-preview:large"
>

<meta name="author" content="FriendHub">

<link
  rel="canonical"
  href="${escapeHtml(url)}"
>

<meta
  property="og:type"
  content="article"
>

<meta
  property="og:site_name"
  content="FriendHub"
>

<meta
  property="og:title"
  content="${escapeHtml(metaTitle)}"
>

<meta
  property="og:description"
  content="${escapeHtml(metaDescription)}"
>

<meta
  property="og:url"
  content="${escapeHtml(url)}"
>

<meta
  property="og:image"
  content="${escapeHtml(
    coverImage || `${SITE_URL}/og-image.png`
  )}"
>

<meta
  property="og:locale"
  content="en_US"
>

<meta
  name="twitter:card"
  content="summary_large_image"
>

<meta
  name="twitter:title"
  content="${escapeHtml(metaTitle)}"
>

<meta
  name="twitter:description"
  content="${escapeHtml(metaDescription)}"
>

<meta
  name="twitter:image"
  content="${escapeHtml(
    coverImage || `${SITE_URL}/og-image.png`
  )}"
>

<script type="application/ld+json">
${JSON.stringify(articleLd)}
</script>

${FONTS}

<style>

${BASE_STYLE}

main{
  max-width:760px;
  margin:0 auto;
  padding:52px 24px 100px;
}

.post-tags{
  display:flex;
  gap:6px;
  flex-wrap:wrap;
  margin-bottom:18px;
}

.post-title{
  font-family:'Space Grotesk',sans-serif;
  font-size:clamp(28px,5vw,42px);
  font-weight:700;
  letter-spacing:-0.02em;
  line-height:1.12;
  margin:0 0 16px;
  background:linear-gradient(
    100deg,
    #fff 40%,
    var(--violet) 100%
  );
  -webkit-background-clip:text;
  background-clip:text;
  color:transparent;
}

.post-meta{
  display:flex;
  align-items:center;
  gap:10px;
  font-family:'IBM Plex Mono',monospace;
  font-size:12.5px;
  color:var(--muted);
  margin-bottom:28px;
}

.post-meta .dot-sep{
  width:3px;
  height:3px;
  border-radius:50%;
  background:var(--muted);
  flex-shrink:0;
}

.post-cover{
  width:100%;
  border-radius:14px;
  overflow:hidden;
  border:1px solid var(--line);
  margin-bottom:34px;
  background:var(--panel-2);
}

.post-cover img{
  width:100%;
  display:block;
  object-fit:cover;
  max-height:420px;
}

.post-body{
  font-size:16.5px;
  line-height:1.75;
  color:#DCD6C9;
}

.post-body h2{
  font-family:'Space Grotesk',sans-serif;
  color:#fff;
  font-size:24px;
  margin:36px 0 14px;
}

.post-body h3{
  font-family:'Space Grotesk',sans-serif;
  color:#fff;
  font-size:19px;
  margin:28px 0 12px;
}

.post-body p{
  margin:0 0 18px;
}

.post-body a{
  color:var(--mint);
  text-decoration:underline;
  text-underline-offset:2px;
}

.post-body ul,
.post-body ol{
  margin:0 0 18px;
  padding-left:22px;
}

.post-body li{
  margin-bottom:8px;
}

.post-body strong{
  color:#fff;
}

.post-body img{
  max-width:100%;
  height:auto;
  border-radius:10px;
  margin:10px 0;
}

.post-body blockquote{
  margin:22px 0;
  padding:4px 20px;
  border-left:3px solid var(--violet);
  color:var(--muted);
  font-style:italic;
}

.post-body code{
  background:var(--panel-2);
  border:1px solid var(--line);
  border-radius:5px;
  padding:2px 6px;
  font-size:.9em;
  font-family:'IBM Plex Mono',monospace;
}

.post-footer{
  margin-top:56px;
  padding-top:28px;
  border-top:1px solid var(--line);
  text-align:center;
}

.post-footer a.cta{
  display:inline-flex;
  align-items:center;
  gap:8px;
  text-decoration:none;
  color:#fff;
  font-weight:600;
  font-size:14.5px;
  background:linear-gradient(
    135deg,
    var(--violet),
    var(--violet-dim)
  );
  padding:12px 24px;
  border-radius:999px;
}

@media(max-width:520px){

  .topnav-inner{
    padding:14px 18px;
  }

  main{
    padding:36px 18px 80px;
  }

}

</style>

</head>

<body>

${navBar("/blog/", "All posts")}

<main>

<article>

<div class="post-tags">
${tags
  .map(
    tag =>
      `<span class="tag-pill">${escapeHtml(tag)}</span>`
  )
  .join("")}
</div>

<h1 class="post-title">
${escapeHtml(title)}
</h1>

<div class="post-meta">

<span>
${escapeHtml(dateStr)}
</span>

<span class="dot-sep"></span>

<span>
${readMinutes(content)} min read
</span>

</div>

${coverBlock}

<div class="post-body">
${content}
</div>

<div class="post-footer">

<a
  class="cta"
  href="/"
>
Start a chat on FriendHub →
</a>

</div>

</article>

</main>

${siteFooter()}

</body>

</html>`;
}

/* =========================================================
   BLOG INDEX
========================================================= */

function renderIndexPage(posts) {
  const cards = posts
    .map(post => {

      const slug =
        getSlug(post);

      const title =
        post.title || "FriendHub Blog";

      const excerpt =
        post.excerpt || "";

      const dateStr =
        formatDate(toDate(post.publishedAt));

      const cover =
        post.coverImageUrl
          ? `
<div class="cover-wrap">

<img
  class="cover"
  src="${escapeHtml(post.coverImageUrl)}"
  alt="${escapeHtml(title)}"
  loading="lazy"
>

</div>
`
          : "";

      const tags =
        Array.isArray(post.tags)
          ? post.tags
              .slice(0, 3)
              .map(
                tag =>
                  `<span class="tag-pill">${escapeHtml(tag)}</span>`
              )
              .join("")
          : "";

      return `
<article>

<a
  class="card"
  href="/blog/${encodeURIComponent(slug)}/"
>

<span class="accent-bar"></span>

${cover}

<div class="card-body">

<div class="card-tags">
${tags}
</div>

<h2>
${escapeHtml(title)}
</h2>

<p>
${escapeHtml(excerpt)}
</p>

<div class="card-meta">

<span>
${escapeHtml(dateStr)}
</span>

<span class="dot-sep"></span>

<span>
${readMinutes(post.content || "")} min read
</span>

<span class="read-link">
Read →
</span>

</div>

</div>

</a>

</article>
`;
    })
    .join("\n");

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "itemListElement": posts.map((post, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "url":
        `${SITE_URL}/blog/${encodeURIComponent(getSlug(post))}/`,
      "name": post.title || "FriendHub Blog"
    }))
  };

  const blogLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "name": "FriendHub Blog",
    "url": `${SITE_URL}/blog/`,
    "description":
      "Guides, safety tips, and updates from FriendHub — the free random video chat platform for meeting new people.",
    "publisher": {
      "@type": "Organization",
      "name": "FriendHub",
      "url": `${SITE_URL}/`
    }
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": `${SITE_URL}/`
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Blog",
        "item": `${SITE_URL}/blog/`
      }
    ]
  };

  const emptyBlock =
    posts.length === 0
      ? `
<div class="empty">
No posts published yet — check back soon.
</div>
`
      : "";

  return `<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

${FAVICON_TAG}

<title>
Blog — FriendHub | Video Chat Tips, Safety & Updates
</title>

<meta
  name="description"
  content="Guides, safety tips, and updates from FriendHub — the free random video chat platform for meeting new people."
>

<meta
  name="robots"
  content="index, follow, max-image-preview:large"
>

<meta name="author" content="FriendHub">

<link
  rel="canonical"
  href="${SITE_URL}/blog/"
>

<meta
  property="og:type"
  content="website"
>

<meta
  property="og:site_name"
  content="FriendHub"
>

<meta
  property="og:title"
  content="FriendHub Blog — Video Chat Tips, Safety & Updates"
>

<meta
  property="og:description"
  content="Guides, safety tips, and updates from FriendHub — the free random video chat platform for meeting new people."
>

<meta
  property="og:url"
  content="${SITE_URL}/blog/"
>

<meta
  property="og:image"
  content="${SITE_URL}/og-image.png"
>

<meta
  property="og:locale"
  content="en_US"
>

<meta
  name="twitter:card"
  content="summary_large_image"
>

<meta
  name="twitter:title"
  content="FriendHub Blog — Video Chat Tips, Safety & Updates"
>

<meta
  name="twitter:description"
  content="Guides, safety tips, and updates from FriendHub."
>

<meta
  name="twitter:image"
  content="${SITE_URL}/og-image.png"
>

<script type="application/ld+json">
${JSON.stringify(blogLd)}
</script>

<script type="application/ld+json">
${JSON.stringify(breadcrumbLd)}
</script>

<script type="application/ld+json">
${JSON.stringify(itemListLd)}
</script>

${FONTS}

<style>

${BASE_STYLE}

header.hero{
  max-width:1100px;
  margin:0 auto;
  padding:64px 24px 44px;
}

header.hero .eyebrow{
  display:inline-flex;
  align-items:center;
  gap:7px;
  font-family:'IBM Plex Mono',monospace;
  font-size:11.5px;
  letter-spacing:.06em;
  color:var(--mint);
  background:rgba(94,234,212,.08);
  border:1px solid rgba(94,234,212,.28);
  padding:5px 12px;
  border-radius:20px;
  margin-bottom:20px;
}

header.hero .eyebrow .dot{
  width:6px;
  height:6px;
  border-radius:50%;
  background:var(--mint);
  box-shadow:0 0 6px var(--mint);
}

header.hero h1{
  font-family:'Space Grotesk',sans-serif;
  font-size:clamp(34px,6vw,56px);
  margin:0 0 14px;
  font-weight:700;
  letter-spacing:-.02em;
  line-height:1.05;
  background:linear-gradient(
    100deg,
    #fff 40%,
    var(--violet) 100%
  );
  -webkit-background-clip:text;
  background-clip:text;
  color:transparent;
}

header.hero p{
  color:var(--muted);
  font-size:16px;
  max-width:540px;
  line-height:1.65;
  margin:0;
}

header.hero .rule{
  margin-top:40px;
  height:1px;
  background:linear-gradient(
    90deg,
    var(--line),
    transparent
  );
}

main{
  max-width:1100px;
  margin:0 auto;
  padding:8px 24px 90px;
}

.grid{
  display:grid;
  grid-template-columns:
    repeat(auto-fill,minmax(310px,1fr));
  gap:22px;
  margin-top:36px;
}

.card{
  background:
    linear-gradient(
      180deg,
      var(--panel),
      var(--panel-2)
    );
  border:1px solid var(--line);
  border-radius:14px;
  overflow:hidden;
  text-decoration:none;
  display:flex;
  flex-direction:column;
  position:relative;
  height:100%;
}

.card:hover{
  border-color:rgba(156,140,251,.4);
}

.card .accent-bar{
  position:absolute;
  top:0;
  left:0;
  width:3px;
  height:100%;
  background:
    linear-gradient(
      180deg,
      var(--violet),
      var(--mint)
    );
  opacity:0;
}

.card:hover .accent-bar{
  opacity:1;
}

.card .cover-wrap{
  position:relative;
  width:100%;
  height:172px;
  background:var(--panel-2);
  overflow:hidden;
}

.card img.cover{
  width:100%;
  height:100%;
  object-fit:cover;
  display:block;
}

.card-body{
  padding:19px 21px 21px;
  flex:1;
  display:flex;
  flex-direction:column;
}

.card-tags{
  display:flex;
  gap:6px;
  flex-wrap:wrap;
  margin-bottom:11px;
}

.card h2{
  font-family:'Space Grotesk',sans-serif;
  font-size:18.5px;
  margin:0 0 9px;
  line-height:1.32;
  font-weight:600;
  color:#fff;
}

.card p{
  color:var(--muted);
  font-size:13.5px;
  line-height:1.62;
  margin:0 0 16px;
  flex:1;
}

.card-meta{
  display:flex;
  align-items:center;
  gap:10px;
  font-family:'IBM Plex Mono',monospace;
  font-size:11.5px;
  color:var(--muted);
  border-top:1px solid var(--line);
  padding-top:13px;
}

.card-meta .dot-sep{
  width:3px;
  height:3px;
  border-radius:50%;
  background:var(--muted);
  flex-shrink:0;
}

.card-meta .read-link{
  margin-left:auto;
  color:var(--mint);
}

.empty{
  text-align:center;
  color:var(--muted);
  padding:70px 20px;
  font-size:14px;
  border:1px dashed var(--line);
  border-radius:14px;
  margin-top:36px;
}

@media(max-width:520px){

  .topnav-inner{
    padding:14px 18px;
  }

  header.hero{
    padding:44px 18px 32px;
  }

  main{
    padding:8px 18px 70px;
  }

  .grid{
    grid-template-columns:1fr;
  }

}

</style>

</head>

<body>

${navBar("/", "Back to app")}

<header class="hero">

<span class="eyebrow">
  <span class="dot"></span>
  FROM THE TEAM
</span>

<h1>
The FriendHub Blog
</h1>

<p>
Notes on meeting people online safely,
making the most of random video chat,
and what we're building next.
</p>

<div class="rule"></div>

</header>

<main>

<section
  class="grid"
  aria-label="Blog posts"
>

${cards}

</section>

${emptyBlock}

</main>

${siteFooter()}

</body>

</html>`;
}

/* =========================================================
   SITEMAP
========================================================= */

function renderSitemap(posts) {
  const urls = [
    {
      loc: `${SITE_URL}/`,
      priority: "1.0"
    },
    {
      loc: `${SITE_URL}/blog/`,
      priority: "0.8"
    }
  ];

  for (const post of posts) {
    const slug = getSlug(post);
    const date = toDate(post.publishedAt);

    urls.push({
      loc:
        `${SITE_URL}/blog/${encodeURIComponent(slug)}/`,
      lastmod:
        date
          ? date.toISOString().slice(0, 10)
          : undefined,
      priority: "0.6"
    });
  }

  const entries = urls
    .map(url => `
  <url>
    <loc>${escapeXml(url.loc)}</loc>
    ${
      url.lastmod
        ? `<lastmod>${url.lastmod}</lastmod>`
        : ""
    }
    <changefreq>weekly</changefreq>
    <priority>${url.priority}</priority>
  </url>
`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>

<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
>

${entries}

</urlset>
`;
}

/* =========================================================
   GENERATE FILES
========================================================= */

async function main() {
  console.log("======================================");
  console.log(" FriendHub Blog Generator");
  console.log("======================================");

  console.log("Fetching blog posts from Firestore...");

  const allPosts =
    await fetchAllPosts();

  console.log(
    `Found ${allPosts.length} Firestore document(s).`
  );

  /*
   * Only generate published posts.
   */
  const posts =
    allPosts
      .filter(isPublished)
      .map(post => ({
        ...post,
        slug: getSlug(post),
        publishedAt: toDate(post.publishedAt)
      }))
      .sort((a, b) => {
        const aTime =
          a.publishedAt
            ? a.publishedAt.getTime()
            : 0;

        const bTime =
          b.publishedAt
            ? b.publishedAt.getTime()
            : 0;

        return bTime - aTime;
      });

  console.log(
    `Published posts: ${posts.length}`
  );

  /*
   * Create /blog if it does not exist.
   */
  fs.mkdirSync(
    BLOG_ROOT,
    { recursive: true }
  );

  /*
   * Generate blog index.
   */
  const indexPath =
    path.join(BLOG_ROOT, "index.html");

  fs.writeFileSync(
    indexPath,
    renderIndexPage(posts),
    "utf8"
  );

  console.log(
    `Generated: ${path.relative(OUT_ROOT, indexPath)}`
  );

  /*
   * Generate every post page.
   */
  for (const post of posts) {
    const postDir =
      path.join(
        BLOG_ROOT,
        post.slug
      );

    fs.mkdirSync(
      postDir,
      { recursive: true }
    );

    const postPath =
      path.join(
        postDir,
        "index.html"
      );

    fs.writeFileSync(
      postPath,
      renderPostPage(post),
      "utf8"
    );

    console.log(
      `Generated: ${path.relative(OUT_ROOT, postPath)}`
    );
  }

  /*
   * Generate sitemap.
   */
  const sitemapPath =
    path.join(
      OUT_ROOT,
      "sitemap.xml"
    );

  fs.writeFileSync(
    sitemapPath,
    renderSitemap(posts),
    "utf8"
  );

  console.log(
    `Generated: ${path.relative(OUT_ROOT, sitemapPath)}`
  );

  console.log("");
  console.log("======================================");
  console.log(" DONE");
  console.log("======================================");
  console.log(
    `Published posts generated: ${posts.length}`
  );
  console.log(
    `Blog index: ${SITE_URL}/blog/`
  );
  console.log(
    `Sitemap: ${SITE_URL}/sitemap.xml`
  );
}

main().catch(error => {
  console.error("");
  console.error("BLOG GENERATION FAILED");
  console.error(error);
  process.exit(1);
});
