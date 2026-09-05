import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

type MarkdownHighlight = { quote?: string; label?: string };

type InlineToken =
  | { kind: 'text'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'strong'; value: InlineToken[] }
  | { kind: 'em'; value: InlineToken[] }
  | { kind: 'link'; label: InlineToken[]; href: string };

type Block =
  | { kind: 'heading'; level: 2 | 3 | 4; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'blockquote'; text: string }
  | { kind: 'unordered'; items: string[] }
  | { kind: 'ordered'; items: string[] }
  | { kind: 'code'; text: string; language?: string }
  | { kind: 'rule' }
  | { kind: 'table'; headers: string[]; rows: string[][] };

function normalizeHighlight(highlights: MarkdownHighlight[]) {
  return highlights
    .filter((highlight): highlight is { quote: string; label?: string } => Boolean(highlight.quote?.trim()))
    .sort((a, b) => b.quote.length - a.quote.length);
}

function foldHighlightChar(char: string) {
  if (/\s/.test(char)) return '';
  if (/[*_`~]/.test(char)) return '';
  return char.toLocaleLowerCase();
}

function buildFoldedIndex(text: string) {
  const indexMap: number[] = [];
  let folded = '';
  for (let index = 0; index < text.length; index += 1) {
    const value = foldHighlightChar(text[index]);
    if (!value) continue;
    folded += value;
    indexMap.push(index);
  }
  return { folded, indexMap };
}

function foldedQuote(quote: string) {
  return [...quote].map(foldHighlightChar).join('');
}

function findHighlightMatch(text: string, cursor: number, highlights: ReturnType<typeof normalizeHighlight>) {
  const exact = highlights
    .map((highlight) => {
      const start = text.indexOf(highlight.quote, cursor);
      return { highlight, start, end: start + highlight.quote.length };
    })
    .filter((candidate) => candidate.start !== -1)
    .sort((a, b) => a.start - b.start || b.highlight.quote.length - a.highlight.quote.length)[0];

  if (exact) return exact;

  const foldedText = buildFoldedIndex(text);
  return highlights
    .map((highlight) => {
      const quote = foldedQuote(highlight.quote);
      if (!quote) return null;
      let searchFrom = 0;
      while (searchFrom < foldedText.folded.length) {
        const foldedStart = foldedText.folded.indexOf(quote, searchFrom);
        if (foldedStart === -1) return null;
        const start = foldedText.indexMap[foldedStart];
        const end = foldedText.indexMap[foldedStart + quote.length - 1] + 1;
        if (start >= cursor) return { highlight, start, end };
        searchFrom = foldedStart + 1;
      }
      return null;
    })
    .filter((candidate): candidate is { highlight: { quote: string; label?: string }; start: number; end: number } => Boolean(candidate))
    .sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start))[0];
}

function safeHref(href: string) {
  const trimmed = href.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  return '';
}

function findClosing(text: string, marker: string, start: number) {
  const index = text.indexOf(marker, start);
  return index > start ? index : -1;
}

function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let index = 0;

  while (index < text.length) {
    if (text[index] === '`') {
      const end = findClosing(text, '`', index + 1);
      if (end !== -1) {
        tokens.push({ kind: 'code', value: text.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }

    if (text.startsWith('**', index)) {
      const end = findClosing(text, '**', index + 2);
      if (end !== -1) {
        tokens.push({ kind: 'strong', value: tokenizeInline(text.slice(index + 2, end)) });
        index = end + 2;
        continue;
      }
    }

    if (text[index] === '*') {
      const end = findClosing(text, '*', index + 1);
      if (end !== -1) {
        tokens.push({ kind: 'em', value: tokenizeInline(text.slice(index + 1, end)) });
        index = end + 1;
        continue;
      }
    }

    if (text[index] === '[') {
      const labelEnd = text.indexOf('](', index + 1);
      if (labelEnd !== -1) {
        const hrefEnd = text.indexOf(')', labelEnd + 2);
        if (hrefEnd !== -1) {
          const href = safeHref(text.slice(labelEnd + 2, hrefEnd));
          if (href) {
            tokens.push({ kind: 'link', label: tokenizeInline(text.slice(index + 1, labelEnd)), href });
            index = hrefEnd + 1;
            continue;
          }
        }
      }
    }

    const nextSpecial = ['`', '*', '[']
      .map((marker) => text.indexOf(marker, index + 1))
      .filter((next) => next !== -1)
      .sort((a, b) => a - b)[0] ?? text.length;
    tokens.push({ kind: 'text', value: text.slice(index, nextSpecial) });
    index = nextSpecial;
  }

  return tokens;
}

function renderTextWithHighlights(text: string, keyPrefix: string, highlights: ReturnType<typeof normalizeHighlight>) {
  if (highlights.length === 0) return text.split('\n').flatMap((part, index) => index === 0 ? [part] : [<br key={`${keyPrefix}-br-${index}`} />, part]);

  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  while (cursor < text.length) {
    const match = findHighlightMatch(text, cursor, highlights);

    if (!match) break;
    if (match.start > cursor) nodes.push(...renderTextWithHighlights(text.slice(cursor, match.start), `${keyPrefix}-${key++}`, []));
    nodes.push(
      <mark key={`${keyPrefix}-mark-${key++}`} className="rounded bg-destructive/15 px-1 text-foreground underline decoration-destructive decoration-2" title={match.highlight.label}>
        {text.slice(match.start, match.end)}
      </mark>
    );
    cursor = match.end;
  }

  if (cursor < text.length) nodes.push(...renderTextWithHighlights(text.slice(cursor), `${keyPrefix}-${key++}`, []));
  return nodes;
}

function renderInline(tokens: InlineToken[], keyPrefix: string, highlights: ReturnType<typeof normalizeHighlight>): ReactNode[] {
  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (token.kind === 'text') return <span key={key}>{renderTextWithHighlights(token.value, key, highlights)}</span>;
    if (token.kind === 'code') return <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.92em] text-foreground">{token.value}</code>;
    if (token.kind === 'strong') return <strong key={key} className="font-semibold text-foreground">{renderInline(token.value, key, highlights)}</strong>;
    if (token.kind === 'em') return <em key={key}>{renderInline(token.value, key, highlights)}</em>;
    return <a key={key} href={token.href} target={token.href.startsWith('http') ? '_blank' : undefined} rel={token.href.startsWith('http') ? 'noreferrer' : undefined} className="font-medium text-primary underline underline-offset-4">{renderInline(token.label, key, highlights)}</a>;
  });
}

function splitTableRow(line: string) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}

function isTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function parseMarkdown(text: string): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```\s*([\w-]+)?\s*$/);
    if (fence) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      blocks.push({ kind: 'code', text: codeLines.join('\n'), language: fence[1] });
      index += index < lines.length ? 1 : 0;
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      blocks.push({ kind: 'rule' });
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      blocks.push({ kind: 'heading', level: Math.min(Math.max(heading[1].length, 2), 4) as 2 | 3 | 4, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (index + 1 < lines.length && line.includes('|') && isTableSeparator(lines[index + 1])) {
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push({ kind: 'table', headers, rows });
      continue;
    }

    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    if (unordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*[-*]\s+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push({ kind: 'unordered', items });
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*\d+[.)]\s+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push({ kind: 'ordered', items });
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      blocks.push({ kind: 'blockquote', text: quoteLines.join('\n') });
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,4})\s+/.test(lines[index]) && !/^\s*([-*]|\d+[.)])\s+/.test(lines[index]) && !/^```/.test(lines[index]) && !/^\s*>\s?/.test(lines[index])) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push({ kind: 'paragraph', text: paragraphLines.join('\n') });
  }

  return blocks;
}

type MarkdownContentProps = Omit<ComponentProps<'div'>, 'children'> & {
  content: string;
  highlights?: MarkdownHighlight[];
};

export function MarkdownContent({ content, className, highlights = [], ...props }: MarkdownContentProps) {
  const normalizedHighlights = normalizeHighlight(highlights);
  const blocks = parseMarkdown(content);

  return (
    <div className={cn('space-y-3 text-sm leading-7 text-foreground', className)} {...props}>
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          const Heading = `h${block.level}` as 'h2' | 'h3' | 'h4';
          return <Heading key={index} className="mt-4 font-heading text-base font-semibold leading-7 first:mt-0">{renderInline(tokenizeInline(block.text), `h-${index}`, normalizedHighlights)}</Heading>;
        }
        if (block.kind === 'paragraph') return <p key={index}>{renderInline(tokenizeInline(block.text), `p-${index}`, normalizedHighlights)}</p>;
        if (block.kind === 'blockquote') return <blockquote key={index} className="border-l-4 border-primary/35 bg-primary/5 py-2 pl-3 text-muted-foreground">{renderInline(tokenizeInline(block.text), `bq-${index}`, normalizedHighlights)}</blockquote>;
        if (block.kind === 'unordered') return <ul key={index} className="ml-5 list-disc space-y-1">{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(tokenizeInline(item), `ul-${index}-${itemIndex}`, normalizedHighlights)}</li>)}</ul>;
        if (block.kind === 'ordered') return <ol key={index} className="ml-5 list-decimal space-y-1">{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(tokenizeInline(item), `ol-${index}-${itemIndex}`, normalizedHighlights)}</li>)}</ol>;
        if (block.kind === 'code') return <pre key={index} className="overflow-x-auto rounded-lg border bg-muted/70 p-3 text-xs leading-6"><code>{block.text}</code></pre>;
        if (block.kind === 'rule') return <hr key={index} className="border-border/70" />;
        return (
          <div key={index} className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-96 text-left text-xs">
              <thead className="bg-muted/70 text-foreground">
                <tr>{block.headers.map((header, cellIndex) => <th key={cellIndex} className="border-b px-3 py-2 font-medium">{renderInline(tokenizeInline(header), `th-${index}-${cellIndex}`, normalizedHighlights)}</th>)}</tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-t">
                    {block.headers.map((_, cellIndex) => <td key={cellIndex} className="px-3 py-2 align-top">{renderInline(tokenizeInline(row[cellIndex] ?? ''), `td-${index}-${rowIndex}-${cellIndex}`, normalizedHighlights)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
