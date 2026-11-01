import { Link } from '../router';

export function NotFound() {
  return (
    <div className="py-16 text-center">
      <p className="text-lg font-semibold text-fg">找不到這個頁面</p>
      <p className="mt-1 text-sm text-muted">網址可能打錯了，或這個頁面已經搬家。</p>
      <Link to="/" className="mt-4 inline-block text-accent">
        回到總覽
      </Link>
    </div>
  );
}
