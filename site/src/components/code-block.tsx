// code-block.tsx — the render side of a fenced code block. remark-code-block
// turns every ```fence into <CodeBlock code=… lang=… filename=… />; this wraps
// the Kibo code-block (client-side Shiki) with our chrome: a header (filename +
// language) and a real copy button.
//
// Client-side highlighting (not build-time) so we can add multi-file / multi-
// language TABS later — Kibo's `data` array + CodeBlockSelect already models
// them; today we pass a single entry. Highlighting is async (a fallback shows
// the plain code until Shiki resolves).
//
// Styling: the .cb-* classes in index.css keep the DevHub console / Delta look;
// Kibo's own chrome (header/select) is bypassed — we drive CodeBlockItem +
// CodeBlockContent directly and supply our own header.
import {
  CodeBlock as Kct,
  CodeBlockBody,
  CodeBlockContent,
  CodeBlockItem,
  CodeBlockCopyButton,
  type BundledLanguage,
} from "@/components/kibo-ui/code-block";

// Shiki themes matched to the console look: a dark theme in both modes (the code
// surface is near-black --code-bg in light and dark alike). Kibo swaps to the
// `dark` theme under a `.dark` ancestor; we give both keys the same dark theme
// so the block reads identically in both site themes.
const THEMES = { light: "github-dark-dimmed", dark: "github-dark-dimmed" } as const;

interface CodeBlockProps {
  code: string;
  lang?: string;
  filename?: string;
}

export function CodeBlock({ code, lang = "text", filename }: CodeBlockProps) {
  // Kibo keys files by `language`; with one file we use the language as the value.
  const value = lang;
  const data = [{ language: lang, filename: filename ?? "", code }];

  return (
    <Kct
      data={data}
      defaultValue={value}
      className="cb border-0"
    >
      <div className={filename ? "cb-head" : "cb-head cb-head-nameonly"}>
        <div className="cb-dots" aria-hidden="true">
          <span className="cb-dot cb-dot-red" />
          <span className="cb-dot cb-dot-yellow" />
          <span className="cb-dot cb-dot-green" />
        </div>
        {filename && (
          <div className="cb-tabs">
            <span className="cb-tab">{filename}</span>
          </div>
        )}
        <span className="cb-lang">{lang}</span>
        <CodeBlockCopyButton className="cb-copy" />
      </div>
      <CodeBlockBody>
        {(item) => (
          <CodeBlockItem key={item.language} value={item.language} lineNumbers={false}>
            <CodeBlockContent language={item.language as BundledLanguage} themes={THEMES}>
              {item.code}
            </CodeBlockContent>
          </CodeBlockItem>
        )}
      </CodeBlockBody>
    </Kct>
  );
}
