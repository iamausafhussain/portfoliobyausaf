/** Plain-text stand-in for markdown while the renderer loads (see LazyMarkdown). */

/** Paragraphs split on blank lines, with the most common markdown marks stripped. */
export function plainParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[*_`#>]+/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
}
