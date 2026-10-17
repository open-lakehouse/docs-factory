# Spec: explain Delta time travel

Facts from content/delta/how-to/002-query-a-table-as-of-version.

- Each operation that modifies a Delta Lake table creates a new table version,
  recorded in its transaction log.
- Time travel reads an older snapshot by version number or by timestamp.
- Readers use it to reproduce a report, audit a change, or compare before and
  after.
- To read an earlier version, both its log entries and its data files must
  still exist. `VACUUM` deletes unreferenced data files older than
  `delta.deletedFileRetentionDuration` (7 days by default). Log entries older
  than `delta.logRetentionDuration` (30 days by default) are removed after a
  checkpoint.
- To keep a longer history, raise both properties on the table.
