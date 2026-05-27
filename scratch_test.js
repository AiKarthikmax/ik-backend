const fs = require('fs');

function cleanStr(val) {
  if (typeof val === "string") {
    return val
      .replace(/₹/g, "Rs.")
      .replace(/[—–]/g, "-")
      .replace(/→/g, "->")
      .replace(/↳/g, "->")
      .replace(/×/g, "x")
      .replace(/[^\x00-\x7F]/g, "");
  }
  return val;
}

console.log("Registered Total Income:", cleanStr("Registered Total Income"));
console.log("Period: 2026-02-04 -> 2026-02-04:", cleanStr("Period: 2026-02-04 -> 2026-02-04"));
console.log("With rupee: ₹ 5000:", cleanStr("₹ 5000"));
console.log("With emoji: 💰 income:", cleanStr("💰 income"));
