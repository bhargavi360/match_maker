import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { demoImportFieldMapping, prepareDemoProfiles } from "../src/domain/demo-profile-import";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node --import tsx scripts/prepare-demo-profiles.ts <dataset.json>");
  process.exitCode = 2;
} else {
  try {
    const content = await readFile(resolve(file), "utf8");
    const report = prepareDemoProfiles(JSON.parse(content));
    const grouped = new Map<string, number>();
    for (const issue of report.issues) {
      const key = `${issue.field} :: ${issue.code}`;
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }
    console.log(JSON.stringify({
      mode: "DRY_RUN_ONLY",
      reportStatus: "COMPLETED",
      dataset: resolve(file),
      records: report.total,
      coreValidRecords: report.coreValidRecords,
      invalidRecords: report.invalidRecords,
      duplicateRecords: report.duplicateRecords,
      genderCounts: report.genderCounts,
      uniqueStableIds: report.uniqueStableIds,
      preparedForLaterImport: report.prepared.length,
      readyForImport: report.issues.length === 0 && report.invalidRecords === 0 && report.unresolvedPreferences.length === 0 && report.prepared.length === 50,
      importBlocked: report.issues.length > 0 || report.invalidRecords > 0 || report.unresolvedPreferences.length > 0 || report.prepared.length !== 50,
      outputClassification: { kind: "DEMO", status: "ARCHIVED", reviewStatus: "PENDING" },
      idempotency: "Stable source IDs map to deterministic demoKey values; no database write is performed.",
      preferenceMapping: report.preferenceMapping,
      unresolvedPreferences: report.unresolvedPreferences,
      existingDemoKeyConflicts: { status: "NOT_CHECKED_DATABASE_FREE", count: null },
      fieldMapping: demoImportFieldMapping,
      skippedFields: report.skippedFields,
      validationErrors: [...grouped].map(([issue, count]) => ({ issue, count })),
    }, null, 2));
    if (report.issues.length > 0 || report.invalidRecords > 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof SyntaxError ? "Dataset is not valid JSON." : "Could not read the supplied dataset.");
    process.exitCode = 1;
  }
}
