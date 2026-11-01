import { Card, PageTitle, Segmented, SectionTitle } from '../components/ui';
import { ASSETS } from '../config/assets';
import { fmtDate, fmtDateTime } from '../data/format';
import { useManifest } from '../data/load';
import { getIndicator } from '../indicators/registry';
import { Link } from '../router';
import { DEFAULT_SETTINGS, useSettings, type ColorMode, type ThemeMode } from '../store/settings';

const STATUS_LABEL = { ok: '正常', stale: '更新失敗（顯示舊資料）', missing: '尚無資料' } as const;

export function SettingsPage() {
  const s = useSettings();
  const manifest = useManifest();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageTitle>設定與關於</PageTitle>

      <Card>
        <SectionTitle>顯示</SectionTitle>
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-sm text-fg">漲跌顏色</div>
            <Segmented<ColorMode>
              value={s.colorMode}
              onChange={(v) => s.update({ colorMode: v })}
              options={[
                { value: 'tw', label: '紅漲綠跌（台灣）' },
                { value: 'intl', label: '綠漲紅跌（國際）' },
              ]}
            />
            <p className="mt-1.5 text-sm">
              預覽：<span className="text-up">▲ 上漲 +1.23%</span>
              <span className="ml-3 text-down">▼ 下跌 −1.23%</span>
            </p>
          </div>
          <div>
            <div className="mb-1.5 text-sm text-fg">主題</div>
            <Segmented<ThemeMode>
              value={s.theme}
              onChange={(v) => s.update({ theme: v })}
              options={[
                { value: 'system', label: '跟隨系統' },
                { value: 'light', label: '淺色' },
                { value: 'dark', label: '深色' },
              ]}
            />
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle sub="圖表頁目前加入的指標與參數會自動記在這台裝置上。">圖表設定</SectionTitle>
        <p className="text-sm text-fg">
          目前的指標：
          {s.chartIndicators.length ? s.chartIndicators.map((x) => getIndicator(x.id)?.name ?? x.id).join('、') : '（沒有）'}
        </p>
        <button
          type="button"
          onClick={() => s.update({ chartIndicators: DEFAULT_SETTINGS.chartIndicators, signalIndicator: null })}
          className="mt-3 rounded-lg border border-line px-3 py-1.5 text-sm text-fg"
        >
          恢復預設指標（均線、成交量、KD）
        </button>
      </Card>

      <Card>
        <SectionTitle sub="GitHub Actions 每天在美股收盤後（台北 08:23）與台股收盤後（台北 15:07）自動抓取。">資料</SectionTitle>
        <div className="table-scroll">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 pr-2 font-normal">標的</th>
                <th className="py-1 pr-2 font-normal">狀態</th>
                <th className="py-1 pr-2 font-normal">最新日期</th>
                <th className="py-1 font-normal">筆數</th>
              </tr>
            </thead>
            <tbody>
              {ASSETS.map((a) => {
                const e = manifest?.assets.find((x) => x.id === a.id);
                return (
                  <tr key={a.id} className="border-t border-line">
                    <td className="py-1.5 pr-2 text-fg">
                      {a.name}
                      <span className="ml-1 text-xs text-muted">{a.symbol}</span>
                    </td>
                    <td className={`py-1.5 pr-2 ${e?.status === 'ok' ? 'text-fg' : 'text-hot'}`}>{e ? STATUS_LABEL[e.status] : '—'}</td>
                    <td className="py-1.5 pr-2 text-fg tabular">{fmtDate(e?.lastDate)}</td>
                    <td className="py-1.5 text-fg tabular">{e?.bars?.toLocaleString('zh-TW') ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          上次抓取：{manifest ? fmtDateTime(manifest.generatedAt) : '—'}（台北時間）。
          <Link to="/basics/data-source" className="ml-1 text-accent">
            價格資料是從哪裡來的？
          </Link>
        </p>
      </Card>

      <Card>
        <SectionTitle>安裝到手機主畫面</SectionTitle>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-fg">
          <li>iPhone：用 Safari 打開這個網站 → 點「分享」→「加入主畫面」。</li>
          <li>Android：用 Chrome 打開 → 右上角選單 →「安裝應用程式」或「加到主畫面」。</li>
          <li>電腦：Chrome 或 Edge 網址列右側的「安裝」圖示。</li>
        </ul>
        <p className="mt-2 text-xs text-muted">安裝後就像一般 App 一樣開啟；沒有網路時也能看到上一次載入的資料。</p>
      </Card>

      <Card>
        <SectionTitle>關於</SectionTitle>
        <div className="space-y-2 text-sm leading-relaxed text-fg">
          <p>技術分析學堂：給新手的技術分析學習工具，涵蓋 25 個常見指標的解說、圖表與回測。</p>
          <p>
            行情資料：Yahoo Finance（每日資料，可能有延遲或錯誤）。圖表：
            <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer" className="text-accent">
              TradingView Lightweight Charts™
            </a>
            （Copyright © 2025 TradingView, Inc.，Apache License 2.0）。
          </p>
          <p className="text-muted">
            本工具僅供學習技術分析之用，所有訊號與回測結果都不構成投資建議；過去的績效不代表未來。投資前請自行判斷並承擔風險。
          </p>
        </div>
      </Card>
    </div>
  );
}
