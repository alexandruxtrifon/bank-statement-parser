const fs = require("fs");
const pdf = require("pdf-parse");

/**
 * Parse Banca Transilvania statement PDF file
 * @param {Buffer|string} file - Either a file path or a buffer containing PDF data
 * @returns {Promise<Array>} - Array of parsed transactions
 */

async function parseBTStatement(file) {
  let dataBuffer;

  if (typeof file === "string") {
    dataBuffer = fs.readFileSync(file);
  } else {
    dataBuffer = file;
  }

  const data = await pdf(dataBuffer);
  const text = data.text;


  const { accountInfo, transactions } = extractStatementData(text);

  return {
    accountInfo,
    transactions,
  };
}


/**
 * Extract all data from statement text in a single pass
 * @param {string} text - Raw text from PDF
 * @returns {Object} - Object with accountInfo and transactions
 */
function extractStatementData(text) {
  const lines = text.split("\n");
  
  const accountInfo = {
    accountOwner: "",
    clientNumber: "",
    iban: "",
    currency: "",
    finalBalance: null,
    turnover: {
      total: {
        debit: null,
        credit: null
      },
      daily: []
    },
    blockedAmounts: [],
  };
  
  const transactions = [];
  
  let currentDate = null;
  let transaction = null;
  let blockedAmountsSection = false;
  let inTransactionSection = false;
  
  const dateRegex = /^(\d{2}\/\d{2}\/\d{4})$/;
  const descStart = /^(Plata|Incasare|P2P|Constituire|Maturizare|Procesare|Comision)/i;
  const amountRegex = /(\d{1,3}(?:,\d{3})*\.\d{2})/;
  const ownerClientRegex = /([A-Z\s]+)Client:\s*(\d+)/;
  const ibanRegex = /Cod IBAN:\s*(RO\d+[A-Z0-9]+)/;
  const dailyTurnoverRegex = /(\d{2}\/\d{2}\/\d{4})RULAJ ZI/;
  const blockedAmountRegex = /-\s*([\d,.]+)\s*RON\s*aferenta\s*tranzactiei\s*(.*)/;
  const ownerRegex = /;\s*([^;]+);\s*$/;
  const endMarkers = ["RULAJ ZI", "SOLD FINAL ZI"];
  
  function finalizeTransaction() {
    if (transaction && transaction.amount != null) {
      transaction.description = transaction.description.trim().replace(/\s+/g, " ");
      
      const [d, m, y] = transaction.date.split("/");
      transaction.date = `${y}-${m}-${d}`;
      
      transactions.push(transaction);
      transaction = null;
    }
  }
  
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    
    if (!line || isHeaderOrFooterLine(line)) continue;
    
    
    const ownerClientMatch = line.match(ownerClientRegex);
    if (ownerClientMatch) {
      accountInfo.accountOwner = ownerClientMatch[1].trim();
      accountInfo.clientNumber = ownerClientMatch[2].trim();
    }
    
    const ibanMatch = line.match(ibanRegex);
    if (ibanMatch) {
      accountInfo.iban = ibanMatch[1].trim();
    }
    
    if (line.includes("Valuta") && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      if (nextLine.length >= 3) {
        accountInfo.currency = nextLine.substring(0, 3);
      }
    }
    
    if (line.includes("SOLD FINAL CONT") && i + 1 < lines.length) {
      const amountMatch = lines[i + 1].trim().match(/^(\d{1,3}(?:,\d{3})*\.\d{2})$/);
      if (amountMatch) {
        accountInfo.finalBalance = parseAmount(amountMatch[1]);
      }
    }
    
    const dailyTurnoverMatch = line.match(dailyTurnoverRegex);
    if (dailyTurnoverMatch && i + 1 < lines.length) {
      const date = dailyTurnoverMatch[1];
      const valuesLine = lines[i + 1].trim();
      
      if (valuesLine.length >= 5) {
        const creditStr = valuesLine.slice(-5); // Last 5 chars for credit (0.00)
        const debitStr = valuesLine.slice(0, -5); // Rest is debit (83.96)
        
        accountInfo.turnover.daily.push({
          date: date,
          debit: parseAmount(debitStr),
          credit: parseAmount(creditStr)
        });
      }
    }
    
    if (line.includes("RULAJ TOTAL CONT") && i + 1 < lines.length) {
      const totalValues = lines[i + 1].match(/(\d{1,3}(?:,\d{3})*\.\d{2})/g);
      
      if (totalValues && totalValues.length >= 2) {
        accountInfo.turnover.total.debit = parseAmount(totalValues[0]);
        accountInfo.turnover.total.credit = parseAmount(totalValues[1]);
      }
    }
    
    if (line.includes("SUME BLOCATE")) {
      blockedAmountsSection = true;
      continue;
    }
    
    if (blockedAmountsSection && line.includes("TOTAL DISPONIBIL")) {
      blockedAmountsSection = false;
      continue;
    }
    
    if (blockedAmountsSection) {
      const blockedAmountMatch = line.match(blockedAmountRegex);
      if (blockedAmountMatch) {
        accountInfo.blockedAmounts.push({
          amount: parseAmount(blockedAmountMatch[1]),
          description: blockedAmountMatch[2].trim()
        });
      }
    }
    
    
    if (line.match(/CONT|SOLD ANTERIOR/)) {
      inTransactionSection = true;
      continue;
    }
    
    if (!inTransactionSection) continue;
    
    const dateMatch = line.match(dateRegex);
    if (dateMatch) {
      currentDate = dateMatch[1];
      continue;
    }
    
    if (currentDate && descStart.test(line)) {
      finalizeTransaction();
      
      transaction = { 
        date: currentDate, 
        description: line + ' ', 
        amount: null, 
        type: null, 
        reference: null, 
        accountOwner: null 
      };
      continue;
    }
    
    if (transaction) {
      const amtMatch = line.match(amountRegex);
      if (amtMatch) {
        const amt = parseAmount(amtMatch[1]);
        const spaces = raw.search(/\S|$/);
        transaction.amount = amt;
        transaction.type = spaces >= 6 ? 'income' : 'expense';
        continue;
      }
      
      if (line.includes("REF:")) {
        transaction.reference = line.split('REF:')[1].trim();
        continue;
      }
      
      const ownerMatch = line.match(ownerRegex);
      if (ownerMatch) {
        transaction.accountOwner = ownerMatch[1].trim();
      }
      
      if (endMarkers.some(m => line.includes(m))) {
        finalizeTransaction();
      } else {
        transaction.description += line + ' ';
      }
    }
  }
  
  finalizeTransaction();
  
  return {
    accountInfo,
    transactions
  };
}

/**
 * Check if a line is part of header or footer that should be skipped
 * @param {string} line - Line to check
 * @returns {boolean} - True if line should be skipped
 */
function isHeaderOrFooterLine(line) {
  return /BANCA TRANSILVANIA|Info clienti|BT24@bancatransilvania\.ro|Solicitant:|Tiparit:|C\.U\.I\.|SWIFT:|www\.bancatransilvania\.ro|Clasificare BT:|\d+\s*\/\s*4/.test(line);
}





//---------------------------------

/**
 * Parse number amount from string
 * @param {string} amountStr - Amount as string
 * @returns {number} - Parsed amount
 */
function parseAmount(amountStr) {
  return parseFloat(amountStr.replace(/,/g, ""));
}

module.exports = { parseBTStatement };

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    console.log(`
Bank Statement Parser - Banca Transilvania
Usage: node bt.js [options] <input-file.pdf>

Options:
  -o, --output <file>    Output JSON file (default: stdout)
  -t, --text             Save extracted text to <input-file>.txt
  -h, --help             Show this help message
    `);
    process.exit(0);
  }

  let outputFile = null;
  let saveText = false;
  let inputFile = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-o" || args[i] === "--output") {
      outputFile = args[i + 1];
      i++;
    } else if (args[i] === "-t" || args[i] === "--text") {
      saveText = true;
    } else if (!inputFile && !args[i].startsWith("-")) {
      inputFile = args[i];
    }
  }

  if (!inputFile) {
    console.error("Error: No input file specified");
    process.exit(1);
  }

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: Input file "${inputFile}" not found`);
    process.exit(1);
  }

  (async () => {
    try {

      const dataBuffer = fs.readFileSync(inputFile);
      const data = await pdf(dataBuffer);

      if (saveText) {
        const textOutputFile = inputFile.replace(/\.pdf$/i, "") + ".txt";
        try {
          fs.writeFileSync(textOutputFile, data.text);
          console.log(`Raw text saved to ${textOutputFile}`);
        } catch (err) {
          console.error(`Error saving text file: ${err.message}`);
        }
      }

      const transactions = await parseBTStatement(dataBuffer);

      const jsonOutput = JSON.stringify(transactions, null, 2);

      if (outputFile) {
        try {
          fs.writeFileSync(outputFile, jsonOutput);
          console.log(`Results saved to ${outputFile}`);
        } catch (err) {
          console.error(`Error saving output file: ${err.message}`);
          console.log(jsonOutput);
        }
      } else {
        console.log(jsonOutput);
      }
    } catch (err) {
      console.error(`Error processing file: ${err.message}`);
      process.exit(1);
    }
  })();
}
