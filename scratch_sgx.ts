async function run() {
  try {
    console.log("Fetching sgxnifty.org...");
    const res = await fetch("https://sgxnifty.org/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      }
    });
    console.log("Status:", res.status);
    const html = await res.text();
    console.log("HTML length:", html.length);
    
    // Look for lines containing numbers like "24,111" or "Last Trade" or similar
    const lines = html.split("\n");
    let matchCount = 0;
    lines.forEach((line, idx) => {
      if (line.includes("Last Trade") || line.includes("change-value") || line.includes("change-percent") || line.includes("sgx-value") || line.includes("24,111") || line.toLowerCase().includes("sgx nifty")) {
        console.log(`Line ${idx}:`, line.trim());
        matchCount++;
      }
    });
    console.log("Total matching lines:", matchCount);
  } catch (e) {
    console.error("Error fetching:", e);
  }
}
run();
