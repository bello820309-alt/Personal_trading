import { Fragment } from 'react';
import { splitTerms } from '../content/terms';
import { Link, withQuery } from '../router';

/**
 * 把說明文字裡的術語（DIF、%B、+DI、先行帶、S2、鈍化、背離…）變成可以點的連結，連到名詞小辭典。
 * 每個術語只連第一次出現的地方，最多連 4 個，避免整段都是連結。
 */
export function TermText({ text }: { text: string }) {
  const parts = splitTerms(text);
  return (
    <>
      {parts.map((p, i) =>
        p.term ? (
          <Link key={i} to={withQuery('/glossary', { q: p.term })} className="text-accent underline decoration-dotted underline-offset-2">
            {p.text}
          </Link>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}
