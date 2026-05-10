import * as xlsx from 'xlsx';

async function main() {
  const url = 'https://docs.google.com/spreadsheets/d/1Ld72zxGyRBm-5w_B7H0WOYJoDT8REpzERUhWZW8h5LE/export?format=xlsx';
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  console.log("Sheet Names:", workbook.SheetNames);
  
  const sheetName = workbook.SheetNames.find(s => s.toLowerCase().includes('veri seti')) || workbook.SheetNames[1];
  if (sheetName) {
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);
    console.log(`\nData from ${sheetName} (first 3 rows):`);
    console.log(JSON.stringify(data.slice(0, 3), null, 2));
  }
}

main().catch(console.error);
