---
id: peer-review/figures-citations
title: Peer Review — figures, tables and citations
phases: report, observer, review
priority: 3
when: \b(charts?|graphs?|tables?|figures?|diagrams?|axis|axes|legend|citations?|references?|sources?)\b
when_in: observer, review
upstream: SKILL.md §Review workflow 8
---

### 8. Review figures, tables, and citations

For figures and tables, assess:

- Consistency with text and supplements
- Denominators, units, axes, scales, uncertainty, and legends
- Accessible encoding and sufficient context
- Image acquisition/processing disclosure and source-data policy

There is no image or PDF pipeline here; review figures/tables/charts as described in the text or code.

For the report and EVIDENCE lines, the citation auditor (ported into tools/peer-review.ts) runs automatically: it checks that cited sources are consistent (duplicates, sources cited but never listed, listed but never cited) and that identifiers/URLs are well-formed. It checks consistency only; it does not verify that a source exists or supports a claim.
