import { inflateRawSync } from 'node:zlib';

/*
 * 讀 zip 壓縮檔裡的第一個檔案（幣安公開資料的月檔每個 zip 只有一個 CSV）。
 * 只支援「不壓縮」與 deflate 兩種方式，足夠讀取 data.binance.vision 的檔案，不需要另外安裝套件。
 */
export function readFirstZipEntry(buf: Uint8Array): { name: string; data: Buffer } {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  // 從檔尾往前找「中央目錄結尾」（End of Central Directory）
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('不是 zip 檔（找不到中央目錄）');
  const cdOffset = b.readUInt32LE(eocd + 16);
  if (b.readUInt32LE(cdOffset) !== 0x02014b50) throw new Error('zip 中央目錄格式錯誤');
  const method = b.readUInt16LE(cdOffset + 10);
  const compressedSize = b.readUInt32LE(cdOffset + 20);
  const nameLen = b.readUInt16LE(cdOffset + 28);
  const localOffset = b.readUInt32LE(cdOffset + 42);
  const name = b.subarray(cdOffset + 46, cdOffset + 46 + nameLen).toString('utf8');
  if (b.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('zip 檔案標頭格式錯誤');
  const start = localOffset + 30 + b.readUInt16LE(localOffset + 26) + b.readUInt16LE(localOffset + 28);
  const raw = b.subarray(start, start + compressedSize);
  if (method === 0) return { name, data: Buffer.from(raw) };
  if (method === 8) return { name, data: inflateRawSync(raw) };
  throw new Error(`不支援的 zip 壓縮方式：${method}`);
}
