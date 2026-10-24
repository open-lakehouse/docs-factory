import { expect, test } from "bun:test";
import { renderMarkdownToHtml } from "../render-markdown.mjs";

test("frontmatter renders as a table of its keys and values", () => {
  const html = renderMarkdownToHtml(
    "---\ntitle: Credential vending\nupdated: 2026-10-24\n---\n\n# Body\n",
  );
  expect(html).toStartWith(
    '<table class="frontmatter"><tbody>' +
      '<tr><th scope="row">title</th><td>Credential vending</td></tr>' +
      '<tr><th scope="row">updated</th><td>2026-10-24</td></tr></tbody></table>',
  );
  expect(html).toContain("<h1>Body</h1>");
  expect(html).not.toContain("<hr>");
});

test("lists and mappings nest tables, and values are escaped", () => {
  const html = renderMarkdownToHtml(
    "---\ntags: [a, b]\ncompanions:\n  - url: /x.py\n    note: <b>hi</b>\n---\nText\n",
  );
  expect(html).toContain(
    "<td><table><tbody><tr><td>a</td></tr><tr><td>b</td></tr></tbody></table></td>",
  );
  expect(html).toContain('<th scope="row">url</th><td>/x.py</td>');
  expect(html).toContain('<th scope="row">note</th><td>&#x3C;b>hi&#x3C;/b></td>');
});

test("frontmatter that isn't a YAML mapping shows as its source", () => {
  const html = renderMarkdownToHtml("---\n: [broken\n---\nText\n");
  expect(html).toStartWith('<pre><code class="language-yaml">: [broken</code></pre>');
  expect(html).toContain("<p>Text</p>");
});

test("a body without frontmatter renders unchanged", () => {
  expect(renderMarkdownToHtml("Text\n\n---\n\nMore\n")).toBe("<p>Text</p>\n<hr>\n<p>More</p>");
});
