# Export the consolidated speaking-content audit from Neon

The recommended one-file export is `export-speaking-content-audit.sql`. It is one read-only `SELECT` statement and returns one result set with `section`, `record_id`, and `data` columns. Full question, essay, and other text content is serialized into JSONB fields; the SQL does not truncate it.

## One-query export

1. Open Neon Console and select project **neon-lightBlue-river**, branch **main**, database **neondb**, and schema **public**.
2. Open **SQL Editor**.
3. Open `backend/scripts/export-speaking-content-audit.sql` locally and copy the entire file into the editor.
4. Execute the query once. Confirm it completes successfully and shows the three output columns.
5. Export that single result set as CSV. Use a filename such as `speaking-content-audit.csv` and ensure the export includes every row and the complete `data` JSON value.
6. Save and share the CSV for review. Do not share database credentials or connection strings.

The result includes table counts; course/module/task and theme/topic relationships; all speaking topics and Task 2 questions; essays; normalized vocabulary, grammar, criteria, and media; import-related ContentAuditLog entries; and duplicate/orphan candidates.

---

# Run the detailed speaking-content audit in Neon

The audit script contains only read-only `SELECT` queries. It does not change database contents or schema.

## Run it

1. Open the Neon Console and select project **neon-lightBlue-river**.
2. Select branch **main**, database **neondb**, and schema **public**.
3. Open **SQL Editor**.
4. Open `backend/scripts/audit-speaking-content.sql` locally and copy its contents into the editor.
5. Execute each labelled `Result NN` query section separately, in order. Select from the result-label comment through the ending semicolon and run that selection. This keeps every result available for export.
6. Confirm the editor reports successful `SELECT` statements. Do not edit the database connection settings or execute any other statements.

## Export these result sets

Export **every result set, Result 01 through Result 23**, as CSV (or JSON where the editor offers it). The content fields can be long; do not truncate or omit columns. Keep the result number in each exported filename, for example `result-10-task2-situations.csv`.

Most important for the next reconciliation step:

- Result 01: exact table counts.
- Results 02–07 and 23: course/module/task/status/publication/theme groupings.
- Results 08–10: actual topic relationships and all Task 1/Task 2 content.
- Results 11–13: normalized vocabulary, grammar, and exam criteria.
- Result 14: every Essay, its actual Task type, and legacy content fields; do not infer CLB versions.
- Result 15: media records and their Topic/Essay references.
- Result 17: import-related `ContentAuditLog` rows and snapshots.
- Results 18–22: duplicate candidates, exact duplicate text, orphan/logical associations, and dangling media IDs.

Save and share the exported result files for review. Do not share database credentials or connection strings. The audit can continue only after those results are available.
