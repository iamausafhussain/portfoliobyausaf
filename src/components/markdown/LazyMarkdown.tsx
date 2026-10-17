/**
 * Markdown for the home page chapters, kept out of the first download (master spec P-2):
 * the parser loads on demand, and until it arrives the text shows as plain paragraphs, so
 * nothing is ever blank.
 */
import { lazy, Suspense } from 'react';
import { plainParagraphs } from './plainText';

const MarkdownImpl = lazy(() => import('./MarkdownImpl'));

export function LazyMarkdown({ children }: { children: string }) {
  return (
    <Suspense
      fallback={plainParagraphs(children).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    >
      <MarkdownImpl>{children}</MarkdownImpl>
    </Suspense>
  );
}
