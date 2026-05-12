#!/usr/bin/env node
/**
 * scripts/publish.js — Mnesti daily blog publisher
 *
 * Picks the next pending article from blog-queue.json,
 * generates content via the Supabase blog-publisher Edge Function,
 * writes the HTML file, updates blog.html and sitemap.xml,
 * then marks the article published.
 *
 * Run: node scripts/publish.js
 * Requires: PUBLISHER_SECRET env var
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..');
const QUEUE_PATH = path.join(ROOT, 'blog-queue.json');
const SITEMAP    = path.join(ROOT, 'sitemap.xml');
const BLOG_INDEX = path.join(ROOT, 'blog.html');

const PUBLISHER_ENDPOINT = 'https://olagntawajefdjrkkvcc.supabase.co/functions/v1/blog-publisher';

// ── Validation ───────────────────────────────────────────────────────────────
if (!process.env.PUBLISHER_SECRET) {
  console.error('❌  PUBLISHER_SECRET non impostata.');
  process.exit(1);
}

// ── Load queue ───────────────────────────────────────────────────────────────
const queue   = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf-8'));
const article = queue.find(a => a.status === 'pending');

if (!article) {
  console.log('✅  Nessun articolo in coda. Queue esaurita.');
  process.exit(0);
}

// Slugs already published (including the 4 initial hardcoded articles)
const SEED_SLUGS = [
  'blog-active-recall',
  'blog-studiare-poco-tempo',
  'blog-lavoro-e-studio',
  'blog-universita-telematica',
];
const publishedSlugs = [
  ...SEED_SLUGS,
  ...queue.filter(a => a.status === 'published').map(a => a.slug),
];

// slug → {title, description, icon} lookup
const meta = Object.fromEntries(queue.map(a => [a.slug, a]));
// Seed entries have minimal info for related cards
const SEED_META = {
  'blog-active-recall':         { title: 'Active Recall: la tecnica di studio più efficace', description: 'Come funziona l\'active recall e come applicarlo alle dispense universitarie.', icon: '🧠' },
  'blog-studiare-poco-tempo':   { title: 'Come studiare con poco tempo: la guida per studenti lavoratori', description: 'Tecniche per massimizzare ogni ora di studio da lavoratore universitario.', icon: '📚' },
  'blog-lavoro-e-studio':       { title: 'Conciliare lavoro e università: sessioni da 45 minuti', description: 'Il sistema per studiare ogni giorno senza stress anche lavorando.', icon: '⏱️' },
  'blog-universita-telematica': { title: 'Università telematica e lavoro: la guida pratica', description: 'Come prepararsi agli esami UNINETTUNO, Pegaso, eCampus lavorando.', icon: '💻' },
};
const allMeta = { ...SEED_META, ...meta };

// Pick 3 related articles (most recently published, excluding current)
function pickRelated(currentSlug) {
  const candidates = publishedSlugs.filter(s => s !== currentSlug);
  // Prefer the last 3 published (most recent context)
  return candidates.slice(-3).reverse();
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function esc(str) {
  // Escape for HTML attribute values
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function today() {
  return new Date();
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function dateIT(iso) {
  return new Date(iso).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
}

// ── Content generation via Supabase Edge Function ────────────────────────────
async function generateContent(related) {
  const relatedLinks = related
    .map(slug => {
      const m = allMeta[slug];
      return m ? `* <a href="${slug}.html">${esc(m.title)}</a>` : null;
    })
    .filter(Boolean)
    .join('\n  ');

  const system = `Sei un esperto italiano di metodi di studio universitario e didattica.
Scrivi articoli blog concreti, utili e basati su evidenze per studenti universitari italiani,
soprattutto studenti lavoratori che preparano esami con poco tempo.
Tono: professionale ma diretto, come un tutor senior. Niente luoghi comuni.
Evita incipit come "Nell'era digitale", "Al giorno d'oggi", "Con l'avvento di".
Cita ricerche reali e specifiche quando pertinente (autori, anno, rivista se nota).
Usa sempre il contesto dell'università italiana: appelli, CFU, sessioni, corsi magistrali, ecc.`;

  const user = `Scrivi un articolo blog completo per mnesti.it.

KEYWORD PRIMARIA: ${article.keyword}
TITOLO H1: ${article.title}
META DESCRIPTION: ${article.description}
TAG: ${article.tags.join(', ')}

FORMATO RISPOSTA: JSON con esattamente questi due campi:
{
  "intro": "2-3 frasi di apertura in testo puro (NO tag HTML). Deve agganciare il lettore, non essere generica. Max 220 caratteri.",
  "body": "HTML del corpo articolo (solo il contenuto interno di article-body)"
}

ISTRUZIONI PER body:
- 950–1200 parole di testo reale (esclusi tag HTML)
- 4–6 sezioni con <h2> (con border-bottom in CSS), sottosezioni <h3> dove utile
- Almeno 1 blocco callout: <div class="article-callout"><strong>In numeri:</strong> testo specifico con dati.</div>
- Almeno 1 lista <ol> o <ul> con 4+ voci concrete
- Paragrafi <p> sviluppati (3-5 frasi): NON usare frasi singole come paragrafo
- Link interni contestuali (solo se davvero pertinenti):
  ${relatedLinks}
- Termina con il blocco CTA esatto qui sotto (copialo letteralmente, non modificare gli attributi):
  <div class="article-cta">
    <h3>${esc(article.ctaTitle)}</h3>
    <p>${esc(article.ctaText)}</p>
    <a href="./app.html" class="article-cta-btn">Inizia gratis →</a>
  </div>
- NON fare keyword stuffing: la keyword deve apparire in modo naturale
- NON aggiungere un "Riepilogo" se l'articolo termina già con una lista dettagliata
- Cita dati reali: studi, percentuali, anni, autori — non numeri inventati
- Evita affermazioni vaghe come "molti studenti" o "spesso accade": sii specifico

Rispondi SOLO con il JSON valido. Nessun testo prima o dopo, nessun markdown code block.`;

  console.log('  → Chiamata blog-publisher Edge Function...');
  const res = await fetch(PUBLISHER_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.PUBLISHER_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ system, user }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`blog-publisher HTTP ${res.status}: ${err.error || err.detail || 'unknown error'}`);
  }

  const { content } = await res.json();
  const raw = content.trim();

  // Parse JSON — tolerate markdown code fences from the model
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenced) {
      parsed = JSON.parse(fenced[1]);
    } else {
      const obj = raw.match(/\{[\s\S]*\}/);
      if (obj) parsed = JSON.parse(obj[0]);
      else throw new Error('Impossibile parsare la risposta di Claude come JSON:\n' + raw.slice(0, 300));
    }
  }

  if (!parsed.intro || !parsed.body) {
    throw new Error('Risposta Claude mancante di "intro" o "body".');
  }

  return { intro: parsed.intro.trim(), body: parsed.body.trim() };
}

// ── Build full HTML page ──────────────────────────────────────────────────────
function buildPage(intro, body, pubDate, related) {
  const iso      = isoDate(pubDate);
  const isoTime  = `${iso}T09:00:00+02:00`;
  const dateHuman = dateIT(iso);
  const readMin  = Math.max(4, Math.round(950 / 200));
  const breadcrumb = article.tags[0] || 'Blog';

  // Related cards HTML
  const relatedCards = related.map(slug => {
    const m = allMeta[slug];
    if (!m) return '';
    const t = (m.title.length > 65) ? m.title.slice(0, 62) + '…' : m.title;
    const d = (m.description.length > 90) ? m.description.slice(0, 87) + '…' : m.description;
    return `        <a href="${slug}.html" class="related-card">
          <span class="related-emoji">${m.icon || '📖'}</span>
          <div><strong>${esc(t)}</strong><span>${esc(d)}</span></div>
        </a>`;
  }).filter(Boolean).join('\n');

  // JSON-LD object (built as JS object → JSON.stringify to avoid escaping issues)
  const jsonLD = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    'headline': article.title,
    'description': article.description,
    'datePublished': iso,
    'dateModified': iso,
    'author': { '@type': 'Organization', 'name': 'Mnesti', 'url': 'https://mnesti.it' },
    'publisher': {
      '@type': 'Organization',
      'name': 'Mnesti',
      'logo': { '@type': 'ImageObject', 'url': 'https://mnesti.it/logo-full.png' },
    },
    'url': `https://mnesti.it/${article.slug}.html`,
    'mainEntityOfPage': `https://mnesti.it/${article.slug}.html`,
    'image': { '@type': 'ImageObject', 'url': 'https://mnesti.it/og-image.png', 'width': 1200, 'height': 630 },
    'breadcrumb': {
      '@type': 'BreadcrumbList',
      'itemListElement': [
        { '@type': 'ListItem', 'position': 1, 'name': 'Mnesti', 'item': 'https://mnesti.it' },
        { '@type': 'ListItem', 'position': 2, 'name': 'Blog',   'item': 'https://mnesti.it/blog.html' },
        { '@type': 'ListItem', 'position': 3, 'name': article.tags[0] || 'Articolo', 'item': `https://mnesti.it/${article.slug}.html` },
      ],
    },
  };

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script>if(location.protocol!=='https:'&&location.protocol!=='file:'&&location.hostname!=='localhost')location.replace('https://'+location.host+location.pathname+location.search+location.hash);</script>

  <title>${esc(article.seoTitle)}</title>
  <meta name="description" content="${esc(article.description)}" />
  <meta name="keywords" content="${esc(article.keywords.join(', '))}" />
  <meta name="author" content="Mnesti" />
  <meta name="robots" content="index, follow, max-snippet:-1" />

  <link rel="canonical" href="https://mnesti.it/${article.slug}.html" />

  <meta property="og:type"        content="article" />
  <meta property="og:url"         content="https://mnesti.it/${article.slug}.html" />
  <meta property="og:site_name"   content="Mnesti" />
  <meta property="og:title"       content="${esc(article.title)}" />
  <meta property="og:description" content="${esc(article.description)}" />
  <meta property="og:image"       content="https://mnesti.it/og-image.png" />
  <meta property="og:image:width"  content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="article:published_time" content="${isoTime}" />
  <meta property="article:modified_time"  content="${isoTime}" />
  <meta property="article:author"         content="Mnesti" />
  <meta property="article:section"        content="${esc(article.section)}" />

  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${esc(article.title)}" />
  <meta name="twitter:description" content="${esc(article.description)}" />
  <meta name="twitter:image"       content="https://mnesti.it/og-image.png" />

  <link rel="icon" href="favicon-32.png" type="image/png" sizes="32x32" />
  <link rel="apple-touch-icon" href="apple-touch-icon.png" />
  <link rel="manifest" href="manifest.json" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />

  <script type="application/ld+json">
${JSON.stringify(jsonLD, null, 2)}
  </script>

  <link rel="stylesheet" href="blog-style.css" />
</head>
<body>

<nav id="main-nav" role="navigation">
  <div class="container nav-inner">
    <a href="https://mnesti.it" class="nav-logo"><img src="logo-full.png" alt="Mnesti" width="112" height="28" /></a>
    <div class="nav-right">
      <a href="blog.html" class="nav-link active">Blog</a>
      <a href="faq.html" class="nav-link">FAQ</a>
      <a href="./app.html" class="nav-cta">Inizia gratis <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
    </div>
  </div>
</nav>

<main class="article-main">
  <div class="container article-container">

    <nav class="breadcrumb">
      <a href="https://mnesti.it">Mnesti</a><span>›</span>
      <a href="blog.html">Blog</a><span>›</span>
      <span>${esc(breadcrumb)}</span>
    </nav>

    <header class="article-header">
      <div class="article-tags">
        ${article.tags.map(t => `<span class="article-tag">${esc(t)}</span>`).join('\n        ')}
      </div>
      <h1>${esc(article.title)}</h1>
      <div class="article-meta"><span>${dateHuman}</span><span>·</span><span>${readMin} min di lettura</span></div>
      <p class="article-intro">${esc(intro)}</p>
    </header>

    <div class="article-body">
${body}
    </div>

    <nav class="article-related">
      <h2>Leggi anche</h2>
      <div class="related-grid">
${relatedCards}
      </div>
    </nav>

  </div>
</main>

<footer>
  <div class="footer-links">
    <a href="https://mnesti.it">mnesti.it</a>
    <a href="blog.html">Blog</a>
    <a href="faq.html">FAQ</a>
    <a href="privacy.html">Privacy</a>
  </div>
  <p class="footer-copy">© 2026 Mnesti — Tutti i diritti riservati</p>
</footer>

<script>
const nav = document.getElementById('main-nav');
window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 40), { passive: true });
</script>
</body>
</html>`;
}

// ── Update blog.html ──────────────────────────────────────────────────────────
function updateBlogIndex(pubDate) {
  let html = fs.readFileSync(BLOG_INDEX, 'utf-8');
  const dateHuman = dateIT(isoDate(pubDate));

  const card = `
        <!-- ${article.slug} — ${isoDate(pubDate)} -->
        <a href="${article.slug}.html" class="blog-card">
          <div class="blog-card-img">${article.icon}</div>
          <div class="blog-card-body">
            <div class="blog-card-tags">
              ${article.tags.map(t => `<span class="blog-card-tag">${esc(t)}</span>`).join('\n              ')}
            </div>
            <h3>${esc(article.title)}</h3>
            <p>${esc(article.description)}</p>
            <div class="blog-card-meta">
              <span class="blog-card-date">${dateHuman}</span>
              <span class="blog-card-read">Leggi →</span>
            </div>
          </div>
        </a>`;

  if (html.includes('<!-- ARTICLES_END -->')) {
    html = html.replace('<!-- ARTICLES_END -->', `${card}\n\n        <!-- ARTICLES_END -->`);
  } else {
    // Fallback: insert before closing blog-grid div
    html = html.replace(
      /(\s*<\/div>\s*<\/div>\s*<\/section>)/,
      `${card}\n$1`
    );
  }

  fs.writeFileSync(BLOG_INDEX, html, 'utf-8');
}

// ── Update sitemap.xml ────────────────────────────────────────────────────────
function updateSitemap(pubDate) {
  let xml = fs.readFileSync(SITEMAP, 'utf-8');

  const entry = `
  <!-- ${esc(article.title)} -->
  <url>
    <loc>https://mnesti.it/${article.slug}.html</loc>
    <lastmod>${isoDate(pubDate)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;

  xml = xml.replace('</urlset>', `${entry}\n\n</urlset>`);
  fs.writeFileSync(SITEMAP, xml, 'utf-8');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n📝 Articolo: "${article.title}"`);
  console.log(`   Keyword:  ${article.keyword}`);
  console.log(`   Slug:     ${article.slug}.html\n`);

  const related = pickRelated(article.slug);

  const { intro, body } = await generateContent(related);

  const now = today();

  // 1. Write article HTML
  const html = buildPage(intro, body, now, related);
  fs.writeFileSync(path.join(ROOT, `${article.slug}.html`), html, 'utf-8');
  console.log(`  ✓ Scritto:   ${article.slug}.html`);

  // 2. Update blog.html
  updateBlogIndex(now);
  console.log(`  ✓ Aggiornato: blog.html`);

  // 3. Update sitemap.xml
  updateSitemap(now);
  console.log(`  ✓ Aggiornato: sitemap.xml`);

  // 4. Mark as published in queue
  article.status      = 'published';
  article.date        = isoDate(now);
  article.publishedAt = `${isoDate(now)}T09:00:00+02:00`;
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf-8');
  console.log(`  ✓ Aggiornato: blog-queue.json`);

  console.log(`\n✅  Pubblicato: https://mnesti.it/${article.slug}.html\n`);
}

main().catch(err => {
  console.error('\n❌  Errore durante la pubblicazione:', err.message);
  process.exit(1);
});
