import { useRef, useCallback, useEffect } from "react";
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
} from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  hasError?: boolean;
}

type Format =
  | "h1"
  | "h2"
  | "h3"
  | "bold"
  | "italic"
  | "strikethrough"
  | "ul"
  | "ol";

const TOOLBAR: { fmt: Format; icon: typeof Bold; label: string }[] = [
  { fmt: "h1", icon: Heading1, label: "Heading 1" },
  { fmt: "h2", icon: Heading2, label: "Heading 2" },
  { fmt: "h3", icon: Heading3, label: "Heading 3" },
  { fmt: "bold", icon: Bold, label: "Bold" },
  { fmt: "italic", icon: Italic, label: "Italic" },
  { fmt: "strikethrough", icon: Strikethrough, label: "Strikethrough" },
  { fmt: "ul", icon: List, label: "Bullet list" },
  { fmt: "ol", icon: ListOrdered, label: "Numbered list" },
];

// ─── Markdown → HTML ─────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineMdToHtml(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
  s = s.replace(/~~(.+?)~~/g, "<s>$1</s>");
  return s || "<br>";
}

function markdownToHtml(md: string): string {
  if (!md) return "";
  const lines = md.split("\n");
  const parts: string[] = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      parts.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      parts.push("</ol>");
      inOl = false;
    }
  };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    const ulMatch = line.match(/^[-*]\s+(.*)/);
    const olMatch = line.match(/^\d+\.\s+(.*)/);

    if (headingMatch) {
      closeLists();
      const level = headingMatch[1].length;
      parts.push(`<h${level}>${inlineMdToHtml(headingMatch[2])}</h${level}>`);
    } else if (ulMatch) {
      if (inOl) {
        parts.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        parts.push("<ul>");
        inUl = true;
      }
      parts.push(`<li>${inlineMdToHtml(ulMatch[1])}</li>`);
    } else if (olMatch) {
      if (inUl) {
        parts.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        parts.push("<ol>");
        inOl = true;
      }
      parts.push(`<li>${inlineMdToHtml(olMatch[1])}</li>`);
    } else {
      closeLists();
      parts.push(`<div>${inlineMdToHtml(line)}</div>`);
    }
  }

  closeLists();
  return parts.join("");
}

// ─── HTML → Markdown ─────────────────────────────────────────────────────────

function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return walkNodes(doc.body).trim();
}

function walkNodes(node: Node): string {
  let out = "";

  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent ?? "";
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();

    switch (tag) {
      case "h1":
      case "h2":
      case "h3": {
        if (out && !out.endsWith("\n")) out += "\n";
        const level = Number(tag[1]);
        out += `${"#".repeat(level)} ${walkNodes(el)}`;
        if (!out.endsWith("\n")) out += "\n";
        break;
      }
      case "strong":
      case "b":
        out += `**${walkNodes(el)}**`;
        break;
      case "em":
      case "i":
        out += `*${walkNodes(el)}*`;
        break;
      case "s":
      case "del":
      case "strike":
        out += `~~${walkNodes(el)}~~`;
        break;
      case "ul":
        for (const li of Array.from(el.children)) {
          if (out && !out.endsWith("\n")) out += "\n";
          out += `- ${walkNodes(li)}`;
        }
        if (out && !out.endsWith("\n")) out += "\n";
        break;
      case "ol": {
        let idx = 1;
        for (const li of Array.from(el.children)) {
          if (out && !out.endsWith("\n")) out += "\n";
          out += `${idx++}. ${walkNodes(li)}`;
        }
        if (out && !out.endsWith("\n")) out += "\n";
        break;
      }
      case "li":
        out += walkNodes(el);
        break;
      case "br":
        out += "\n";
        break;
      case "div":
      case "p":
        if (out && !out.endsWith("\n")) out += "\n";
        out += walkNodes(el);
        break;
      default:
        out += walkNodes(el);
    }
  }

  return out;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Add a description (optional)",
  maxLength = 2000,
  hasError,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const internalChange = useRef(false);
  const lastMd = useRef(value);

  // Set initial HTML on mount
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = markdownToHtml(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync when value changes externally (not from our own input)
  useEffect(() => {
    if (internalChange.current) {
      internalChange.current = false;
      return;
    }
    if (value !== lastMd.current && editorRef.current) {
      editorRef.current.innerHTML = markdownToHtml(value);
      lastMd.current = value;
    }
  }, [value]);

  const syncToParent = useCallback(() => {
    if (!editorRef.current) return;
    const md = htmlToMarkdown(editorRef.current.innerHTML);
    if (maxLength && md.length > maxLength) {
      editorRef.current.innerHTML = markdownToHtml(lastMd.current);
      return;
    }
    lastMd.current = md;
    internalChange.current = true;
    onChange(md);
  }, [onChange, maxLength]);

  const handleFormat = useCallback(
    (fmt: Format) => {
      editorRef.current?.focus();
      switch (fmt) {
        case "h1":
          document.execCommand("formatBlock", false, "<h1>");
          break;
        case "h2":
          document.execCommand("formatBlock", false, "<h2>");
          break;
        case "h3":
          document.execCommand("formatBlock", false, "<h3>");
          break;
        case "bold":
          document.execCommand("bold");
          break;
        case "italic":
          document.execCommand("italic");
          break;
        case "strikethrough":
          document.execCommand("strikethrough");
          break;
        case "ul":
          document.execCommand("insertUnorderedList");
          break;
        case "ol":
          document.execCommand("insertOrderedList");
          break;
      }
      syncToParent();
    },
    [syncToParent],
  );

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  }, []);

  const isEmpty = !value.trim();

  return (
    <div
      className={`rounded-xl border transition-all duration-200 ${
        hasError
          ? "border-danger/40"
          : "border-border-default focus-within:border-accent/35"
      } bg-tint-1 focus-within:bg-tint-2`}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2.5 py-1.5 border-b border-border-subtle">
        {TOOLBAR.map(({ fmt, icon: Icon, label }) => (
          <button
            key={fmt}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleFormat(fmt)}
            className="p-1.5 rounded-md text-text-faint hover:text-text-secondary hover:bg-tint-3 transition-all duration-150"
            aria-label={label}
            title={label}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>

      {/* Editable area */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          onInput={syncToParent}
          onPaste={handlePaste}
          role="textbox"
          aria-multiline="true"
          aria-placeholder={placeholder}
          className="w-full bg-transparent px-3.5 py-3 text-text-primary text-sm outline-none min-h-35 leading-relaxed [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-white [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white/95 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-white/90 [&_strong]:font-semibold [&_strong]:text-white [&_b]:font-semibold [&_b]:text-white [&_s]:text-white/40 [&_strike]:text-white/40 [&_ul]:list-disc [&_ul]:list-inside [&_ul]:space-y-0.5 [&_ol]:list-decimal [&_ol]:list-inside [&_ol]:space-y-0.5"
        />
        {isEmpty && (
          <div
            className="absolute top-3 left-3.5 text-sm text-text-faint pointer-events-none select-none"
            aria-hidden="true"
          >
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}
