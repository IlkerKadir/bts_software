const XLSX = require("xlsx");
const workbook = XLSX.readFile("teklif_formati.xlsx");

console.log("=== SHEET NAMES ===");
console.log(workbook.SheetNames);

for (const sheetName of workbook.SheetNames) {
  console.log("\n\n========================================");
  console.log("SHEET:", sheetName);
  console.log("========================================");
  const sheet = workbook.Sheets[sheetName];
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  console.log("Range:", sheet["!ref"]);
  console.log("Rows:", range.e.r + 1, "Cols:", range.e.c + 1);

  if (sheet["!merges"]) {
    console.log("\nMerged cells:", sheet["!merges"].length);
    sheet["!merges"].forEach(m => {
      console.log("  ", XLSX.utils.encode_range(m));
    });
  }

  console.log("\n--- CELL DATA ---");
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  jsonData.forEach((row, i) => {
    const nonEmpty = row.filter(c => c !== "");
    if (nonEmpty.length > 0) {
      console.log("Row " + (i + 1) + ": " + JSON.stringify(row));
    }
  });
}
