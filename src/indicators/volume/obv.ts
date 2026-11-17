import { fmtNum } from '../../data/format';
import { closes, crossOver, crossUnder, highest, nulls, scanSignals, sma } from '../math/core';
import { getLine, type IndicatorDef, notesOf } from '../types';

export type ObvParams = { maPeriod: number };

export const obvIndicator: IndicatorDef<ObvParams> = {
  id: 'obv',
  shortName: 'OBV',
  name: '能量潮指標',
  enName: 'On-Balance Volume',
  category: 'volume',
  placement: 'pane',
  params: [{ key: 'maPeriod', type: 'number', label: 'OBV 均線天數', min: 2, max: 120, step: 1 }],
  defaults: { maPeriod: 20 },
  compute(candles, p) {
    const n = candles.length;
    const obv = nulls(n);
    if (n > 0) obv[0] = 0;
    for (let i = 1; i < n; i++) {
      const c = candles[i]!;
      const prev = candles[i - 1]!;
      const sign = c.close > prev.close ? 1 : c.close < prev.close ? -1 : 0;
      obv[i] = (obv[i - 1] as number) + sign * c.volume;
    }
    return {
      lines: [
        { key: 'obv', label: 'OBV', values: obv, kind: 'line', color: 's1', width: 2, unit: 'volume' },
        { key: 'obvMa', label: `OBV 均線 ${p.maPeriod}`, values: sma(obv, p.maPeriod), kind: 'line', color: 's0', width: 1, unit: 'volume' },
      ],
    };
  },
  signals(candles, r) {
    const obv = getLine(r, 'obv');
    const ma = getLine(r, 'obvMa');
    return scanSignals(
      candles.length,
      (i) => crossOver(obv, ma, i),
      (i) => crossUnder(obv, ma, i),
      'OBV 上穿均線',
      'OBV 跌破均線',
    );
  },
  describe(candles, r) {
    const n = candles.length;
    const obv = getLine(r, 'obv');
    const ma = getLine(r, 'obvMa');
    const o = obv[n - 1];
    const m = ma[n - 1];
    if (o == null || m == null) return null;
    const closeHigh = highest(closes(candles), 20)[n - 1];
    const obvHigh = highest(obv, 20)[n - 1];
    const priceAtHigh = closeHigh != null && candles[n - 1]!.close >= closeHigh;
    const obvAtHigh = obvHigh != null && o >= obvHigh;
    // 放到一年來看：價格和 OBV 的方向相反時，用上漲日、下跌日的平均量說明原因
    const yearAgo = new Date(`${candles[n - 1]!.time}T00:00:00Z`);
    yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
    const from = candles.findIndex((c) => c.time >= yearAgo.toISOString().slice(0, 10));
    let yearNote = '';
    const o0 = from >= 1 ? obv[from] : null;
    if (from >= 1 && o0 != null) {
      const priceChg = candles[n - 1]!.close / candles[from]!.close - 1;
      const obvUp = o > o0;
      if (Math.abs(priceChg) >= 0.1 && obvUp !== priceChg > 0) {
        let up = 0, dn = 0, vu = 0, vd = 0;
        for (let i = from + 1; i < n; i++) {
          const ch = candles[i]!.close - candles[i - 1]!.close;
          if (ch > 0) (up++, (vu += candles[i]!.volume));
          else if (ch < 0) (dn++, (vd += candles[i]!.volume));
        }
        if (up > 0 && dn > 0) {
          const au = vu / up;
          const ad = vd / dn;
          const big = obvUp ? '上漲' : '下跌';
          const ratio = obvUp ? au / ad : ad / au;
          yearNote = `放到一年來看：價格${priceChg > 0 ? '漲' : '跌'}了 ${fmtNum(Math.abs(priceChg) * 100, 1)}%，OBV 卻往${obvUp ? '上' : '下'}。原因是這一年${big}的日子平均成交量是${obvUp ? '下跌' : '上漲'}日子的 ${fmtNum(ratio, 2)} 倍（上漲 ${up} 天、下跌 ${dn} 天）；OBV 把每天的量整筆加上或減掉，量大的日子影響最大${Math.abs(up - dn) <= 0.1 * (up + dn) ? '；這一年上漲、下跌的天數差不多，所以方向由量比較大的那一邊決定' : ''}。這種一整年的背離不一定是警訊：本站判斷「量價背離」只看最近 20 天的高點，一整年的方向容易被少數幾天的大量帶著走；0050、VOO 這類 ETF 有造市商，還有申購、買回，量的訊號只能參考。`;
        }
      }
    }
    if (priceAtHigh && !obvAtHigh) {
      return {
        tone: 'neutral',
        headline: '量價背離：價格創 20 日新高，OBV 沒跟上',
        detail: '價格創新高，但累積的成交量沒有同步創新高，代表上漲的資金動能可能不足，要多留意。',
        notes: notesOf(['價格和 OBV 一整年方向相反', yearNote]),
      };
    }
    return o > m
      ? { tone: 'bullish', headline: 'OBV 在均線之上', detail: '最近上漲日的成交量比下跌日多，資金偏向流入。', notes: notesOf(['價格和 OBV 一整年方向相反', yearNote]) }
      : { tone: 'bearish', headline: 'OBV 在均線之下', detail: '最近下跌日的成交量比上漲日多，資金偏向流出。', notes: notesOf(['價格和 OBV 一整年方向相反', yearNote]) };
  },
  strategy: {
    name: 'OBV 上穿均線買、跌破均線賣',
    buyRule: 'OBV 由下往上穿越自己的均線（資金開始流入），隔天開盤買進。',
    sellRule: 'OBV 由上往下跌破自己的均線（資金開始流出），隔天開盤賣出。',
  },
};
