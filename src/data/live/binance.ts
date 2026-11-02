/*
 * 幣安公開行情 API（不需要金鑰，瀏覽器可以直接呼叫）。
 * 文件：https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints
 * K 棒格式：[開盤時間, 開, 高, 低, 收, 成交量(幣), 收盤時間, 成交值(USDT), 筆數, ...]
 */

/** data-api.binance.vision 是幣安官方「只提供公開行情」的網址；連不上再改用主網址 */
const HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];

export interface LiveBar {
  /** UTC 日期（幣安日 K 以 UTC 00:00 切換） */
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** 成交量（以幣計） */
  volume: number;
  /** 成交值（以 USDT 計） */
  quoteVolume: number;
  /** 這根 K 棒結束的時間（毫秒）；還沒到就代表尚未收盤 */
  closeTime: number;
}

export function parseBinanceKlines(json: unknown): LiveBar[] {
  if (!Array.isArray(json)) throw new Error('幣安回應的格式不符');
  const out: LiveBar[] = [];
  for (const k of json) {
    if (!Array.isArray(k) || k.length < 8) continue;
    const openTime = Number(k[0]);
    const bar: LiveBar = {
      time: new Date(openTime).toISOString().slice(0, 10),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
      closeTime: Number(k[6]),
      quoteVolume: Number(k[7]),
    };
    const prices = [bar.open, bar.high, bar.low, bar.close];
    if (!Number.isFinite(openTime) || prices.some((p) => !Number.isFinite(p) || p <= 0)) continue;
    out.push(bar);
  }
  if (out.length === 0) throw new Error('幣安沒有回傳任何 K 棒');
  return out.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

export async function fetchBinanceDaily(symbol: string, limit = 100, fetchImpl: typeof fetch = fetch): Promise<LiveBar[]> {
  let lastError: unknown = null;
  for (const host of HOSTS) {
    try {
      const res = await fetchImpl(`${host}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1d&limit=${limit}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseBinanceKlines(await res.json());
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
