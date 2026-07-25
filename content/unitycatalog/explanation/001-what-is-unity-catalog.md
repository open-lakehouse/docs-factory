---
title: What is Unity Catalog?
summary: An to Unity Catalog, the open lakehouse catalog.
diataxis: explanation
project: unitycatalog
status: draft
---

> Unity Catalog is a unified and open governance solution for data and AI assets.
> It helps teams and organizations discover, secure, govern, and share trusted data
> and AI across clouds and platforms from a single control plane.

If you dealt with catalogs before, you have probably seen the description above
or something very similar to it. And while this sounds great let's disscet this
sentence to understand what a modern lakehouse catalog and Unity Catalog specifically
offers and why that is important.

Long before the Open Lakehouse saw the light of day, data systems relied on catalogs
for their most basic operations.

```sql
SELECT * FROM my.interesting.table;
```

When a data systems resolves that query it must somehow decide which files
`my.interesting.table` to read this tables' data from and if the current
user/principal is allowed to read that data. It also needs to make some
sense of what `*` might resolve to, i.e. what the schema of the table being queried
is. This has long been the responsibility of the catalog.

When the [lakehouse architecture] was introiduced, we in many ways de-constructed
the traditional monolithic architecture and separated storage and compute and
moved some responsibilities of the catalog, i.e. schema resolution, ACID, ...,
into the emerging open table formats. Due to the nature of the early lakehouses,
large-scale analytical systems, the catalog was barely visible and a table lookup
often reduced to a file path being provided.

The success of the lakehouse architecture and by consequence its widespread
adoption however surfaced the need to simplify discovery and not only bring
transactional properties from the warehouse to the data lake, but also govern
an increasingly complex data estate.

[lakehouse architecture]: https://www.databricks.com/blog/what-is-data-lakehouse
