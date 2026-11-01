import { useSyncExternalStore, type AnchorHTMLAttributes, type ReactNode } from 'react';

/*
 * 迷你 hash 路由：網址長這樣 …/Personal_trading/#/chart/0050?tf=W
 * GitHub Pages 不支援單頁應用的路徑轉址，用 # 後面的路徑最穩定，重新整理也不會 404。
 */

function getHash(): string {
  return window.location.hash.slice(1) || '/';
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

export interface Location {
  path: string;
  query: URLSearchParams;
}

export function useLocation(): Location {
  const hash = useSyncExternalStore(subscribe, getHash, () => '/');
  const qIndex = hash.indexOf('?');
  const path = qIndex >= 0 ? hash.slice(0, qIndex) : hash;
  const query = new URLSearchParams(qIndex >= 0 ? hash.slice(qIndex + 1) : '');
  return { path: path || '/', query };
}

export function navigate(to: string, options?: { replace?: boolean }): void {
  if (options?.replace) {
    history.replaceState(null, '', `#${to}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = to;
  }
}

/** 比對路徑樣式，例如 matchPath('/chart/:asset', '/chart/0050') → { asset: '0050' } */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    const seg = p[i]!;
    const actual = s[i]!;
    if (seg.startsWith(':')) {
      params[seg.slice(1)] = decodeURIComponent(actual);
    } else if (seg !== actual) {
      return null;
    }
  }
  return params;
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string; children?: ReactNode };

export function Link({ to, children, ...rest }: LinkProps) {
  return (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  );
}

/** 組合查詢字串，略過空值 */
export function withQuery(path: string, params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}
