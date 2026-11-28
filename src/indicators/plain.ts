import type { Candle } from '../data/types';
import { fmtNum } from '../data/format';
import type { IndicatorResult, StateSummary } from './types';

/**
 * 指標卡的第一行：一句不用術語的白話（例如「短期在跌，但跌勢變慢」）。
 * 數字和術語（DIF、%B、+DI、先行帶、S2…）都留在展開的「數字和說明」裡。
 * 沒有寫到的指標回傳 null，畫面照舊顯示原本的標題。
 */
export function plainLine(id: string, d: StateSummary, r: IndicatorResult, candles: readonly Candle[]): string | null {
  const n = candles.length;
  const line = (key: string) => r.lines.find((l) => l.key === key)?.values ?? [];
  const has = (s: string) => d.headline.includes(s);
  /** K 在 D 之上／之下時：還在 50 以下就上彎，是「從低檔回升」；50 以上往下彎是「從高檔回落」 */
  const turn = (k: number | null | undefined) => {
    if (d.tone === 'bullish') return k != null && k < 50 ? '短線從低檔開始回升' : '短線動能偏多';
    return k != null && k > 50 ? '短線從高檔開始回落' : '短線動能偏空';
  };
  switch (id) {
    case 'macd': {
      const dif = line('dif')[n - 1];
      const sig = line('macd')[n - 1];
      const o1 = line('osc')[n - 1];
      const o0 = line('osc')[n - 2];
      if (dif == null || sig == null || o1 == null) return null;
      // 昨天和今天在 0 的兩邊（今天剛交叉）時，比長短沒有意義，不說變快
      const faster = o0 != null && o0 >= 0 === o1 >= 0 && Math.abs(o1) > Math.abs(o0);
      if (dif < sig && dif < 0) return faster ? '短期在跌，而且跌勢變快' : '短期在跌，但跌勢變慢';
      if (dif > sig && dif > 0) return faster ? '短期在漲，而且漲勢變快' : '短期在漲，但漲勢變慢';
      if (dif > sig) return '跌勢緩和、短線轉強，但還沒變成上漲趨勢';
      return '漲勢減弱、短線轉弱，但還沒變成下跌趨勢';
    }
    case 'bollinger':
      if (has('突破上軌')) return '價格衝出最近 20 天正常波動範圍的上緣，漲得很急';
      if (has('跌破下軌')) return '價格跌出最近 20 天正常波動範圍的下緣，跌得很急';
      return has('中軌之上') ? '價格在最近 20 天正常範圍的上半部' : '價格在最近 20 天正常範圍的下半部';
    case 'keltner':
      if (has('突破上軌')) return '價格衝出通道上緣，漲勢很強';
      if (has('跌破下軌')) return '價格跌出通道下緣，跌勢很強';
      return has('上軌') ? '價格在通道的上半部' : '價格在通道的下半部';
    case 'dmi':
      if (has('盤整')) return '沒有明顯的趨勢（盤整）';
      return `${d.tone === 'bullish' ? '上漲' : '下跌'}趨勢${has('非常強') ? '非常強' : has('正在形成') ? '正在形成' : '明確'}`;
    case 'ichimoku':
      if (has('雲層之上')) return '價格在雲的上面，中長期偏多';
      if (has('雲層之下')) return '價格在雲的下面，中長期偏空';
      return '價格在雲裡面，方向不明';
    case 'pivot': {
      const below = has('之下');
      if (d.detail.includes('已經跌破所有支撐')) return '價格在上個月的中心價之下，而且跌破了上個月算出來的所有支撐';
      if (d.detail.includes('已經在所有壓力之上')) return '價格在上個月的中心價之上，而且漲過了上個月算出來的所有壓力';
      return below ? '價格在上個月的中心價之下' : '價格在上個月的中心價之上';
    }
    case 'kd':
      if (has('高檔鈍化')) return '連續好幾天在高檔，買盤很強';
      if (has('低檔鈍化')) return '連續好幾天在低檔，賣壓很重';
      if (has('進入高檔')) return '短線漲多，偏熱';
      if (has('進入低檔')) return '短線跌深，偏冷';
      return turn(line('k')[n - 1]);
    case 'rsi':
    case 'mfi':
      if (has('超買')) return '短期漲得比較急';
      if (has('超賣')) return '短期跌得比較急';
      return has('偏強') ? '上漲的力道略大於下跌' : '下跌的力道略大於上漲';
    case 'stoch-rsi':
      if (has('超買')) return 'RSI 在它自己最近的區間裡偏高（這個指標很靈敏）';
      if (has('超賣')) return 'RSI 在它自己最近的區間裡偏低（這個指標很靈敏）';
      return turn(line('k')[n - 1]);
    case 'williams-r':
      if (has('超買')) return '收盤價很接近最近 14 天的最高價';
      if (has('超賣')) return '收盤價很接近最近 14 天的最低價';
      return has('偏強') ? '收盤價在最近 14 天高低之間的上半部' : '收盤價在最近 14 天高低之間的下半部';
    case 'cci':
      if (has('強勢區')) return '價格明顯高於最近的平均水準';
      if (has('弱勢區')) return '價格明顯低於最近的平均水準';
      return '價格在正常的波動範圍內';
    case 'roc': {
      const v = line('roc')[n - 1];
      if (v == null) return null;
      return `和 12 天前比${v >= 0 ? '漲' : '跌'}了 ${fmtNum(Math.abs(v), 2)}%`;
    }
    case 'atr': {
      const m = d.detail.match(/(明顯高於|略高於|接近|略低於|明顯低於)過去一年/);
      const word = m ? { 明顯高於: '明顯比過去一年大', 略高於: '比過去一年大一點', 接近: '和過去一年差不多', 略低於: '比過去一年小一點', 明顯低於: '明顯比過去一年小' }[m[1]!] : '';
      return `最近每天平均的震幅${word}`;
    }
    case 'donchian':
      if (has('新高')) return '創了最近 20 天的新高';
      if (has('新低')) return '創了最近 20 天的新低';
      {
        const m = d.headline.match(/(\d+)%/);
        return m ? `在最近 20 天高低區間的 ${m[1]}% 位置（0% 最低、100% 最高）` : null;
      }
    case 'psar':
      return d.tone === 'bullish' ? '短線趨勢偏多，跌破下方的停損點會轉空' : '短線趨勢偏空，漲過上方的停損點會轉多';
    case 'supertrend':
      return d.tone === 'bullish' ? '趨勢偏多，跌破支撐線才會轉空' : '趨勢偏空，漲過壓力線才會轉多';
    case 'obv':
      if (has('背離')) return '價格創新高，但成交量沒有跟上';
      return d.tone === 'bullish' ? '最近成交量偏向上漲的日子（資金流入）' : '最近成交量偏向下跌的日子（資金流出）';
    case 'psy':
      if (d.tone === 'hot') return '最近上漲的天數特別多，大家普遍樂觀';
      if (d.tone === 'cold') return '最近下跌的天數特別多，大家普遍悲觀';
      return '上漲、下跌的天數差不多';
    case 'bias':
      if (has('正乖離過大')) return '價格漲離均線很遠';
      if (has('負乖離過大')) return '價格跌離均線很遠';
      return '價格離均線的距離在正常範圍';
    case 'sma':
    case 'ema': {
      // 照天數排好：3 條時叫短期、中期、長期
      const mas = r.lines
        .map((l) => ({ days: Number(l.label.match(/(\d+)/)?.[1] ?? NaN), v: l.values[n - 1] }))
        .filter((x): x is { days: number; v: number } => Number.isFinite(x.days) && x.v != null)
        .sort((a, b) => a.days - b.days);
      const close = candles[n - 1]?.close;
      if (!mas.length || close == null) return null;
      const terms = mas.length === 3 ? ['短期', '中期', '長期'] : mas.length === 2 ? ['短期', '長期'] : null;
      const up = mas.map((m) => close > m.v);
      if (up.every(Boolean)) return terms ? `價格在${terms.join('、')}均線上面，都偏強` : `價格在全部 ${mas.length} 條均線上面，都偏強`;
      if (!up.some(Boolean)) return terms ? `價格在${terms.join('、')}均線下面，都偏弱` : `價格在全部 ${mas.length} 條均線下面，都偏弱`;
      if (!terms) return `價格站上 ${up.filter(Boolean).length} 條、跌破 ${up.filter((x) => !x).length} 條均線，方向不一致`;
      const join = (xs: string[]) => xs.join('和');
      return `價格在${join(terms.filter((_, i) => up[i]))}均線上面、${join(terms.filter((_, i) => !up[i]))}均線下面`;
    }
    case 'ma-cross': {
      const bull = has('之上');
      if (bull && d.detail.includes('跌到兩條均線下面')) return '長期趨勢還偏多，但價格已經跌到兩條均線下面';
      if (!bull && d.detail.includes('站上兩條均線')) return '長期趨勢還偏空，但價格已經站上兩條均線';
      return bull ? '中期均線在長期均線上面，長期趨勢偏多' : '中期均線在長期均線下面，長期趨勢偏空';
    }
    case 'volume': {
      if (d.detail.includes('一字漲停')) return '整天鎖在漲停價，成交很少';
      if (d.detail.includes('一字跌停')) return '整天鎖在跌停價，成交很少';
      const m = d.headline.match(/^(價漲|價跌|價平)(爆量|量增|量縮|量能持平)/);
      if (!m) return null;
      const price = { 價漲: '價格上漲', 價跌: '價格下跌', 價平: '價格幾乎沒動' }[m[1]!];
      const vol = { 爆量: '成交量暴增', 量增: '成交量比平常多', 量縮: '成交量比最近平均少', 量能持平: '成交量和平常差不多' }[m[2]!];
      return `${price}，${vol}`;
    }
    case 'fibonacci': {
      const down = d.detail.includes('跌到');
      const what = down ? '大跌之後，價格反彈回跌幅的' : '大漲之後，價格拉回了漲幅的';
      const one = d.headline.match(/剛好在 ([\d.]+%)/);
      if (one) return `${what} ${one[1]} 附近`;
      const two = d.headline.match(/介於 ([\d.]+%)（[^）]*）和 ([\d.]+%)/);
      if (!two) return null;
      if (two[1] === '0%') return `${down ? '大跌之後，反彈還不到跌幅的' : '大漲之後，拉回還不到漲幅的'} ${two[2]}`;
      return `${what} ${two[1]}～${two[2]} 之間`;
    }
    default:
      return null;
  }
}
