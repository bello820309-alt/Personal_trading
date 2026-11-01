import { ASSETS } from '../config/assets';
import { Segmented } from './ui';

/** 切換標的（0050／VOO／比特幣） */
export function AssetTabs({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <Segmented
      ariaLabel="選擇標的"
      value={value}
      onChange={onChange}
      options={ASSETS.map((a) => ({ value: a.id, label: a.market === 'crypto' ? a.name : a.shortName }))}
    />
  );
}
