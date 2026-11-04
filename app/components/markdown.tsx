import { Fragment, type ReactNode } from "react";
import { safeLink } from "../lib/model";

/** Render a small Markdown subset as React nodes; raw HTML is always plain text. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/),
      url = link && safeLink(link[2]);
    if (link && url)
      return (
        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
          {link[1]}
        </a>
      );
    return <Fragment key={i}>{part}</Fragment>;
  });
}
export default function Markdown({ text }: { text: string }) {
  const lines = text.split("\n"),
    nodes: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const language = line.slice(3).trim(),
        body = [];
      while (++i < lines.length && !lines[i].startsWith("```")) body.push(lines[i]);
      nodes.push(
        <div className="code-block" key={i}>
          {language && <small>{language}</small>}
          <pre>
            <code>{body.join("\n")}</code>
          </pre>
        </div>,
      );
    } else if (/^#{1,3} /.test(line)) {
      const n = line.indexOf(" "),
        value = inline(line.slice(n + 1));
      nodes.push(
        n === 1 ? (
          <h2 key={i}>{value}</h2>
        ) : n === 2 ? (
          <h3 key={i}>{value}</h3>
        ) : (
          <h4 key={i}>{value}</h4>
        ),
      );
    } else if (/^[-*] /.test(line))
      nodes.push(
        <p className="markdown-bullet" key={i}>
          • {inline(line.slice(2))}
        </p>,
      );
    else if (/^\d+\. /.test(line))
      nodes.push(
        <p className="markdown-bullet" key={i}>
          {inline(line)}
        </p>,
      );
    else if (line.startsWith("> "))
      nodes.push(<blockquote key={i}>{inline(line.slice(2))}</blockquote>);
    else if (line.trim() === "---") nodes.push(<hr key={i} />);
    else nodes.push(<p key={i}>{line ? inline(line) : <br />}</p>);
  }
  return <>{nodes}</>;
}
