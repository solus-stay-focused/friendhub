#!/usr/bin/env node

/**
 * generate-blog.js
 *
 * Generates static blog pages from Firestore.
 *
 * IMPORTANT:
 * The current blog-post.html is used as the design template.
 * This means generated posts keep the same design as your current
 * FriendHub blog page instead of using the old generator design.
 */

const fs = require("fs");
const path = require("path");

const PROJECT_ID = "friendhub-9f934";
const API_KEY = "AIzaSyAGq-OE8k2tfF0xIQHMYWIfAQ4JVS69gKs";
const SITE_URL = "https://www.friendhub.space";

const ROOT = path.join(__dirname, "..");
const TEMPLATE_FILE = path.join(ROOT, "blog-post.html");
const BLOG_DIR = path.join(ROOT, "blog");

const FIRESTORE_BASE =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;


/* =========================================================
   FIRESTORE
   ========================================================= */

function fsValueToJs(value) {
  if (value == null) return null;

  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return parseInt(value.integerValue, 10);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return new Date(value.timestampValue);
  if ("nullValue" in value) return null;

  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(fsValueToJs);
  }

  if ("mapValue" in value) {
    return fsFieldsToJs(value.mapValue.fields || {});
  }

  return null;
}


function fsFieldsToJs(fields) {
  const out = {};

  for (const [key, value] of Object.entries(fields || {})) {
    out[key] = fsValueToJs(value);
  }

  return out;
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

    const res = await fetch(url.toString());

    if (!res.ok) {
      const body = await res.text();

      throw new Error(
        `Firestore fetch failed: ${res.status} ${body}`
      );
    }

    const data = await res.json();

    for (const doc of data.documents || []) {
      posts.push(fsFieldsToJs(doc.fields));
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


function readMinutes(html) {
  const words = String(html || "")
    .replace(/<[^>]*>/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .length;

  return Math.max(1, Math.round(words / 200));
}


function formatDate(value) {
  if (!value) return "";

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}


function safeJsonLd(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}


/**
 * Removes Firebase-related <script> tags from the generated static page.
 *
 * IMPORTANT: this replaces the old approach, which used a single regex
 * with an unbounded `[\s\S]*?` that could span across MULTIPLE <script>
 * tags (and everything in between them — nav, main, footer, etc.) before
 * finding a keyword like "initializeApp" further down the page. That bug
 * deleted the entire visible body of every generated post/index page.
 *
 * This version instead matches ONE <script>...</script> block at a time
 * (a real script tag's content can never contain a literal "</script>",
 * so this can't cross tag boundaries) and only removes a given block if
 * ITS OWN content references Firebase. The JSON-LD structured-data
 * script is explicitly left alone.
 */
function stripFirebaseScripts(html) {
  // Remove the external Firebase SDK includes:
  // <script src="https://www.gstatic.com/firebasejs/.../firebase-....js"></script>
  // These are self-closed (no content between open/close tags), so this
  // is safe and can't accidentally span into other tags.
  html = html.replace(/<script[^>]+firebase[^>]*><\/script>/gi, "");

  // Remove any remaining inline <script>...</script> block whose OWN
  // content references Firebase setup/usage. Matched one tag at a time.
  html = html.replace(
    /<script([^>]*)>([\s\S]*?)<\/script>/gi,
    (match, attrs, inner) => {
      // Never touch the JSON-LD structured data script.
      if (/application\/ld\+json/i.test(attrs)) {
        return match;
      }

      if (/firebaseConfig|initializeApp|firebase\.firestore|onSnapshot|docSnap/.test(inner)) {
        return "";
      }

      return match;
    }
  );

  return html;
}


/* =========================================================
   TEMPLATE
   ========================================================= */

function loadTemplate() {
  if (!fs.existsSync(TEMPLATE_FILE)) {
    throw new Error(
      `blog-post.html was not found at: ${TEMPLATE_FILE}`
    );
  }

  return fs.readFileSync(TEMPLATE_FILE, "utf8");
}


/* =========================================================
   STATIC ARTICLE CONTENT
   ========================================================= */

function buildStaticMain(post) {

  const title = post.title || "FriendHub Blog";

  const date = formatDate(post.publishedAt);

  const content = post.content || "";

  const tags = Array.isArray(post.tags)
    ? post.tags.slice(0, 5)
    : [];


  const tagsHtml = tags
    .map(
      tag =>
        `<span class="tag">${escapeHtml(tag)}</span>`
    )
    .join("");


  const coverHtml = post.coverImageUrl
    ? `
  <div class="cover" id="cover">
    <img
      id="coverImg"
      src="${escapeHtml(post.coverImageUrl)}"
      alt="${escapeHtml(title)}"
    >
  </div>
`
    : "";


  return `
<main>

  <article id="article" class="show">

    <div class="article-head">

      <div class="kicker">
        FRIENDHUB BLOG
      </div>

      <div class="tags" id="tags">
        ${tagsHtml}
      </div>

      <h1 class="title" id="title">
        ${escapeHtml(title)}
      </h1>

      <div class="meta">

        <span id="date">
          ${escapeHtml(date)}
        </span>

        <span class="sep"></span>

        <span id="read">
          ${readMinutes(content)} min read
        </span>

      </div>

    </div>

    ${coverHtml}

    <div class="body" id="body">
      ${content}
    </div>

    <div class="end">

      <a href="/blog/">
        ← More from the FriendHub Blog
      </a>

      <a href="/">
        Go to FriendHub →
      </a>

    </div>

  </article>

</main>
`;
}


/* =========================================================
   GENERATE POST PAGE
   ========================================================= */

function renderPostPage(post) {

  const template = loadTemplate();

  const title =
    post.title || "FriendHub Blog";

  const description =
    post.metaDescription ||
    post.excerpt ||
    "FriendHub Blog";

  const slug =
    String(post.slug).trim();

  const canonical =
    `${SITE_URL}/blog/${slug}/`;

  const image =
    post.coverImageUrl ||
    `${SITE_URL}/og-image.png`;


  let publishedDate;

  if (post.publishedAt) {

    const d =
      post.publishedAt instanceof Date
        ? post.publishedAt
        : new Date(post.publishedAt);

    if (!Number.isNaN(d.getTime())) {
      publishedDate = d.toISOString();
    }

  }


  const articleLd = {

    "@context": "https://schema.org",

    "@type": "BlogPosting",

    headline: title,

    description: description,

    url: canonical,

    image: image,

    datePublished: publishedDate,

    author: {
      "@type": "Organization",
      "name": "FriendHub"
    },

    publisher: {
      "@type": "Organization",
      "name": "FriendHub",
      "url": `${SITE_URL}/`
    }

  };


  let html = template;


  /* ---------- SEO ---------- */

  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,

    `<title>
      ${escapeHtml(title)} — FriendHub Blog
    </title>`
  );


  html = html.replace(
    /<meta[^>]*name=["']description["'][^>]*>/i,

    `<meta
      name="description"
      content="${escapeHtml(description)}"
    >`
  );


  html = html.replace(
    /<link[^>]*rel=["']canonical["'][^>]*>/i,

    `<link
      rel="canonical"
      href="${escapeHtml(canonical)}"
    >`
  );


  /* ---------- Open Graph ---------- */

  html = html.replace(
    /<meta[^>]*property=["']og:title["'][^>]*>/i,

    `<meta
      property="og:title"
      content="${escapeHtml(title)}"
    >`
  );


  html = html.replace(
    /<meta[^>]*property=["']og:description["'][^>]*>/i,

    `<meta
      property="og:description"
      content="${escapeHtml(description)}"
    >`
  );


  html = html.replace(
    /<meta[^>]*property=["']og:url["'][^>]*>/i,

    `<meta
      property="og:url"
      content="${escapeHtml(canonical)}"
    >`
  );


  html = html.replace(
    /<meta[^>]*property=["']og:image["'][^>]*>/i,

    `<meta
      property="og:image"
      content="${escapeHtml(image)}"
    >`
  );


  /* ---------- Twitter ---------- */

  html = html.replace(
    /<meta[^>]*name=["']twitter:title["'][^>]*>/i,

    `<meta
      name="twitter:title"
      content="${escapeHtml(title)}"
    >`
  );


  html = html.replace(
    /<meta[^>]*name=["']twitter:description["'][^>]*>/i,

    `<meta
      name="twitter:description"
      content="${escapeHtml(description)}"
    >`
  );


  html = html.replace(
    /<meta[^>]*name=["']twitter:image["'][^>]*>/i,

    `<meta
      name="twitter:image"
      content="${escapeHtml(image)}"
    >`
  );


  /* ---------- Structured data ---------- */

  html = html.replace(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i,

    `<script type="application/ld+json">
      ${safeJsonLd(articleLd)}
    </script>`
  );


  /* =======================================================
     VERY IMPORTANT
     
     Replace the dynamic blog content with static HTML.
     The design/CSS/header/footer remain from blog-post.html.
     ======================================================= */

  html = html.replace(
    /<main>[\s\S]*?<\/main>/i,

    buildStaticMain(post)
  );


  /* =======================================================
     REMOVE FIREBASE/DYNAMIC LOADING
     ======================================================= */

  html = stripFirebaseScripts(html);


  return html;
}


/* =========================================================
   BLOG INDEX
   ========================================================= */

function renderIndexPage(posts) {

  const template = loadTemplate();


  const cards = posts
    .map(post => {

      const title =
        escapeHtml(
          post.title || "FriendHub Blog"
        );

      const excerpt =
        escapeHtml(
          post.excerpt || ""
        );

      const slug =
        escapeHtml(
          post.slug
        );

      const date =
        escapeHtml(
          formatDate(post.publishedAt)
        );

      const minutes =
        readMinutes(post.content);


      const tags =
        (Array.isArray(post.tags)
          ? post.tags
          : []
        )
          .slice(0, 3)
          .map(
            tag =>
              `<span class="tag">
                ${escapeHtml(tag)}
              </span>`
          )
          .join("");


      const cover =
        post.coverImageUrl

          ? `
            <div class="cover-wrap">

              <img
                class="cover"
                src="${escapeHtml(post.coverImageUrl)}"
                alt="${title}"
                loading="lazy"
              >

            </div>
          `

          : "";


      return `
<article class="index-card">

  <a
    href="/blog/${slug}/"
    class="index-card-link"
  >

    ${cover}

    <div class="index-card-body">

      <div class="index-tags">
        ${tags}
      </div>

      <h2>
        ${title}
      </h2>

      <p>
        ${excerpt}
      </p>

      <div class="index-meta">

        <span>
          ${date}
        </span>

        <span class="sep"></span>

        <span>
          ${minutes} min read
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


  let html = template;


  /* ---------- Index SEO ---------- */

  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,

    `<title>
      Blog — FriendHub | Video Chat Tips, Safety & Updates
    </title>`
  );


  html = html.replace(
    /<meta[^>]*name=["']description["'][^>]*>/i,

    `<meta
      name="description"
      content="Guides, safety tips, and updates from FriendHub — the free random video chat platform for meeting new people."
    >`
  );


  html = html.replace(
    /<link[^>]*rel=["']canonical["'][^>]*>/i,

    `<link
      rel="canonical"
      href="${SITE_URL}/blog/"
    >`
  );


  html = html.replace(
    /<meta[^>]*property=["']og:title["'][^>]*>/i,

    `<meta
      property="og:title"
      content="FriendHub Blog — Video Chat Tips, Safety & Updates"
    >`
  );


  html = html.replace(
    /<meta[^>]*property=["']og:description["'][^>]*>/i,

    `<meta
      property="og:description"
      content="Guides, safety tips, and updates from FriendHub."
    >`
  );


  html = html.replace(
    /<meta[^>]*property=["']og:url["'][^>]*>/i,

    `<meta
      property="og:url"
      content="${SITE_URL}/blog/"
    >`
  );


  html = html.replace(
    /<meta[^>]*property=["']og:image["'][^>]*>/i,

    `<meta
      property="og:image"
      content="${SITE_URL}/og-image.png"
    >`
  );


  html = html.replace(
    /<meta[^>]*name=["']twitter:title["'][^>]*>/i,

    `<meta
      name="twitter:title"
      content="FriendHub Blog — Video Chat Tips, Safety & Updates"
    >`
  );


  html = html.replace(
    /<meta[^>]*name=["']twitter:description["'][^>]*>/i,

    `<meta
      name="twitter:description"
      content="Guides, safety tips, and updates from FriendHub."
    >`
  );


  html = html.replace(
    /<meta[^>]*name=["']twitter:image["'][^>]*>/i,

    `<meta
      name="twitter:image"
      content="${SITE_URL}/og-image.png"
    >`
  );


  /* ---------- Blog structured data ---------- */

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


  html = html.replace(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i,

    `<script type="application/ld+json">
      ${safeJsonLd(blogLd)}
    </script>`
  );


  /* ---------- Replace main ---------- */

  const indexMain = `

<main class="blog-index-main">

  <section class="index-hero">

    <div class="kicker">
      FRIENDHUB BLOG
    </div>

    <h1 class="index-title">
      The FriendHub Blog
    </h1>

    <p class="index-description">
      Guides, safety tips, random video chat advice,
      and updates from FriendHub.
    </p>

  </section>


  <section
    class="index-grid"
    aria-label="Blog posts"
  >

    ${
      cards ||
      `
      <div class="index-empty">
        No posts published yet — check back soon.
      </div>
      `
    }

  </section>

</main>
`;


  html = html.replace(
    /<main>[\s\S]*?<\/main>/i,
    indexMain
  );


  /* ---------- Index CSS ---------- */

  const indexCss = `

/* =====================================================
   STATIC BLOG INDEX
   Uses the current blog-post.html visual design
   ===================================================== */

.blog-index-main{
  max-width:1180px !important;
  padding:70px 22px 100px !important;
}

.index-hero{
  max-width:850px;
  margin-bottom:45px;
}

.index-hero .kicker{
  margin-bottom:14px;
}

.index-title{
  font-family:"Space Grotesk",sans-serif;
  font-size:clamp(42px,6vw,68px);
  line-height:1.06;
  letter-spacing:-.045em;
  font-weight:700;
  margin:0 0 16px;
  color:#fff;
}

.index-description{
  max-width:650px;
  color:var(--muted);
  font-size:17px;
  line-height:1.7;
  margin:0;
}

.index-grid{
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:22px;
}

.index-card{
  min-width:0;
}

.index-card-link{
  display:flex;
  flex-direction:column;
  height:100%;
  overflow:hidden;
  text-decoration:none;
  background:var(--card);
  border:1px solid var(--line);
  border-radius:18px;
  transition:
    transform .2s ease,
    border-color .2s ease,
    box-shadow .2s ease;
}

.index-card-link:hover{
  transform:translateY(-4px);
  border-color:rgba(94,158,255,.45);
  box-shadow:0 18px 45px rgba(0,0,0,.22);
}

.index-card .cover-wrap{
  height:190px;
  background:#0B1227;
  overflow:hidden;
}

.index-card .cover{
  width:100%;
  height:100%;
  object-fit:cover;
  display:block;
  border:0;
  border-radius:0;
  margin:0;
}

.index-card-body{
  display:flex;
  flex-direction:column;
  flex:1;
  padding:20px;
}

.index-tags{
  display:flex;
  gap:7px;
  flex-wrap:wrap;
  margin-bottom:12px;
}

.index-card h2{
  font-family:"Space Grotesk",sans-serif;
  font-size:21px;
  line-height:1.28;
  font-weight:600;
  color:#fff;
  margin:0 0 10px;
}

.index-card p{
  color:var(--muted);
  font-size:14px;
  line-height:1.6;
  margin:0 0 18px;
  flex:1;
}

.index-meta{
  display:flex;
  align-items:center;
  gap:9px;
  padding-top:13px;
  border-top:1px solid var(--line);
  font-family:"IBM Plex Mono",monospace;
  font-size:10.5px;
  font-weight:500;
  color:var(--muted);
}

.index-meta .sep{
  width:3px;
  height:3px;
  border-radius:50%;
  background:var(--muted);
}

.index-meta .read-link{
  margin-left:auto;
  color:var(--mint);
}

.index-empty{
  grid-column:1/-1;
  padding:70px 20px;
  text-align:center;
  border:1px dashed var(--line);
  border-radius:16px;
  color:var(--muted);
}

@media(max-width:900px){

  .index-grid{
    grid-template-columns:
      repeat(2,minmax(0,1fr));
  }

}

@media(max-width:600px){

  .blog-index-main{
    padding:
      48px
      17px
      70px !important;
  }

  .index-grid{
    grid-template-columns:1fr;
  }

  .index-title{
    font-size:40px;
  }

}

`;


  html = html.replace(
    "</style>",
    `${indexCss}\n</style>`
  );


  /* ---------- Remove Firebase ---------- */

  html = stripFirebaseScripts(html);


  return html;
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
    },

    ...posts.map(post => ({

      loc:
        `${SITE_URL}/blog/${post.slug}/`,

      lastmod:
        post.publishedAt instanceof Date
          ? post.publishedAt
              .toISOString()
              .slice(0, 10)
          : undefined,

      priority: "0.6"

    }))

  ];


  const entries = urls

    .map(
      url => `  <url>
    <loc>${escapeHtml(url.loc)}</loc>
    ${
      url.lastmod
        ? `<lastmod>${url.lastmod}</lastmod>`
        : ""
    }
    <priority>${url.priority}</priority>
  </url>`
    )

    .join("\n");


  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;

}


/* =========================================================
   MAIN
   ========================================================= */

async function main() {

  console.log(
    "Fetching published posts from Firestore..."
  );


  const rawPosts =
    await fetchAllPosts();


  const posts = rawPosts

    .filter(
      post =>
        post.status === "published" &&
        post.slug
    )

    .map(
      post => ({
        ...post,
        slug:
          String(post.slug).trim()
      })
    )

    .sort(
      (a, b) => {

        const ad =
          a.publishedAt instanceof Date
            ? a.publishedAt.getTime()
            : 0;

        const bd =
          b.publishedAt instanceof Date
            ? b.publishedAt.getTime()
            : 0;

        return bd - ad;

      }
    );


  console.log(
    `Found ${posts.length} published post(s).`
  );


  fs.mkdirSync(
    BLOG_DIR,
    { recursive: true }
  );


  /* =====================================================
     GENERATE ALL POSTS

     This intentionally regenerates ALL posts every time.
     Therefore if you change blog-post.html, every old
     article gets the new design too.
     ===================================================== */

  for (const post of posts) {

    const postDir =
      path.join(
        BLOG_DIR,
        post.slug
      );


    fs.mkdirSync(
      postDir,
      { recursive: true }
    );


    fs.writeFileSync(

      path.join(
        postDir,
        "index.html"
      ),

      renderPostPage(post),

      "utf8"

    );


    console.log(
      `  wrote /blog/${post.slug}/index.html`
    );

  }


  /* ---------- Blog index ---------- */

  fs.writeFileSync(

    path.join(
      BLOG_DIR,
      "index.html"
    ),

    renderIndexPage(posts),

    "utf8"

  );


  console.log(
    "  wrote /blog/index.html"
  );


  /* ---------- Sitemap ---------- */

  fs.writeFileSync(

    path.join(
      ROOT,
      "sitemap.xml"
    ),

    renderSitemap(posts),

    "utf8"

  );


  console.log(
    "  wrote /sitemap.xml"
  );


  console.log(
    "Done."
  );

}


main().catch(error => {

  console.error(error);

  process.exit(1);

});
