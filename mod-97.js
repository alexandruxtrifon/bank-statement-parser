/**
 * Letter to number conversion table for IBAN validation
 */
const LETTER_TO_NUMBER = {
  A: 10,
  B: 11,
  C: 12,
  D: 13,
  E: 14,
  F: 15,
  G: 16,
  H: 17,
  I: 18,
  J: 19,
  K: 20,
  L: 21,
  M: 22,
  N: 23,
  O: 24,
  P: 25,
  Q: 26,
  R: 27,
  S: 28,
  T: 29,
  U: 30,
  V: 31,
  W: 32,
  X: 33,
  Y: 34,
  Z: 35,
};

/**
 * Known Romanian bank codes (BIC prefixes)
 */
const ROMANIAN_BANK_CODES = [
  "RNCB",
  "BRDE",
  "BTRL",
  "INGB",
  "RZBR",
  "BFER",
  "CECEB",
  "CARP",
  "PIRB",
  "BACX",
  "OTPV",
  "CRCO",
  "FTSB",
  "ALBZ",
  "UGBI",
  "BPOS",
  "VNBC",
  "TREZ",
  "VIRL",
  "DAFB",
  "MMEB",
  "SBIU",
  "BREL",
  "PORL",
  "REVO",
];

/**
 * Performs BigInt modulo 97 operation for large numbers
 */
function bigIntMod97(numStr) {
  let remainder = 0n;

  for (let i = 0; i < numStr.length; i++) {
    remainder = (remainder * 10n + BigInt(numStr[i])) % 97n;
  }

  return Number(remainder);
}

/**
 * Converts letters to numbers according to IBAN specification
 */
function convertLettersToNumbers(str) {
  return str
    .split("")
    .map((char) => {
      if (/[A-Z]/.test(char)) {
        return LETTER_TO_NUMBER[char].toString();
      }
      return char;
    })
    .join("");
}

/**
 * Formats IBAN with spaces for display (RO49 AAAA 1B31 0075 9384 0000)
 */
function formatIban(iban) {
  if (!iban) return "";

  // Remove all spaces and convert to uppercase
  const cleanIban = iban.replace(/\s/g, "").toUpperCase();

  // Add spaces every 4 characters
  return cleanIban.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Removes formatting from IBAN (spaces, hyphens)
 */
function cleanIban(iban) {
  return iban.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * Validates Romanian IBAN structure
 */
function validateRomanianIbanStructure(iban) {
  const cleanedIban = cleanIban(iban);

  // Check length (24 characters for Romanian IBAN)
  if (cleanedIban.length !== 24) {
    return {
      isValid: false,
      error: `IBAN must be 24 characters long (current: ${cleanedIban.length})`,
    };
  }

  // Check country code
  if (!cleanedIban.startsWith("RO")) {
    return {
      isValid: false,
      error: "IBAN must start with RO for Romanian accounts",
    };
  }

  // Check check digits (positions 2-3) are numeric
  const checkDigits = cleanedIban.substring(2, 4);
  if (!/^\d{2}$/.test(checkDigits)) {
    return {
      isValid: false,
      error: "Check digits (positions 3-4) must be numeric",
    };
  }

  // Check bank code (positions 4-7) are letters
  const bankCode = cleanedIban.substring(4, 8);
  if (!/^[A-Z]{4}$/.test(bankCode)) {
    return {
      isValid: false,
      error: "Bank code (positions 5-8) must be 4 uppercase letters",
    };
  }

  // Check account identifier (positions 8-23) are alphanumeric
  const accountId = cleanedIban.substring(8);
  if (!/^[A-Z0-9]{16}$/.test(accountId)) {
    return {
      isValid: false,
      error: "Account identifier must be 16 alphanumeric characters",
    };
  }

  return { isValid: true };
}

/**
 * Calculates IBAN check digits
 */
function calculateIbanCheckDigits(countryCode, bankCode, accountId) {
  // Step 1: Create artificial IBAN with 00 as check digits
  const artificialIban = `${countryCode}00${bankCode}${accountId}`;

  // Step 2: Move first 4 characters to the end
  const rearranged =
    artificialIban.substring(4) + artificialIban.substring(0, 4);

  // Step 3: Convert letters to numbers
  const numericString = convertLettersToNumbers(rearranged);

  // Step 4: Apply MOD 97-10 algorithm
  const remainder = bigIntMod97(numericString);
  const checkDigits = 98 - remainder;

  // Return with leading zero if needed
  return checkDigits.toString().padStart(2, "0");
}

/**
 * Validates IBAN checksum using MOD 97-10 algorithm
 */
function validateIbanChecksum(iban) {
  const cleanedIban = cleanIban(iban);

  // Step 1: Move first 4 characters to the end
  const rearranged = cleanedIban.substring(4) + cleanedIban.substring(0, 4);

  // Step 2: Convert letters to numbers
  const numericString = convertLettersToNumbers(rearranged);

  // Step 3: Apply MOD 97-10 algorithm
  const remainder = bigIntMod97(numericString);

  // For valid IBAN, remainder should be 1
  return remainder === 1;
}

/**
 * Complete IBAN validation
 */
function validateIban(iban) {
  if (!iban) {
    return {
      isValid: false,
      error: "IBAN is required",
    };
  }

  const cleanedIban = cleanIban(iban);

  // Check basic structure
  const structureValidation = validateRomanianIbanStructure(cleanedIban);
  if (!structureValidation.isValid) {
    return structureValidation;
  }

  // Check if bank code is known (warning, not error)
  const bankCode = cleanedIban.substring(4, 8);
  const isKnownBank = ROMANIAN_BANK_CODES.includes(bankCode);

  // Validate checksum
  const checksumValid = validateIbanChecksum(cleanedIban);
  if (!checksumValid) {
    return {
      isValid: false,
      error: "Invalid IBAN checksum",
    };
  }

  return {
    isValid: true,
    warning: !isKnownBank
      ? `Bank code ${bankCode} is not in our dataset of known Romanian banks`
      : null,
    bankCode: bankCode,
    formatted: formatIban(cleanedIban),
  };
}

/**
 * Real-time validation for input fields
 */
function validateIbanRealTime(iban) {
  if (!iban) {
    return { isValid: true, error: null }; // Empty is valid for real-time
  }

  const cleanedIban = cleanIban(iban);

  // Check country code if enough characters
  if (cleanedIban.length >= 2 && !cleanedIban.startsWith("RO")) {
    return {
      isValid: false,
      error: "IBAN must start with RO",
    };
  }

  // Check check digits if enough characters
  if (cleanedIban.length >= 4) {
    const checkDigits = cleanedIban.substring(2, 4);
    if (!/^\d{2}$/.test(checkDigits)) {
      return {
        isValid: false,
        error: "Check digits must be numeric",
      };
    }
  }

  // Check bank code if enough characters
  if (cleanedIban.length >= 8) {
    const bankCode = cleanedIban.substring(4, 8);
    if (!/^[A-Z]{4}$/.test(bankCode)) {
      return {
        isValid: false,
        error: "Bank code must be 4 uppercase letters",
      };
    }
  }

  // Check account identifier characters
  if (cleanedIban.length > 8) {
    const accountPart = cleanedIban.substring(8);
    if (!/^[A-Z0-9]*$/.test(accountPart)) {
      return {
        isValid: false,
        error: "Account identifier can only contain letters and numbers",
      };
    }
  }

  // Check maximum length
  if (cleanedIban.length > 24) {
    return {
      isValid: false,
      error: "IBAN cannot exceed 24 characters",
    };
  }

  // If we have complete IBAN, validate checksum
  if (cleanedIban.length === 24) {
    return validateIban(cleanedIban);
  }

  return { isValid: true, error: null };
}

module.exports = {
  formatIban,
  cleanIban,
  validateRomanianIbanStructure,
  calculateIbanCheckDigits,
  validateIbanChecksum,
  validateIban,
  validateIbanRealTime,
};

if (require.main === module) {
  const args = process.argv.slice(2);

  // Show help if no arguments or help flag provided
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    console.log(`
IBAN Validation Tool
Usage: node mod-97.js [command] [options]

Commands:
  validate <iban>      Validate a complete IBAN
  format <iban>        Format an IBAN with spaces
  calculate <country> <bank> <account>  Calculate check digits for IBAN parts

Examples:
  node mod-97.js validate RO49AAAA1B31007593840000
  node mod-97.js format RO49AAAA1B31007593840000
  node mod-97.js calculate RO BTRL 0075938400001234
    `);
    process.exit(0);
  }

  const command = args[0].toLowerCase();

  switch (command) {
    case "validate":
      if (args.length < 2) {
        console.error("Error: IBAN is required for validation");
        process.exit(1);
      }

      const validationResult = validateIban(args[1]);

      if (validationResult.isValid) {
        console.log("✅ Valid IBAN");
        console.log(`Formatted: ${validationResult.formatted}`);
        console.log(`Bank Code: ${validationResult.bankCode}`);

        if (validationResult.warning) {
          console.log(`⚠️ Warning: ${validationResult.warning}`);
        }
      } else {
        console.log(`❌ Invalid IBAN: ${validationResult.error}`);
      }
      break;

    case "format":
      if (args.length < 2) {
        console.error("Error: IBAN is required for formatting");
        process.exit(1);
      }

      console.log(formatIban(args[1]));
      break;

    case "calculate":
      if (args.length < 4) {
        console.error(
          "Error: Country code, bank code, and account ID are required"
        );
        process.exit(1);
      }

      const countryCode = args[1].toUpperCase();
      const bankCode = args[2].toUpperCase();
      const accountId = args[3].toUpperCase();

      const checkDigits = calculateIbanCheckDigits(
        countryCode,
        bankCode,
        accountId
      );
      const calculatedIban = `${countryCode}${checkDigits}${bankCode}${accountId}`;

      console.log(`Check digits: ${checkDigits}`);
      console.log(`Complete IBAN: ${calculatedIban}`);
      console.log(`Formatted: ${formatIban(calculatedIban)}`);

      // Validate the generated IBAN as a sanity check
      const checkResult = validateIbanChecksum(calculatedIban);
      if (checkResult) {
        console.log("✅ Checksum verification passed");
      } else {
        console.log("❌ Checksum verification failed");
      }
      break;

    default:
      console.error(`Error: Unknown command "${command}"`);
      process.exit(1);
  }
}
