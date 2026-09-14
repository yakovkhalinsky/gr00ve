import { marked } from 'marked';

// The guide has exactly one source of truth. This is the same file a
// contributor edits on GitHub, imported raw and rendered here — so the page a
// musician reads and the markdown a developer reviews can never drift apart.
import markdown from '../../../../docs/using-gr00ve.md?raw';

import './guide.css';

/** Where the repo lives, for links that only exist as files. */
const GITHUB_DOCS = 'https://github.com/yakovkhalinsky/gr00ve/blob/main/docs/';

const container = document.getElementById('guide');
if (!container) throw new Error('#guide missing from guide.html');

container.innerHTML = marked.parse(markdown, { async: false }) as string;

/**
 * Rewrite relative `.md` links to their GitHub-rendered equivalents.
 *
 * The markdown links to its sibling documents by relative path, which is
 * correct on GitHub and broken on Pages — Pages serves `.md` as plain text and
 * a link like `research-brief.md` resolves against the site root, not the docs
 * directory. Every such link in this project lives in `docs/`, so mapping them
 * by filename is enough.
 */
for (const anchor of container.querySelectorAll<HTMLAnchorElement>('a[href$=".md"]')) {
  const file = (anchor.getAttribute('href') ?? '').split('/').pop();
  if (file) anchor.href = GITHUB_DOCS + file;
}

/** Slugify a heading into a stable fragment identifier. */
function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Build a table of contents from the second-level headings.
 *
 * The guide is long enough that arriving at the top of it is not the same as
 * being able to find anything, and a `h2` is exactly the granularity someone
 * scans for — "Reference", "Controls", "Limitations".
 */
const headings = [...container.querySelectorAll<HTMLHeadingElement>('h2')];
if (headings.length > 1) {
  const used = new Set<string>();
  const items = headings.map((heading) => {
    const base = slug(heading.textContent ?? '');
    // Two headings can slugify the same; suffix rather than collide, because a
    // duplicate id would silently make the second link point at the first.
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    heading.id = id;
    return `<li><a href="#${id}">${heading.textContent ?? ''}</a></li>`;
  });

  const toc = document.createElement('nav');
  toc.className = 'toc';
  toc.setAttribute('aria-label', 'On this page');
  toc.innerHTML = `<p class="toc__title">On this page</p><ul>${items.join('')}</ul>`;
  container.prepend(toc);
}

// Base-aware, so the link works both at `/` in dev and `/gr00ve/` on Pages.
const back = document.getElementById('back');
if (back) back.setAttribute('href', import.meta.env.BASE_URL);
