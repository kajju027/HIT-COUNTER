import { URL } from "url"; // Node.js এ এটি প্রয়োজন

const FIREBASE_URL = process.env.FIREBASE_URL;

// ----------------- Main Handler -----------------

export default async function handler(request, response) {
  // request.headers.host Vercel এ কাজ করত। Polka-তে এটি URL অবজেক্ট থেকে নেওয়া যায়।
  // তবে Vercel ফাংশনটি Node.js এর সাথে মানিয়ে চলার জন্য এটিকে ধরে রাখছি।
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const origin = request.headers.origin || "*";

  // CORS Preflight
  if (request.method === "OPTIONS") {
    return sendCors(response, origin);
  }

  const key = url.searchParams.get("key") || "default";
  const uniqueMode = url.searchParams.get("unique") === "1";

  if (url.pathname.startsWith("/api/get")) {
    const data = await getCountsFirebase(key);
    return sendJSON(response, data, origin);
  }

  if (url.pathname.startsWith("/api/hit")) {
    const ip = request.headers["x-real-ip"] ||
               request.headers["x-forwarded-for"] ||
               "0.0.0.0";

    let uniqueInc = 1;
    if (uniqueMode) {
      const day = new Date().toISOString().slice(0, 10);
      const ipKey = `unique/${key}/${day}/${ip}.json`;

      const exists = await firebaseGet(ipKey);
      if (exists) uniqueInc = 0;
      else await firebasePut(ipKey, true);
    }

    const totalPath = `counters/${key}/total.json`;
    const uniquePath = `counters/${key}/unique.json`;
    const updatedPath = `counters/${key}/updated_at.json`; // Firebase এ update করার জন্য

    const totalValue = (await firebaseGet(totalPath)) || 0;
    const uniqueValue = (await firebaseGet(uniquePath)) || 0;

    const newTotal = totalValue + 1;
    const newUnique = uniqueValue + uniqueInc;

    await firebasePut(totalPath, newTotal);
    await firebasePut(uniquePath, newUnique);
    await firebasePut(updatedPath, new Date().toISOString());

    const data = await getCountsFirebase(key);
    return sendJSON(response, data, origin);
  }

  // রুট হ্যান্ডলিং
  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end("Hit Counter API (Firebase + Render) ✔");
}


// ----------------- Firebase Helpers -----------------

async function firebaseGet(path) {
  const res = await fetch(FIREBASE_URL + path);
  if (!res.ok) return null;
  return res.json();
}

async function firebasePut(path, value) {
  await fetch(FIREBASE_URL + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}

async function getCountsFirebase(key) {
  const base = `counters/${key}/`;
  const total = (await firebaseGet(base + "total.json")) || 0;
  const unique = (await firebaseGet(base + "unique.json")) || 0;
  const updated = await firebaseGet(base + "updated_at.json");

  return {
    key,
    total,
    unique,
    total_formatted: formatNum(total),
    unique_formatted: formatNum(unique),
    updated_at: updated || null,
  };
}


// ---------------- Utils (Polka/Node.js Compatible) ----------------

// Vercel-এর Express-like .status().end() এর বদলে Node.js-এর .writeHead() এবং .end() ব্যবহার করা হয়েছে
function sendCors(response, origin) {
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  response.writeHead(204, headers); // 204 No Content for preflight
  response.end();
}

// Vercel-এর Express-like .status().json() এর বদলে Node.js-এর .writeHead() এবং .end(JSON.stringify) ব্যবহার করা হয়েছে
function sendJSON(response, data, origin) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
  };
  response.writeHead(200, headers);
  response.end(JSON.stringify(data));
}

function formatNum(n) {
  if (n < 1000) return n.toString();
  if (n < 10000) return (n / 1000).toFixed(1) + "k";
  if (n < 1000000) return Math.round(n / 1000) + "k";
  return (n / 1000000).toFixed(1) + "m";
}
