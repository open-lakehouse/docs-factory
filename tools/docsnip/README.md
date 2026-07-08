# docsnip

Content tooling for docs-factory. Keeps the authoritative content in `content/`
consistent and agent-discoverable, without coupling to any static-site generator.

```console
$ docsnip validate       # check frontmatter (controlled vocabularies, required fields)
$ docsnip snippetcheck   # verify every snippet fence resolves to a unique source region
$ docsnip generate       # (re)generate site-artifacts/ (manifest + per-project llms.txt)
$ docsnip check          # CI: validate + snippetcheck + assert artifacts are up to date
```

`docsnip` does **not** expand snippets into the markdown — the downstream Astro
build resolves `file=/start=/end=` fences live via
[`remark-code-snippets`](https://github.com/jknoxville/remark-code-snippets).
`docsnip snippetcheck` mirrors that plugin's failure conditions so drift is caught
in this repo's CI too.
