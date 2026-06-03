async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/market/options?symbol=NIFTY');
    console.log("Status:", res.status);
    const json = await res.json();
    console.log("Keys:", Object.keys(json));
    if (json.error) {
      console.error("Error returned:", json.error);
    } else {
      console.log("Records keys:", Object.keys(json.records));
      console.log("Expiry dates count:", json.records.expiryDates?.length);
      console.log("Data count:", json.records.data?.length);
      if (json.records.data && json.records.data.length > 0) {
        console.log("First data item:", JSON.stringify(json.records.data[0]).substring(0, 500));
      }
    }
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

test();
