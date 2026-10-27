"use client";

// Exports the analysis card as a standalone SVG image — no screenshot library,
// no network. The card is cloned, the page's own CSS rules are embedded
// alongside it (so the Tailwind classes still apply), and the whole thing is
// serialised into an SVG file the browser downloads.
//
// A PNG would need the clone rasterised through a canvas, but Chrome taints
// any canvas fed with an SVG <foreignObject>, so the vector file is what ships.

/** Every same-origin CSS rule the page has loaded (Tailwind + globals). */
function collectCss(): string {
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) out.push(rule.cssText);
    } catch {
      // Cross-origin sheet (ads, embedded widgets) — skipped.
    }
  }
  return out.join("\n");
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Snapshot `node` to a downloaded SVG. Remote images (driver headshots) are
 * dropped — they would not load inside the exported file — leaving the
 * coloured discs behind them in place.
 */
export function downloadNodeAsImage(node: HTMLElement, filename: string): void {
  const rect = node.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(rect.width));
  const height = Math.max(1, Math.ceil(rect.height));

  const clone = node.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("img").forEach((img) => img.remove());
  // Export the whole scroll container, not just the visible window.
  [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))].forEach((el) => {
    if (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) {
      el.style.maxHeight = "none";
      el.style.overflow = "visible";
    }
  });
  clone.style.width = `${width}px`;
  clone.style.margin = "0";
  clone.style.background = "#0f172a";

  // CSS goes into the SVG `<style>` verbatim, so the XML-significant characters
  // have to be escaped or the file won't parse.
  const css = collectCss().replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const markup = new XMLSerializer().serializeToString(clone);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject x="0" y="0" width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px">` +
    `<style>${css}</style>${markup}` +
    `</div></foreignObject></svg>`;

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename.replace(/\.[a-z]+$/i, "") + ".svg");
  // The click has already started the download; give it a beat before cleanup.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
