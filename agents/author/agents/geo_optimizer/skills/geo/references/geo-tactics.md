# GEO tactics: the evidence behind the moves

This is what the `geo` skill's moves rest on. Use it to decide close calls, not
as a checklist. The checklist is `blogs/QUALITY.md` facet (f).

## The measured result

Aggarwal et al., *GEO: Generative Engine Optimization*, KDD 2024
([arXiv:2311.09735](https://arxiv.org/abs/2311.09735)), ran nine content
rewrites against generative-engine answers on their GEO-bench queries. They
measured how much of each source the engine's answer used, weighted by
position.

| Method | Finding |
|---|---|
| Cite Sources, Quotation Addition, Statistics Addition | Best: 30–40% relative improvement in position-adjusted word count |
| Fluency Optimization, Easy-to-Understand | 15–30% boost |
| Authoritative (persuasive tone) | No significant improvement |
| Keyword Stuffing | Little to no improvement |

The paper also reports that effectiveness **varies by domain**. Treat the
numbers as direction, not a guarantee for technical posts.

What this means for us:
- Sourced specifics are the lever. Inline citations, a quoted line from a
  primary source (a maintainer's words, a spec, a release note), and concrete
  numbers or versions all count. This matches QUALITY.md facet (a)'s fact
  density.
- Clear prose helps. This is the humanizer pass and short paragraphs, already
  in CONVENTIONS §8.
- Sounding authoritative doesn't help. Swagger and hedging-free assertion
  aren't citability. Our stance is there for the reader. It isn't a GEO
  tactic, and GEO must not strip it.
- Keyword stuffing doesn't work here either. It's on QUALITY.md's reject list.

## How answer engines pick passages (working model)

Answer engines retrieve chunks, not pages. A passage gets lifted when it:
- **stands alone**: it names its subject, defines its terms, and answers in its
  first sentence
- **matches the question's vocabulary and entities**: canonical product names
  and versions, the terms people search with (take these from the probe)
- **carries checkable specifics**: a number, a version, a comparison row, a
  runnable command
- **is current and attributable**: dated facts, pinned versions, a named author

This is a working model built from the paper and from observing engines (the
`answer_probe` report). It isn't a vendor-published spec. When the probe
contradicts it for a given question, trust the probe.

## Already handled elsewhere: don't duplicate in the draft

- `llms.txt`, the `.md` twins, and sitemaps come from the docs emitter
  (`docs/design/agentic-docs.md`). They aren't the post's job.
- Schema.org (`BlogPosting`, `FAQPage`, `HowTo`, `Person`, `Organization`) is
  rendered by the publishing target (QUALITY.md "Publish-target concerns").
  The GEO pass only proposes values in `geo.md`.
