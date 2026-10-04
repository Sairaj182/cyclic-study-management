import { encryptFileToken } from "./src/utils/crypto";

async function verify() {
  console.log("--- Token Validation Testing ---");

  // Generate a valid token
  const payload = {
    bucket: "rmp-documents",
    storageKey: "test-file.pdf",
    expiresAt: Date.now() + 120000 // 2 mins
  };
  const token = encryptFileToken(payload);
  const filename = "test-file.pdf";

  const baseUrl = "http://localhost:4000/api/files";
  
  // 1. Valid token
  try {
    const res = await fetch(`${baseUrl}/${token}/${filename}`);
    console.log("1. Valid Token Status:", res.status);
    if (res.status !== 200 && res.status !== 404) {
      console.log("Response text:", await res.text());
    }
    // Expected 200 or 404 (if file doesn't exist in minio)
  } catch (err) {
    console.error("1. Error:", err);
  }

  // 2. Modified token
  const parts = token.split(".");
  parts[2] = parts[2].substring(0, parts[2].length - 1) + (parts[2].endsWith('a') ? 'b' : 'a');
  const modifiedToken = parts.join(".");
  try {
    const res = await fetch(`${baseUrl}/${modifiedToken}/${filename}`);
    console.log("2. Modified Token Status:", res.status); // Expected 403
  } catch (err) {
    console.error("2. Error:", err);
  }

  // 3. Expired token
  const expiredPayload = {
    bucket: "rmp-documents",
    storageKey: "test-file.pdf",
    expiresAt: Date.now() - 1000 // Expired 1 second ago
  };
  const expiredToken = encryptFileToken(expiredPayload);
  try {
    const res = await fetch(`${baseUrl}/${expiredToken}/${filename}`);
    console.log("3. Expired Token Status:", res.status); // Expected 410
  } catch (err) {
    console.error("3. Error:", err);
  }

  // 4. Random token
  try {
    const res = await fetch(`${baseUrl}/random-invalid-token/${filename}`);
    console.log("4. Random Token Status:", res.status); // Expected 403
  } catch (err) {
    console.error("4. Error:", err);
  }
}

verify().catch(console.error);
