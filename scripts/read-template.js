const XLSX = require('xlsx');
const workbook = XLSX.readFile('teklif_formati.xlsx');
console.log('=== SHEET NAMES ===');
console.log(workbook.SheetNames);
for (const sheetName of workbook.SheetNames) {
  console.log('\n========================================');
  console.log('SHEET:', sheetName);
  console.log('========================================');
  const sheet = workbook.Sheets[sheetName];
  console.log('Range:', sheet['!ref']);
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  jsonData.forEach((row, i) => {
    const nonEmpty = row.filter(c => c !== '');
    if (nonEmpty.length > 0) {
      console.log('Row ' + (i + 1) + ': ' + JSON.stringify(row));
    }
  });
}
