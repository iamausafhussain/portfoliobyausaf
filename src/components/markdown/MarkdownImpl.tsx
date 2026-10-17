/** The markdown renderer itself; loaded on demand by <LazyMarkdown>. */
import Markdown from 'react-markdown';

export default function MarkdownImpl({ children }: { children: string }) {
  return <Markdown skipHtml>{children}</Markdown>;
}
