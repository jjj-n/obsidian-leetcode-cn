// src/notes/ImageDownloader.ts
// Ticket #02 — download leetcode.cn CDN images to vault for offline reading.
import { requestUrl, type App } from 'obsidian';
import { logger } from '../shared/logger';

export function extractImageUrls(html: string): string[] {
  const urls: string[] = [];
  const re = /<img[^>]+src\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) urls.push(m[1]);
  }
  return urls;
}

export function isLCImageUrl(url: string): boolean {
  return /\.leetcode-cn\.com\//i.test(url);
}

export async function localizeImages(
  html: string,
  app: App,
  folder: string,
): Promise<string> {
  const urls = extractImageUrls(html).filter(isLCImageUrl);
  if (urls.length === 0) return html;

  const uniqueUrls = Array.from(new Set(urls));

  const trimmed = folder.replace(/[\\/]+$/, '');
  if (!app.vault.getAbstractFileByPath(trimmed)) {
    try {
      await app.vault.createFolder(trimmed);
    } catch {
      logger.debug('imageLocalizer: could not create folder', trimmed);
      return html;
    }
  }

  const urlToLocal: Map<string, string> = new Map();
  await Promise.all(uniqueUrls.map(async (url) => {
    try {
      const filename = hashFileName(url);
      const ext = guessExt(url, 'png');
      const filePath = `${trimmed}/${filename}.${ext}`;

      if (app.vault.getAbstractFileByPath(filePath)) {
        urlToLocal.set(url, filePath);
        return;
      }

      const resp = await requestUrl({ url, method: 'GET' });
      if (resp.status < 200 || resp.status >= 300) {
        urlToLocal.set(url, url);
        return;
      }
      const buf = resp.arrayBuffer;
      await app.vault.createBinary(filePath, buf);
      urlToLocal.set(url, filePath);
    } catch {
      urlToLocal.set(url, url);
    }
  }));

  return html.replace(
    /(<img[^>]+src\s*=\s*["'])([^"']+)(["'])/gi,
    (_full, before: string, url: string, after: string) => {
      const local = urlToLocal.get(url);
      if (local && local !== url) {
        return `${before}${local}${after}`;
      }
      return _full;
    },
  );
}

function hashFileName(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i);
    hash = ((hash << 5) - hash + c) | 0;
  }
  return 'lc-img-' + (Math.abs(hash) % 0xffff).toString(16).padStart(4, '0');
}

function guessExt(url: string, fallback: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.match(/\.(\w+)$/)?.[1];
    if (ext && ext.length <= 4) return ext;
  } catch { /* use fallback */ }
  return fallback;
}
