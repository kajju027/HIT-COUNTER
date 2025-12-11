// functions/index.js

import { onRequest } from "firebase-functions/v2/https";
import { URL } from "url";

// Environment Variable থেকে Firebase URL নেওয়া হবে
const FIREBASE_URL = process.env.FIREBASE_URL;

// ----------------- Firebase Helpers -----------------

// ডেটাবেস থেকে ডেটা আনতে
async function firebaseGet(path) {
  const res = await fetch(FIREBASE_URL + path);
  if (!res.ok) return null;
  // Firebase-এ ডেটা না থাকলে response টেক্সট "null" আসে, তাই সেই ক্ষেত্রে null রিটার্ন করা হয়েছে।
  const text = await res.text();
  return text === 'null' ? null : JSON.parse(text);
}

// ডেটাবেসে ডেটা লিখতে
async function firebasePut(path, value) {
  await fetch(FIREBASE_URL + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}

// কাউন্ট ডেটা আনতে ও ফরম্যাট করতে
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

// ---------------- Utils (Node.js Compatible) ----------------

function sendCors(response, origin) {
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  response.writeHead(204, headers); 
  response.end();
}

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

// ----------------- Main Handler -----------------

const hitCounterHandler = async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const origin = request.headers.origin || "*";

  // CORS Preflight
  if (request.method === "OPTIONS") {
    return sendCors(response, origin);
  }

  const key = url.searchParams.get("key") || "default";
  const uniqueMode = url.searchParams.get("unique") === "1";
  
  // IP Address নির্ণয়
  const ip = request.headers["cf-connecting-ip"] || 
             request.headers["x-real-ip"] ||
             request.headers["x-forwarded-for"] ||
             "0.0.0.0";
             
  // /api/hit বা /api/get থেকে শুধু /hit বা /get নেওয়া
  const pathName = url.pathname.replace('/api', ''); 

  if (pathName.startsWith("/hit")) {
    
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
    const updatedPath = `counters/${key}/updated_at.json`; 

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

  if (pathName.startsWith("/get")) {
    const data = await getCountsFirebase(key);
    return sendJSON(response, data, origin);
  }

  // রুট হ্যান্ডলিং
  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end("Hit Counter API is running on Firebase Functions! ✔");
};


// এই ফাংশনটি 'api' নামে এক্সপোর্ট করা হয়েছে
export const api = onRequest(hitCounterHandler);
