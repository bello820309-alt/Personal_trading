/*
 * Yahoo Finance v8 chart API（免費、不需金鑰）。
 * 一次抓取日線的完整歷史；失敗時重試，並在 query1／query2 兩個主機之間輪替。
 */

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const HOSTS = ['query2.finance.yahoo.com', 'query1.finance.yahoo.com'];

export function chartUrl(host: string, symbol: string, nowSec: number): string {
  const params = new URLSearchParams({
    period1: '0',
    period2: String(nowSec + 86400),
    interval: '1d',
    events: 'div|split',
    includeAdjustedClose: 'true',
  });
  return `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?${params.toString()}`;
}

/** fetch 失敗時，真正的原因常放在 error.cause（例如 DNS、連線被拒） */
export function describeError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const cause = (e as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) return `${e.message}（${cause.message}）`;
  if (cause) return `${e.message}（${String(cause)}）`;
  return e.message;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface FetchOptions {
  attempts?: number;
  baseDelayMs?: number;
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
}

export async function fetchYahooChart(symbol: string, options: FetchOptions = {}): Promise<unknown> {
  const attempts = options.attempts ?? 4;
  const baseDelay = options.baseDelayMs ?? 2000;
  const doFetch = options.fetchImpl ?? fetch;
  const log = options.log ?? (() => {});
  const nowSec = Math.floor(Date.now() / 1000);
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const host = HOSTS[attempt % HOSTS.length]!;
    const url = chartUrl(host, symbol, nowSec);
    try {
      const res = await doFetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json,text/plain,*/*' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = (await res.json()) as { chart?: { error?: unknown } };
      if (json?.chart?.error) throw new Error(`Yahoo 回傳錯誤：${JSON.stringify(json.chart.error)}`);
      return json;
    } catch (e) {
      lastError = e;
      log(`  第 ${attempt + 1} 次抓取 ${symbol}（${host}）失敗：${describeError(e)}`);
      if (attempt < attempts - 1) await sleep(baseDelay * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
