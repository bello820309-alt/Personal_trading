import type { LoadState } from '../data/load';
import { Notice, Spinner } from './ui';

/** 資料還沒準備好時的畫面（載入中、尚未產生、錯誤） */
export function AssetStateView<T>({ state, name }: { state: LoadState<T>; name: string }) {
  if (state.status === 'loading') return <Spinner label={`正在載入 ${name} 的資料…`} />;
  if (state.status === 'missing') return <Notice tone="warn">{name}：{state.message}</Notice>;
  if (state.status === 'error') return <Notice tone="warn">{name} 資料讀取失敗：{state.message}。請檢查網路後重新整理。</Notice>;
  return null;
}
