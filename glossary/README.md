# glossary/

Hand-written glossary pages for the
[databricks.com glossary](https://www.databricks.com/glossary). They are
handed to the web team rather than emitted, so no tooling reads this folder.

Each page adapts a factory explanation page (named in `source:`) to the
glossary register:

- A question title ("What is …?") and question-style H2s.
- A neutral body that covers every major format or engine fairly.
- One closing "… on Databricks" section for product framing.
- A list of further resources, then an FAQ.
- Frontmatter for the web team: `title`, `slug`, `meta_description`,
  `target`, `source`, `status`.

When facts change in the source page, update the glossary page in the same PR.
