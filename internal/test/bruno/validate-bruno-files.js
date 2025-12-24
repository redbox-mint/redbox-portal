const fs = require('node:fs');
const brunoLang = require("@usebruno/lang");

function validateBru(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    brunoLang.bruToJsonV2(content);
    return true;
  } catch (err) {
    console.error(`❌ ${filePath} is invalid: ${err}`);
    return false;
  }
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: validate-bruno-files <file1.bru> [file2.bru...]");
  process.exit(1);
}

const allValid = files.every((file) => validateBru(file));
console.log(`Parsed ${files.length} bru files.`);
process.exit(allValid ? 0 : 1);
