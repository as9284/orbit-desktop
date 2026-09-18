/**
 * Renders a markdown-like string into an array of React elements.
 * Supports: # headings, **bold**, *italic*, ~~strikethrough~~,
 * bullet lists (- ), numbered lists (1. ), and line breaks.
 */
export function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const result: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listType: "ul" | "ol" | null = null;
  let key = 0;

  function flushList() {
    if (listType === "ul") {
      result.push(
        <ul key={key++} className="list-disc list-inside space-y-0.5">
          {listItems}
        </ul>,
      );
    } else if (listType === "ol") {
      result.push(
        <ol key={key++} className="list-decimal list-inside space-y-0.5">
          {listItems}
        </ol>,
      );
    }
    listItems = [];
    listType = null;
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    const ulMatch = line.match(/^[-*]\s+(.*)/);
    const olMatch = line.match(/^\d+\.\s+(.*)/);

    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const content = inlineFormat(headingMatch[2]);
      if (level === 1) {
        result.push(
          <h1
            key={key++}
            className="mt-1 text-xl font-semibold tracking-tight text-white"
          >
            {content}
          </h1>,
        );
      } else if (level === 2) {
        result.push(
          <h2 key={key++} className="mt-1 text-lg font-semibold text-white/95">
            {content}
          </h2>,
        );
      } else {
        result.push(
          <h3
            key={key++}
            className="mt-1 text-base font-semibold text-white/90"
          >
            {content}
          </h3>,
        );
      }
    } else if (ulMatch) {
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(<li key={key++}>{inlineFormat(ulMatch[1])}</li>);
    } else if (olMatch) {
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listItems.push(<li key={key++}>{inlineFormat(olMatch[1])}</li>);
    } else {
      flushList();
      if (line.trim() === "") {
        result.push(<br key={key++} />);
      } else {
        result.push(<p key={key++}>{inlineFormat(line)}</p>);
      }
    }
  }
  flushList();
  return result;
}

/** Applies inline formatting: bold, italic, strikethrough */
function inlineFormat(text: string): React.ReactNode {
  // Order matters: bold before italic since ** overlaps with *
  const regex = /(\*\*(.+?)\*\*|~~(.+?)~~|\*(.+?)\*)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let k = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      // **bold**
      parts.push(
        <strong key={k++} className="font-semibold text-white">
          {match[2]}
        </strong>,
      );
    } else if (match[3]) {
      // ~~strikethrough~~
      parts.push(
        <del key={k++} className="text-white/40">
          {match[3]}
        </del>,
      );
    } else if (match[4]) {
      // *italic*
      parts.push(
        <em key={k++} className="italic">
          {match[4]}
        </em>,
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length === 1 ? parts[0] : parts;
}

/**
 * Strips markdown syntax and returns plain text, suitable for compact
 * card previews where inline formatting is not needed.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/\*\*(.+?)\*\*/g, "$1") // **bold**
    .replace(/\*(.+?)\*/g, "$1") // *italic*
    .replace(/~~(.+?)~~/g, "$1") // ~~strikethrough~~
    .replace(/^[-*]\s+/gm, "") // unordered list markers
    .replace(/^\d+\.\s+/gm, "") // ordered list markers
    .replace(/\n+/g, " ") // collapse newlines to spaces
    .trim();
}
