const fs = require('fs');
const pdf = require('pdf-parse');

// const readPDF = async (filePath) => {
//   const dataBuffer = fs.readFileSync(filePath);
//   const data = await pdfParse(dataBuffer);
//   return data.text;
// };

// function parseBTStatement(text) {
//   const lines = text.split('\n').map(line => line.trim()).filter(line => line);
//   const transactions = [];

//   const transactionRegex = /^(\d{2}\.\d{2}\.\d{4})\s+(.+?)\s+(-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))\s+(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))$/;

//   for (const line of lines) {
//     const match = line.match(transactionRegex);
//     if (match) {
//       const [, date, description, amount, balance] = match;
//       transactions.push({
//         date,
//         description,
//         amount: parseFloat(amount.replace(/\./g, '').replace(',', '.')),
//         balance: parseFloat(balance.replace(/\./g, '').replace(',', '.')),
//       });
//     }
//   }

//   return transactions;
// }

// (async () => {
//   const pdfText = await readPDF('./Aprilie 2025.pdf');
//   const transactions = parseBTStatement(pdfText);
//   console.log(transactions);
// })();

let dataBuffer = fs.readFileSync('./Aprilie 2025.pdf');
pdf(dataBuffer).then(function(data) {
    //console.log(data);
    fs.writeFileSync('output.txt', data.text, (err) => {
        if (err) {
            console.error('Error writing to file', err);
        } else {
            console.log('PDF text extracted and saved to output.txt');
        }
    })
        // number of pages
    console.log(data.numpages);
    // number of rendered pages
    console.log(data.numrender);
    // PDF info
    console.log(data.info);
    // PDF metadata
    console.log(data.metadata); 
    // PDF.js version
    // check https://mozilla.github.io/pdf.js/getting_started/
    console.log(data.version);
    // PDF text
    console.log(data.text); 
});