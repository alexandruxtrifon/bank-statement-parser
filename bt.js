const fs = require("fs");
const pdf = require("pdf-parse");

/**
 * Parse a Banca Transilvania statement PDF file
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

  // Extract account information and transactions
  // const accountInfo = extractAccountInfo(text);
  // const transactions = extractTransactions(text);
  const { accountInfo, transactions } = extractStatementData(text);

  return {
    accountInfo,
    transactions,
  };
}

/**
 * Extract account information from statement text
 * @param {string} text - Raw text from PDF
 * @returns {Object} - Account information
 */
function extractAccountInfoo(text) {
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

  // Find account owner and client number
  const ownerClientRegex = /([A-Z\s]+)Client:\s*(\d+)/;
  for (let i = 0; i < lines.length; i++) {
    const ownerClientMatch = lines[i].match(ownerClientRegex);
    if (ownerClientMatch) {
      accountInfo.accountOwner = ownerClientMatch[1].trim();
      accountInfo.clientNumber = ownerClientMatch[2].trim();
      break;
    }
  }

  // Find IBAN and currency
  const ibanRegex = /Cod IBAN:\s*(RO\d+[A-Z0-9]+)/;
  for (let i = 0; i < lines.length; i++) {
    const ibanMatch = lines[i].match(ibanRegex);
    if (ibanMatch) {
      accountInfo.iban = ibanMatch[1].trim();
    }

    // Look for "Valuta" and then extract currency from the beginning of the next line
    if (lines[i].includes("Valuta")) {
      // Check if there is a next line and extract first 3 letters (currency code)
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine.length >= 3) {
          accountInfo.currency = nextLine.substring(0, 3);
        }
      }
    }
  }

  // Find final balance
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("SOLD FINAL CONT")) {
      // Final balance amount is on the next line
      if (i + 1 < lines.length) {
        const amountMatch = lines[i + 1]
          .trim()
          .match(/^(\d{1,3}(?:,\d{3})*\.\d{2})$/);
        if (amountMatch) {
          accountInfo.finalBalance = parseAmount(amountMatch[1]);
          break;
        }
      }
    }
  }

// Find daily turnovers
for (let i = 0; i < lines.length; i++) {
  // Check for RULAJ ZI lines in the format DD/MM/YYYY RULAJ ZI
  if (lines[i].includes("RULAJ ZI") && 
      lines[i].match(/\d{2}\/\d{2}\/\d{4}RULAJ ZI/)) {
    
    const dateMatch = lines[i].match(/(\d{2}\/\d{2}\/\d{4})RULAJ ZI/);
    if (dateMatch && i + 1 < lines.length) {
      const date = dateMatch[1];
      
      // Parse the next line which contains the debit and credit values
      const valuesLine = lines[i + 1].trim();
      
      // The format is like "83.960.00" where we need to split into two values
      // Each value has exactly 2 decimal places
      if (valuesLine.length >= 5) { // At least enough for one value
        // Extract values by splitting into fixed length segments from right to left
        const creditStr = valuesLine.slice(-5); // Last 5 chars for credit (0.00)
        const debitStr = valuesLine.slice(0, -5); // Rest is debit (83.96)
        
        const dailyTurnover = {
          date: date,
          debit: parseAmount(debitStr),
          credit: parseAmount(creditStr)
        };
        
        accountInfo.turnover.daily.push(dailyTurnover);
      }
    }
  }
}

// Find total turnover
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("RULAJ TOTAL CONT")) {
    // Total turnover amounts are on the next line
    if (i + 1 < lines.length) {
      // Extract two decimal numbers from the next line
      const totalValues = lines[i + 1].match(/(\d{1,3}(?:,\d{3})*\.\d{2})/g);
      
      if (totalValues && totalValues.length >= 2) {
        accountInfo.turnover.total.debit = parseAmount(totalValues[0]);
        accountInfo.turnover.total.credit = parseAmount(totalValues[1]);
      }
    }
    break;
  }
}

  // Extract blocked amounts
  let blockedAmountsSection = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("SUME BLOCATE")) {
      blockedAmountsSection = true;
      continue;
    }

    if (blockedAmountsSection && lines[i].includes("TOTAL DISPONIBIL")) {
      break; // End of blocked amounts section
    }

    if (blockedAmountsSection) {
      // Look for lines with blocked amounts
      const blockedAmountRegex =
        /-\s*([\d,.]+)\s*RON\s*aferenta\s*tranzactiei\s*(.*)/;
      const blockedAmountMatch = lines[i].match(blockedAmountRegex);

      if (blockedAmountMatch) {
        const amount = parseAmount(blockedAmountMatch[1]);
        const description = blockedAmountMatch[2].trim();

        accountInfo.blockedAmounts.push({
          amount,
          description,
        });
      }
    }
  }

  return accountInfo;
}

function extractAccountInfo(text) {
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

  // Define regular expressions
  const ownerClientRegex = /([A-Z\s]+)Client:\s*(\d+)/;
  const ibanRegex = /Cod IBAN:\s*(RO\d+[A-Z0-9]+)/;
  const dailyTurnoverRegex = /(\d{2}\/\d{2}\/\d{4})RULAJ ZI/;
  const blockedAmountRegex = /-\s*([\d,.]+)\s*RON\s*aferenta\s*tranzactiei\s*(.*)/;
  
  // State tracking
  let blockedAmountsSection = false;
  
  // Process all lines in a single pass
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) continue;
    
    // Account owner and client number
    const ownerClientMatch = line.match(ownerClientRegex);
    if (ownerClientMatch) {
      accountInfo.accountOwner = ownerClientMatch[1].trim();
      accountInfo.clientNumber = ownerClientMatch[2].trim();
    }
    
    // IBAN
    const ibanMatch = line.match(ibanRegex);
    if (ibanMatch) {
      accountInfo.iban = ibanMatch[1].trim();
    }
    
    // Currency
    if (line.includes("Valuta") && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      if (nextLine.length >= 3) {
        accountInfo.currency = nextLine.substring(0, 3);
      }
    }
    
    // Final balance
    if (line.includes("SOLD FINAL CONT") && i + 1 < lines.length) {
      const amountMatch = lines[i + 1].trim().match(/^(\d{1,3}(?:,\d{3})*\.\d{2})$/);
      if (amountMatch) {
        accountInfo.finalBalance = parseAmount(amountMatch[1]);
      }
    }
    
    // Daily turnover
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
    
    // Total turnover
    if (line.includes("RULAJ TOTAL CONT") && i + 1 < lines.length) {
      const totalValues = lines[i + 1].match(/(\d{1,3}(?:,\d{3})*\.\d{2})/g);
      
      if (totalValues && totalValues.length >= 2) {
        accountInfo.turnover.total.debit = parseAmount(totalValues[0]);
        accountInfo.turnover.total.credit = parseAmount(totalValues[1]);
      }
    }
    
    // Blocked amounts section management
    if (line.includes("SUME BLOCATE")) {
      blockedAmountsSection = true;
      continue;
    }
    
    if (blockedAmountsSection && line.includes("TOTAL DISPONIBIL")) {
      blockedAmountsSection = false;
      continue;
    }
    
    // Process blocked amounts if in section
    if (blockedAmountsSection) {
      const blockedAmountMatch = line.match(blockedAmountRegex);
      if (blockedAmountMatch) {
        accountInfo.blockedAmounts.push({
          amount: parseAmount(blockedAmountMatch[1]),
          description: blockedAmountMatch[2].trim()
        });
      }
    }
  }
  
  return accountInfo;
}

/**
 * Extract transaction data from raw text
 * @param {string} text - Raw text from PDF
 * @returns {Array} - Array of transaction objects
 */
// function extractTransactionsss(text) {
//   const lines = text.split("\n");
//   const transactions = [];

//   let currentDate = null;
//   let inTransactionSection = false;
//   let transactionData = {};
//   let dailyTurnover = {};

//   // Regular expressions to match different parts
//   const dateRegex = /^(\d{2}\/\d{2}\/\d{4})$/;
//   const descriptionStartRegex =
//     /^(Plata|Incasare|P2P|Constituire|Maturizare|Procesare|Comision)/i;
//   const amountRegex = /(\d{1,3}(?:,\d{3})*\.\d{2})/;
//   const dailyTurnoverRegex = /RULAJ ZI$/;
//   const ownerNameRegex = /;\s*([^;]+);\s*$/;
//   const endOfDayMarkers = ["RULAJ ZI", "SOLD FINAL ZI"];
//   // Skip header/footer lines

//   function isHeaderOrFooterLine(line) {
//     return (
//       line.includes("BANCA TRANSILVANIA") ||
//       line.includes("Info clienti") ||
//       line.includes("BT24@bancatransilvania.ro") ||
//       line.includes("Solicitant:") ||
//       line.includes("Tiparit:") ||
//       line.includes("Capitalul social:") ||
//       line.includes("C.U.I. 5022670") ||
//       line.includes("SWIFT:") ||
//       line.includes("inclusiv international") ||
//       line.includes("www.bancatransilvania.ro") ||
//       line.includes("Clasificare BT:") ||
//       /\d\s*\/\s*4/.test(line)
//     ); // Page numbers like "1 / 4"
//   }

//   for (let i = 0; i < lines.length; i++) {
//     const line = lines[i].trim();

//     // Skip empty lines
//     if (!line || isHeaderOrFooterLine(line)) continue;

//     // Check if we're in the transaction section
//     if (line.includes("CONT") || line.includes("SOLD ANTERIOR")) {
//       inTransactionSection = true;
//       continue;
//     }

//     if (!inTransactionSection) continue;

//     // Check for end-of-day markers that should finalize a transaction
//     if (endOfDayMarkers.some(marker => line.includes(marker))) {
//       if (transactionData.description) {
//         finalizeTransaction();
//       }
//       continue;
//     }

//     // Check for date (DD/MM/YYYY format)
//     if (line.match(dateRegex)) {
//       currentDate = line;
//       continue;
//     }

//     // if (line.endsWith("RULAJ ZI")) {
//     //   // Daily turnover amounts are on the next line
//     //   if (i + 1 < lines.length) {
//     //     // Extract two decimal numbers from the next line
//     //     const nextLine = lines[i + 1];
//     //     const dailyValues = nextLine.match(/(\d{1,3}(?:,\d{3})*\.\d{2})/g);

//     //     if (dailyValues && dailyValues.length >= 2) {
//     //       dailyTurnover[currentDate] = {
//     //         date: currentDate,
//     //         debit: parseAmount(dailyValues[0]),
//     //         credit: parseAmount(dailyValues[1]),
//     //       };
//     //     }
//     //   }
//     //   continue;
//     // }

//     // If we have a date and the line starts with a typical description
//     if (currentDate && descriptionStartRegex.test(line)) {
//       // If we were already building a transaction, save it
//       if (transactionData.description) {
//         finalizeTransaction();
//       }

//       // Start building a new transaction
//       transactionData = {
//         date: currentDate,
//         description: line,
//         amount: null,
//         type: null,
//         reference: null,
//         accountOwner: null,
//       };
//       continue;
//     }

//     // If we're building a transaction, append description
//     if (transactionData.description) {
//       // Check for amount in debit or credit column
//       if (line.match(amountRegex)) {
//         // Extract the original line before trim() to check spacing
//         const originalLine = lines[i];

//         // Check if amount has leading spaces (income) or not (expense)
//         // Count spaces at the beginning of the line before the amount
//         const leadingSpaces = originalLine.search(/\S|$/);
//         const isIncome = leadingSpaces >= 6;

//         transactionData.amount = parseAmount(line.match(amountRegex)[1]);
//         transactionData.type = isIncome ? "income" : "expense";
//       }
//       // Check for reference code (REF: ...)
//       else if (line.includes("REF:")) {
//         transactionData.reference = line.split("REF:")[1].trim();
//       } else {
//         // Look for account owner name in the format "; NUME PRENUME;"
//         const ownerMatch = line.match(ownerNameRegex);
//         if (ownerMatch && !transactionData.accountOwner) {
//           transactionData.accountOwner = ownerMatch[1].trim();
//         }

//         // Append to description if not an amount or reference
//         if(!line.includes("RULAJ ZI") && !line.includes("SOLD FINAL ZI")) {
//         transactionData.description += " " + line;
//         }
//       }

//       // Check if we've reached RULAJ ZI or SOLD FINAL ZI, which indicates end of transaction
//       // if (line.includes("RULAJ ZI") || line.includes("SOLD FINAL ZI")) {
//       //   finalizeTransaction();
//       // }
//     }
//   }
//   // Finalize any remaining transaction
//   if (transactionData.description) {
//     finalizeTransaction();
//   }

//   // Helper function to finalize the transaction and add it to the array
//   function finalizeTransaction() {
//     if (transactionData.description && transactionData.amount) {
//       // Clean up description (remove extra spaces)
//       transactionData.description = transactionData.description
//         .replace(/\s+/g, " ")
//         .trim();

//       // Convert date from DD/MM/YYYY to YYYY-MM-DD
//       const [day, month, year] = transactionData.date.split("/");
//       transactionData.date = `${year}-${month}-${day}`;

//       // Add daily turnover if available
//       // if (dailyTurnover[currentDate]) {
//       //   transactionData.dailyTurnover = {
//       //     debit: dailyTurnover[currentDate].debit,
//       //     credit: dailyTurnover[currentDate].credit,
//       //   };
//       // }

//       transactions.push({ ...transactionData });
//       transactionData = {};
//     }
//   }

//   return transactions;
// }

function extractTransactions(text) {
  const lines = text.split("\n");
  const transactions = [];

  let currentDate = null;
  let transaction = null;
  //let dailyTurnover = {};

  const dateRegex = /^(\d{2}\/\d{2}\/\d{4})$/;
  const descStart = /^(Plata|Incasare|P2P|Constituire|Maturizare|Procesare|Comision)/i;
  const amountRegex = /(\d{1,3}(?:,\d{3})*\.\d{2})/;
  const ownerRegex = /;\s*([^;]+);\s*$/;
  const endMarkers = ["RULAJ ZI", "SOLD FINAL ZI"];

  function finalize() {
    if (transaction && transaction.amount != null) {
      // cleanup
      transaction.description = transaction.description.trim().replace(/\s+/g, " ");
      const [d, m, y] = transaction.date.split("/");
      transaction.date = `${y}-${m}-${d}`;

      // attach daily turnover
      // if (dailyTurnover[transaction.date]) {
      //   transaction.dailyTurnover = dailyTurnover[transaction.date];
      // }
      transactions.push(transaction);
    }
    transaction = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line || /BANCA TRANSILVANIA|Info clienti|BT24@bancatransilvania\.ro|Solicitant:|Tiparit:|C\.U\.I\.|SWIFT:|www\.bancatransilvania\.ro|Clasificare BT:|\d+\s*\/\s*4/.test(line)) {
      continue;
    }

    // start of content
    if (/CONT|SOLD ANTERIOR/.test(line)) continue;

    // date line
    const dateMatch = line.match(dateRegex);
    if (dateMatch) {
      currentDate = dateMatch[1];
      continue;
    }

    // daily turnover marker
    // if (line.endsWith("RULAJ ZI")) {
    //   // next line has two amounts
    //   const next = lines[i + 1] || "";
    //   const vals = next.match(/(\d{1,3}(?:,\d{3})*\.\d{2})/g);
    //   if (vals && vals.length >= 2 && currentDate) {
    //     const [debit, credit] = vals.map(v => parseFloat(v.replace(/,/g, "")));
    //     const [d, m, y] = currentDate.split("/");
    //     dailyTurnover[`${y}-${m}-${d}`] = { debit, credit };
    //   }
    //   continue;
    // }

    // description start
    if (currentDate && descStart.test(line)) {
      // finalize any open
      finalize();
      transaction = { date: currentDate, description: line + ' ', amount: null, type: null, reference: null, accountOwner: null };
      continue;
    }

    if (transaction) {
      // amount
      const amtMatch = line.match(amountRegex);
      if (amtMatch) {
        const amt = parseFloat(amtMatch[1].replace(/,/g, ""));
        const spaces = raw.search(/\S|$/);
        transaction.amount = amt;
        transaction.type = spaces >= 6 ? 'income' : 'expense';
        continue;
      }
      // reference
      if (/REF:/.test(line)) {
        transaction.reference = line.split('REF:')[1].trim();
        continue;
      }
      // owner
      const ownerMatch = line.match(ownerRegex);
      if (ownerMatch) {
        transaction.accountOwner = ownerMatch[1].trim();
      }
      // check end marker inside description
      if (endMarkers.some(m => line.includes(m))) {
        finalize();
      } else {
        transaction.description += line + ' ';
      }
    }
  }
  // finalize last
  finalize();

  return transactions;
}




/**
 * Extract all data from statement text in a single pass
 * @param {string} text - Raw text from PDF
 * @returns {Object} - Object with accountInfo and transactions
 */
function extractStatementData(text) {
  const lines = text.split("\n");
  
  // Initialize result objects
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
  
  // State tracking
  let currentDate = null;
  let transaction = null;
  let blockedAmountsSection = false;
  let inTransactionSection = false;
  
  // Regular expressions
  const dateRegex = /^(\d{2}\/\d{2}\/\d{4})$/;
  const descStart = /^(Plata|Incasare|P2P|Constituire|Maturizare|Procesare|Comision)/i;
  const amountRegex = /(\d{1,3}(?:,\d{3})*\.\d{2})/;
  const ownerClientRegex = /([A-Z\s]+)Client:\s*(\d+)/;
  const ibanRegex = /Cod IBAN:\s*(RO\d+[A-Z0-9]+)/;
  const dailyTurnoverRegex = /(\d{2}\/\d{2}\/\d{4})RULAJ ZI/;
  const blockedAmountRegex = /-\s*([\d,.]+)\s*RON\s*aferenta\s*tranzactiei\s*(.*)/;
  const ownerRegex = /;\s*([^;]+);\s*$/;
  const endMarkers = ["RULAJ ZI", "SOLD FINAL ZI"];
  
  // Helper function to finalize a transaction
  function finalizeTransaction() {
    if (transaction && transaction.amount != null) {
      // Clean up description
      transaction.description = transaction.description.trim().replace(/\s+/g, " ");
      
      // Convert date format
      const [d, m, y] = transaction.date.split("/");
      transaction.date = `${y}-${m}-${d}`;
      
      transactions.push(transaction);
      transaction = null;
    }
  }
  
  // Process each line once
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    
    // Skip empty lines and header/footer lines
    if (!line || isHeaderOrFooterLine(line)) continue;
    
    // ACCOUNT INFO EXTRACTION
    
    // Account owner and client number
    const ownerClientMatch = line.match(ownerClientRegex);
    if (ownerClientMatch) {
      accountInfo.accountOwner = ownerClientMatch[1].trim();
      accountInfo.clientNumber = ownerClientMatch[2].trim();
    }
    
    // IBAN
    const ibanMatch = line.match(ibanRegex);
    if (ibanMatch) {
      accountInfo.iban = ibanMatch[1].trim();
    }
    
    // Currency
    if (line.includes("Valuta") && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      if (nextLine.length >= 3) {
        accountInfo.currency = nextLine.substring(0, 3);
      }
    }
    
    // Final balance
    if (line.includes("SOLD FINAL CONT") && i + 1 < lines.length) {
      const amountMatch = lines[i + 1].trim().match(/^(\d{1,3}(?:,\d{3})*\.\d{2})$/);
      if (amountMatch) {
        accountInfo.finalBalance = parseAmount(amountMatch[1]);
      }
    }
    
    // Daily turnover
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
    
    // Total turnover
    if (line.includes("RULAJ TOTAL CONT") && i + 1 < lines.length) {
      const totalValues = lines[i + 1].match(/(\d{1,3}(?:,\d{3})*\.\d{2})/g);
      
      if (totalValues && totalValues.length >= 2) {
        accountInfo.turnover.total.debit = parseAmount(totalValues[0]);
        accountInfo.turnover.total.credit = parseAmount(totalValues[1]);
      }
    }
    
    // Blocked amounts section management
    if (line.includes("SUME BLOCATE")) {
      blockedAmountsSection = true;
      continue;
    }
    
    if (blockedAmountsSection && line.includes("TOTAL DISPONIBIL")) {
      blockedAmountsSection = false;
      continue;
    }
    
    // Process blocked amounts if in section
    if (blockedAmountsSection) {
      const blockedAmountMatch = line.match(blockedAmountRegex);
      if (blockedAmountMatch) {
        accountInfo.blockedAmounts.push({
          amount: parseAmount(blockedAmountMatch[1]),
          description: blockedAmountMatch[2].trim()
        });
      }
    }
    
    // TRANSACTION EXTRACTION
    
    // Start of transaction section
    if (line.match(/CONT|SOLD ANTERIOR/)) {
      inTransactionSection = true;
      continue;
    }
    
    if (!inTransactionSection) continue;
    
    // Date line
    const dateMatch = line.match(dateRegex);
    if (dateMatch) {
      currentDate = dateMatch[1];
      continue;
    }
    
    // Description start - begin a new transaction
    if (currentDate && descStart.test(line)) {
      // Finalize any open transaction
      finalizeTransaction();
      
      // Create new transaction
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
    
    // Process transaction details if we're in a transaction
    if (transaction) {
      // Amount
      const amtMatch = line.match(amountRegex);
      if (amtMatch) {
        const amt = parseAmount(amtMatch[1]);
        const spaces = raw.search(/\S|$/);
        transaction.amount = amt;
        transaction.type = spaces >= 6 ? 'income' : 'expense';
        continue;
      }
      
      // Reference
      if (line.includes("REF:")) {
        transaction.reference = line.split('REF:')[1].trim();
        continue;
      }
      
      // Account owner
      const ownerMatch = line.match(ownerRegex);
      if (ownerMatch) {
        transaction.accountOwner = ownerMatch[1].trim();
      }
      
      // Check end markers
      if (endMarkers.some(m => line.includes(m))) {
        finalizeTransaction();
      } else {
        // Append to description
        transaction.description += line + ' ';
      }
    }
  }
  
  // Finalize last transaction if any
  finalizeTransaction();
  
  // Return everything
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

// CLI functionality
if (require.main === module) {
  // Only run this code when script is executed directly (not imported)
  const args = process.argv.slice(2);

  // Show help if no arguments or help flag provided
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

  // Parse options and input file
  let outputFile = null;
  let saveText = false;
  let inputFile = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-o" || args[i] === "--output") {
      outputFile = args[i + 1];
      i++; // Skip the next arg which is the filename
    } else if (args[i] === "-t" || args[i] === "--text") {
      saveText = true;
    } else if (!inputFile && !args[i].startsWith("-")) {
      inputFile = args[i];
    }
  }

  // Check if input file exists
  if (!inputFile) {
    console.error("Error: No input file specified");
    process.exit(1);
  }

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: Input file "${inputFile}" not found`);
    process.exit(1);
  }

  // Process the file
  (async () => {
    try {
      // console.log(`Processing ${inputFile}...`);

      // Read and parse the PDF
      const dataBuffer = fs.readFileSync(inputFile);
      const data = await pdf(dataBuffer);

      // Save extracted text if requested
      if (saveText) {
        const textOutputFile = inputFile.replace(/\.pdf$/i, "") + ".txt";
        try {
          fs.writeFileSync(textOutputFile, data.text);
          console.log(`Raw text saved to ${textOutputFile}`);
        } catch (err) {
          console.error(`Error saving text file: ${err.message}`);
        }
      }

      // Parse transactions
      const transactions = await parseBTStatement(dataBuffer);
      // console.log(`Found ${transactions.length} transactions`);

      // Output results
      const jsonOutput = JSON.stringify(transactions, null, 2);

      if (outputFile) {
        try {
          fs.writeFileSync(outputFile, jsonOutput);
          console.log(`Results saved to ${outputFile}`);
        } catch (err) {
          console.error(`Error saving output file: ${err.message}`);
          console.log(jsonOutput); // Fallback to console
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
