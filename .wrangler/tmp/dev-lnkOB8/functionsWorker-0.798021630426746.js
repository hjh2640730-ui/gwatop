var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/pages-2Op8tg/functionsWorker-0.798021630426746.mjs
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var ADMIN_EMAIL = "hjh2640730@gmail.com";
var PROJECT_ID = "gwatop-8edaf";
var FIREBASE_WEB_API_KEY = "AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ";
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};
async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
__name(onRequestOptions, "onRequestOptions");
__name2(onRequestOptions, "onRequestOptions");
async function verifyFirebaseToken(idToken) {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.users?.[0] || null;
  } catch {
    return null;
  }
}
__name(verifyFirebaseToken, "verifyFirebaseToken");
__name2(verifyFirebaseToken, "verifyFirebaseToken");
async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const type = url.searchParams.get("type");
  if (!token) return json({ error: "\uC778\uC99D \uD1A0\uD070\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, 401);
  const user = await verifyFirebaseToken(token);
  if (!user || user.email !== ADMIN_EMAIL) {
    return json({ error: "\uAD00\uB9AC\uC790 \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, 403);
  }
  try {
    const accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
    if (type === "posts") {
      const posts = await getPosts(accessToken);
      return json({ posts });
    }
    const users = await getUsers(accessToken);
    const stats = {
      totalUsers: users.length,
      totalQuizzes: users.reduce((s, u) => s + u.totalQuizzes, 0),
      totalCredits: users.reduce((s, u) => s + u.credits, 0)
    };
    return json({ users, stats });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
__name(onRequestGet, "onRequestGet");
__name2(onRequestGet, "onRequestGet");
async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "\uD30C\uC2F1 \uC2E4\uD328" }, 400);
  }
  const { token, action } = body;
  if (!token) return json({ error: "\uC778\uC99D \uD1A0\uD070\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, 401);
  const user = await verifyFirebaseToken(token);
  if (!user || user.email !== ADMIN_EMAIL) {
    return json({ error: "\uAD00\uB9AC\uC790 \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." }, 403);
  }
  if (action === "updateCredits") {
    const { uid, credits } = body;
    if (!uid || credits === void 0) return json({ error: "\uD30C\uB77C\uBBF8\uD130 \uB204\uB77D" }, 400);
    try {
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
      await updateUserFields(uid, { credits: parseInt(credits) }, accessToken);
      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }
  if (action === "updateUser") {
    const { uid, credits, referralCredits, nickname, university } = body;
    if (!uid) return json({ error: "uid \uB204\uB77D" }, 400);
    const fields = {};
    if (credits !== void 0) fields.credits = parseInt(credits);
    if (referralCredits !== void 0) fields.referralCredits = parseInt(referralCredits);
    if (nickname !== void 0) fields.nickname = nickname;
    if (university !== void 0) fields.university = university;
    try {
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
      await updateUserFields(uid, fields, accessToken);
      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }
  if (action === "deleteUser") {
    const { uid } = body;
    if (!uid) return json({ error: "uid \uB204\uB77D" }, 400);
    try {
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
      await deleteUserDoc(uid, accessToken);
      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }
  if (action === "deletePost") {
    const { postId } = body;
    if (!postId) return json({ error: "postId \uB204\uB77D" }, 400);
    try {
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
      await deletePostAndRevokeCredits(postId, accessToken);
      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }
  return json({ error: "\uC54C \uC218 \uC5C6\uB294 \uC561\uC158" }, 400);
}
__name(onRequestPost, "onRequestPost");
__name2(onRequestPost, "onRequestPost");
async function getUsers(accessToken) {
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users?pageSize=300`;
  const res = await fetch(baseUrl, {
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error("\uC720\uC800 \uBAA9\uB85D \uC870\uD68C \uC2E4\uD328");
  const data = await res.json();
  if (!data.documents) return [];
  return data.documents.map((doc) => {
    const f = doc.fields || {};
    return {
      uid: f.uid?.stringValue || doc.name.split("/").pop(),
      email: f.email?.stringValue || "",
      phone: f.phone?.stringValue || "",
      displayName: f.displayName?.stringValue || "",
      nickname: f.nickname?.stringValue || "",
      university: f.university?.stringValue || "",
      credits: parseInt(f.credits?.integerValue || 0),
      totalQuizzes: parseInt(f.totalQuizzes?.integerValue || 0),
      referralCredits: parseInt(f.referralCredits?.integerValue || 0),
      provider: f.provider?.stringValue || "",
      createdAt: f.createdAt?.timestampValue || null
    };
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
__name(getUsers, "getUsers");
__name2(getUsers, "getUsers");
async function getPosts(accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: "community_posts" }],
      orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
      limit: 100
    }
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error("\uAC8C\uC2DC\uAE00 \uBAA9\uB85D \uC870\uD68C \uC2E4\uD328");
  const data = await res.json();
  return data.filter((r) => r.document).map((r) => {
    const f = r.document.fields || {};
    const docId = r.document.name.split("/").pop();
    return {
      id: docId,
      title: f.title?.stringValue || "",
      content: f.content?.stringValue || "",
      uid: f.uid?.stringValue || "",
      nickname: f.nickname?.stringValue || "",
      isAnonymous: f.isAnonymous?.booleanValue || false,
      university: f.university?.stringValue || "",
      likes: parseInt(f.likes?.integerValue || 0),
      commentCount: parseInt(f.commentCount?.integerValue || 0),
      createdAt: f.createdAt?.timestampValue || null
    };
  });
}
__name(getPosts, "getPosts");
__name2(getPosts, "getPosts");
async function deleteUserDoc(uid, accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  if (!res.ok && res.status !== 404) throw new Error("\uC720\uC800 \uC0AD\uC81C \uC2E4\uD328");
}
__name(deleteUserDoc, "deleteUserDoc");
__name2(deleteUserDoc, "deleteUserDoc");
async function deletePostAndRevokeCredits(postId, accessToken) {
  const getUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/community_posts/${postId}`;
  const getRes = await fetch(getUrl, { headers: { "Authorization": `Bearer ${accessToken}` } });
  if (getRes.ok) {
    const postDoc = await getRes.json();
    const f = postDoc.fields || {};
    const authorUid = f.uid?.stringValue;
    const likes = Math.min(parseInt(f.likes?.integerValue || 0), 5);
    if (authorUid && likes > 0) {
      try {
        const userUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${authorUid}`;
        const userRes = await fetch(userUrl, { headers: { "Authorization": `Bearer ${accessToken}` } });
        if (userRes.ok) {
          const userDoc = await userRes.json();
          const currentCredits = parseInt(userDoc.fields?.credits?.integerValue || 0);
          const currentReferral = parseInt(userDoc.fields?.referralCredits?.integerValue || 0);
          const newCredits = Math.max(0, currentCredits - likes);
          const newReferral = Math.max(0, currentReferral - likes);
          await fetch(`${userUrl}?updateMask.fieldPaths=credits&updateMask.fieldPaths=referralCredits`, {
            method: "PATCH",
            headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ fields: { credits: { integerValue: String(newCredits) }, referralCredits: { integerValue: String(newReferral) } } })
          });
        }
      } catch (_) {
      }
    }
  }
  const delRes = await fetch(getUrl, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  if (!delRes.ok && delRes.status !== 404) throw new Error("\uAC8C\uC2DC\uAE00 \uC0AD\uC81C \uC2E4\uD328");
}
__name(deletePostAndRevokeCredits, "deletePostAndRevokeCredits");
__name2(deletePostAndRevokeCredits, "deletePostAndRevokeCredits");
async function updateUserFields(uid, fields, accessToken) {
  const firestoreFields = {};
  const updateMasks = [];
  if (fields.credits !== void 0) {
    firestoreFields.credits = { integerValue: String(fields.credits) };
    updateMasks.push("credits");
  }
  if (fields.nickname !== void 0) {
    firestoreFields.nickname = { stringValue: fields.nickname };
    updateMasks.push("nickname");
  }
  if (fields.university !== void 0) {
    firestoreFields.university = { stringValue: fields.university };
    updateMasks.push("university");
  }
  if (fields.referralCredits !== void 0) {
    firestoreFields.referralCredits = { integerValue: String(fields.referralCredits) };
    updateMasks.push("referralCredits");
  }
  if (updateMasks.length === 0) return;
  const maskQuery = updateMasks.map((f) => `updateMask.fieldPaths=${f}`).join("&");
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}?${maskQuery}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: firestoreFields })
  });
  if (!res.ok) throw new Error("\uC720\uC800 \uC815\uBCF4 \uC5C5\uB370\uC774\uD2B8 \uC2E4\uD328");
}
__name(updateUserFields, "updateUserFields");
__name2(updateUserFields, "updateUserFields");
async function getFirebaseAccessToken(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1e3);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/datastore"
  };
  const encode = /* @__PURE__ */ __name2((obj) => btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""), "encode");
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const pem = privateKey.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\\n/g, "").replace(/\n/g, "").replace(/\r/g, "").replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const sigEncoded = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const jwt = `${signingInput}.${sigEncoded}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("Access token \uBC1C\uAE09 \uC2E4\uD328");
  return tokenData.access_token;
}
__name(getFirebaseAccessToken, "getFirebaseAccessToken");
__name2(getFirebaseAccessToken, "getFirebaseAccessToken");
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
__name(json, "json");
__name2(json, "json");
var CORS2 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};
async function onRequestOptions2() {
  return new Response(null, { status: 204, headers: CORS2 });
}
__name(onRequestOptions2, "onRequestOptions2");
__name2(onRequestOptions2, "onRequestOptions");
async function onRequestPost2(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json2({ error: "\uC694\uCCAD \uD30C\uC2F1 \uC2E4\uD328" }, 400);
  }
  const { provider, code, redirectUri } = body;
  const clientEmail = env.FIREBASE_CLIENT_EMAIL;
  const privateKey = env.FIREBASE_PRIVATE_KEY;
  if (!clientEmail || !privateKey) {
    return json2({ error: "Firebase \uC11C\uBE44\uC2A4 \uACC4\uC815 \uD658\uACBD \uBCC0\uC218\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }, 500);
  }
  let uid, displayName = "", email = "", photoURL = "", phone = "";
  if (provider === "kakao") {
    if (!code) return json2({ error: "code\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." }, 400);
    const kakaoKey = env.KAKAO_REST_API_KEY;
    if (!kakaoKey) return json2({ error: "\uCE74\uCE74\uC624 \uD658\uACBD \uBCC0\uC218\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }, 500);
    const kakaoSecret = env.KAKAO_CLIENT_SECRET || "";
    const tokenBody = `grant_type=authorization_code&client_id=${kakaoKey}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}${kakaoSecret ? `&client_secret=${kakaoSecret}` : ""}`;
    const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return json2({ error: `\uCE74\uCE74\uC624 \uD1A0\uD070 \uBC1C\uAE09 \uC2E4\uD328: ${tokenData.error_description || ""}` }, 401);
    }
    const kakaoRes = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    if (!kakaoRes.ok) return json2({ error: "\uCE74\uCE74\uC624 \uC778\uC99D \uC2E4\uD328" }, 401);
    const kakaoUser = await kakaoRes.json();
    uid = `kakao:${kakaoUser.id}`;
    email = kakaoUser.kakao_account?.email || "";
    displayName = kakaoUser.kakao_account?.profile?.nickname || "";
    photoURL = kakaoUser.kakao_account?.profile?.profile_image_url || "";
    const kakaoPhone = kakaoUser.kakao_account?.phone_number || "";
    phone = normalizePhone(kakaoPhone);
  } else if (provider === "naver") {
    if (!code) return json2({ error: "code\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." }, 400);
    const clientId = env.NAVER_CLIENT_ID;
    const clientSecret = env.NAVER_CLIENT_SECRET;
    if (!clientId || !clientSecret) return json2({ error: "\uB124\uC774\uBC84 \uD658\uACBD \uBCC0\uC218\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }, 500);
    const tokenUrl = `https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id=${clientId}&client_secret=${clientSecret}&code=${encodeURIComponent(code)}&state=gwatop`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return json2({ error: `\uB124\uC774\uBC84 \uD1A0\uD070 \uBC1C\uAE09 \uC2E4\uD328: ${tokenData.error_description || ""}` }, 401);
    }
    const naverRes = await fetch("https://openapi.naver.com/v1/nid/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const naverData = await naverRes.json();
    if (naverData.resultcode !== "00") return json2({ error: "\uB124\uC774\uBC84 \uC0AC\uC6A9\uC790 \uC815\uBCF4 \uC870\uD68C \uC2E4\uD328" }, 401);
    const naverUser = naverData.response;
    uid = `naver:${naverUser.id}`;
    email = naverUser.email || "";
    displayName = naverUser.name || naverUser.nickname || "";
    photoURL = naverUser.profile_image || "";
    phone = normalizePhone(naverUser.mobile || "");
  } else {
    return json2({ error: "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uC18C\uC15C \uB85C\uADF8\uC778\uC785\uB2C8\uB2E4." }, 400);
  }
  try {
    const customToken = await createFirebaseCustomToken(uid, clientEmail, privateKey);
    return json2({ customToken, displayName, email, photoURL, phone });
  } catch (e) {
    return json2({ error: `\uCEE4\uC2A4\uD140 \uD1A0\uD070 \uC0DD\uC131 \uC2E4\uD328: ${e.message}` }, 500);
  }
}
__name(onRequestPost2, "onRequestPost2");
__name2(onRequestPost2, "onRequestPost");
function normalizePhone(raw) {
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("82") && digits.length >= 11) digits = "0" + digits.slice(2);
  return digits;
}
__name(normalizePhone, "normalizePhone");
__name2(normalizePhone, "normalizePhone");
async function createFirebaseCustomToken(uid, clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1e3);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now,
    exp: now + 3600,
    uid
  };
  const encode = /* @__PURE__ */ __name2((obj) => btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""), "encode");
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const pem = privateKey.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\\n/g, "").replace(/\n/g, "").replace(/\r/g, "").replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const sigEncoded = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return `${signingInput}.${sigEncoded}`;
}
__name(createFirebaseCustomToken, "createFirebaseCustomToken");
__name2(createFirebaseCustomToken, "createFirebaseCustomToken");
function json2(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS2 });
}
__name(json2, "json2");
__name2(json2, "json");
var PROJECT_ID2 = "gwatop-8edaf";
var FIREBASE_WEB_API_KEY2 = "AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ";
var FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID2}/databases/(default)/documents`;
var DOC_BASE = `projects/${PROJECT_ID2}/databases/(default)/documents`;
var MAX_COMMENTS = 300;
var _cachedToken = null;
var _tokenExpiry = 0;
var CORS3 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json"
};
async function onRequestOptions3() {
  return new Response(null, { status: 204, headers: CORS3 });
}
__name(onRequestOptions3, "onRequestOptions3");
__name2(onRequestOptions3, "onRequestOptions");
async function verifyFirebaseToken2(idToken) {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY2}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.users?.[0] || null;
  } catch {
    return null;
  }
}
__name(verifyFirebaseToken2, "verifyFirebaseToken2");
__name2(verifyFirebaseToken2, "verifyFirebaseToken");
async function getFirebaseAccessToken2(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1e3);
  if (_cachedToken && _tokenExpiry - now > 300) return _cachedToken;
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iss: clientEmail, sub: clientEmail, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600, scope: "https://www.googleapis.com/auth/datastore" };
  const encode = /* @__PURE__ */ __name2((obj) => btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""), "encode");
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const pem = privateKey.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\\n/g, "").replace(/\n/g, "").replace(/\r/g, "").replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", keyData.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput));
  const sigEncoded = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const jwt = `${signingInput}.${sigEncoded}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}` });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("Access token \uBC1C\uAE09 \uC2E4\uD328");
  _cachedToken = tokenData.access_token;
  _tokenExpiry = now + 3600;
  return _cachedToken;
}
__name(getFirebaseAccessToken2, "getFirebaseAccessToken2");
__name2(getFirebaseAccessToken2, "getFirebaseAccessToken");
async function getDocument(path, accessToken) {
  const res = await fetch(`${FIRESTORE_BASE}/${path}`, { headers: { "Authorization": `Bearer ${accessToken}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`\uBB38\uC11C \uC77D\uAE30 \uC2E4\uD328 (${res.status})`);
  return res.json();
}
__name(getDocument, "getDocument");
__name2(getDocument, "getDocument");
async function commitWrites(writes, accessToken) {
  const res = await fetch(`${FIRESTORE_BASE}:commit`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ writes })
  });
  if (!res.ok) throw new Error(`\uCEE4\uBC0B \uC2E4\uD328 (${res.status}): ${await res.text()}`);
  return res.json();
}
__name(commitWrites, "commitWrites");
__name2(commitWrites, "commitWrites");
async function addComment({ postId, uid, content, isAnonymous, parentId, nickname, university, accessToken }) {
  const postDoc = await getDocument(`community_posts/${postId}`, accessToken);
  if (!postDoc) throw new Error("\uAC8C\uC2DC\uAE00\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const commentCount = parseInt(postDoc.fields?.commentCount?.integerValue || "0");
  if (commentCount >= MAX_COMMENTS) throw new Error(`\uB313\uAE00\uC740 \uCD5C\uB300 ${MAX_COMMENTS}\uAC1C\uAE4C\uC9C0 \uC791\uC131 \uAC00\uB2A5\uD569\uB2C8\uB2E4.`);
  const postAuthorUid = postDoc.fields?.uid?.stringValue;
  const effectiveAnonymous = uid === postAuthorUid ? false : isAnonymous;
  let anonNumber = null;
  const writes = [];
  if (effectiveAnonymous) {
    const anonMap = {};
    const existingMap = postDoc.fields?.anonymousMap?.mapValue?.fields || {};
    for (const [k, v] of Object.entries(existingMap)) anonMap[k] = parseInt(v.integerValue || v.stringValue || 0);
    if (anonMap[uid] !== void 0) {
      anonNumber = anonMap[uid];
    } else {
      const counter = parseInt(postDoc.fields?.anonymousCounter?.integerValue || "0");
      anonNumber = counter + 1;
      anonMap[uid] = anonNumber;
      writes.push({
        update: {
          name: `${DOC_BASE}/community_posts/${postId}`,
          fields: {
            anonymousMap: { mapValue: { fields: Object.fromEntries(Object.entries(anonMap).map(([k, v]) => [k, { integerValue: String(v) }])) } },
            anonymousCounter: { integerValue: String(anonNumber) }
          }
        },
        updateMask: { fieldPaths: ["anonymousMap", "anonymousCounter"] }
      });
    }
  }
  const commentId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  writes.push({
    update: {
      name: `${DOC_BASE}/community_posts/${postId}/comments/${commentId}`,
      fields: {
        uid: { stringValue: uid },
        isAnonymous: { booleanValue: effectiveAnonymous },
        anonNumber: anonNumber !== null ? { integerValue: String(anonNumber) } : { nullValue: null },
        nickname: { stringValue: nickname },
        university: { stringValue: university },
        content: { stringValue: content },
        parentId: parentId ? { stringValue: parentId } : { nullValue: null },
        deleted: { booleanValue: false },
        likes: { integerValue: "0" },
        likedBy: { arrayValue: { values: [] } },
        createdAt: { timestampValue: (/* @__PURE__ */ new Date()).toISOString() }
      }
    },
    currentDocument: { exists: false }
  });
  writes.push({
    transform: {
      document: `${DOC_BASE}/community_posts/${postId}`,
      fieldTransforms: [{ fieldPath: "commentCount", increment: { integerValue: "1" } }]
    }
  });
  await commitWrites(writes, accessToken);
  return { commentId, anonNumber };
}
__name(addComment, "addComment");
__name2(addComment, "addComment");
async function deleteComment({ postId, commentId, uid, accessToken }) {
  const commentDoc = await getDocument(`community_posts/${postId}/comments/${commentId}`, accessToken);
  if (!commentDoc) throw new Error("\uB313\uAE00\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const commentUid = commentDoc.fields?.uid?.stringValue;
  if (commentUid !== uid) throw new Error("\uAD8C\uD55C \uC5C6\uC74C");
  if (commentDoc.fields?.deleted?.booleanValue) throw new Error("\uC774\uBBF8 \uC0AD\uC81C\uB41C \uB313\uAE00\uC785\uB2C8\uB2E4.");
  await commitWrites([
    {
      update: {
        name: `${DOC_BASE}/community_posts/${postId}/comments/${commentId}`,
        fields: {
          deleted: { booleanValue: true },
          content: { stringValue: "" },
          likes: { integerValue: "0" },
          likedBy: { arrayValue: { values: [] } }
        }
      },
      updateMask: { fieldPaths: ["deleted", "content", "likes", "likedBy"] }
    },
    {
      transform: {
        document: `${DOC_BASE}/community_posts/${postId}`,
        fieldTransforms: [{ fieldPath: "commentCount", increment: { integerValue: "-1" } }]
      }
    }
  ], accessToken);
}
__name(deleteComment, "deleteComment");
__name2(deleteComment, "deleteComment");
async function onRequestPost3(context) {
  const { request, env } = context;
  const authHeader = request.headers.get("Authorization") || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) return json3({ error: "\uC778\uC99D \uD544\uC694" }, 401);
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return json3({ error: "Firebase \uC11C\uBE44\uC2A4 \uACC4\uC815 \uD658\uACBD \uBCC0\uC218 \uC5C6\uC74C" }, 500);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json3({ error: "\uC694\uCCAD \uD30C\uC2F1 \uC2E4\uD328" }, 400);
  }
  const { action, postId } = body;
  if (!action || !postId) return json3({ error: "\uD544\uC218 \uD30C\uB77C\uBBF8\uD130 \uB204\uB77D" }, 400);
  let user, accessToken;
  try {
    [user, accessToken] = await Promise.all([
      verifyFirebaseToken2(idToken),
      getFirebaseAccessToken2(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY)
    ]);
  } catch {
    return json3({ error: "\uC11C\uBC84 \uC778\uC99D \uC2E4\uD328" }, 500);
  }
  if (!user) return json3({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uD1A0\uD070" }, 401);
  const uid = user.localId;
  try {
    if (action === "add") {
      const { content, isAnonymous, parentId, nickname, university } = body;
      if (!content?.trim()) return json3({ error: "\uB0B4\uC6A9\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694." }, 400);
      if (content.length > 500) return json3({ error: "\uB313\uAE00\uC740 500\uC790 \uC774\uD558\uB85C \uC791\uC131\uD574\uC8FC\uC138\uC694." }, 400);
      const result = await addComment({ postId, uid, content: content.trim(), isAnonymous: !!isAnonymous, parentId: parentId || null, nickname: nickname || "", university: university || "", accessToken });
      return json3({ success: true, ...result });
    }
    if (action === "delete") {
      const { commentId } = body;
      if (!commentId) return json3({ error: "commentId \uB204\uB77D" }, 400);
      await deleteComment({ postId, commentId, uid, accessToken });
      return json3({ success: true });
    }
    return json3({ error: "\uC54C \uC218 \uC5C6\uB294 action" }, 400);
  } catch (e) {
    const status = e.message?.includes("\uAD8C\uD55C") ? 403 : e.message?.includes("\uCC3E\uC744 \uC218 \uC5C6") ? 404 : 400;
    return json3({ error: e.message || "\uCC98\uB9AC \uC911 \uC624\uB958 \uBC1C\uC0DD" }, status);
  }
}
__name(onRequestPost3, "onRequestPost3");
__name2(onRequestPost3, "onRequestPost");
function json3(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS3 });
}
__name(json3, "json3");
__name2(json3, "json");
var CORS4 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};
var PROJECT_ID3 = "gwatop-8edaf";
function creditsFromAmount(amount) {
  if (amount === 1900) return 100;
  if (amount === 3900) return 300;
  if (amount === 9900) return 1e3;
  return 0;
}
__name(creditsFromAmount, "creditsFromAmount");
__name2(creditsFromAmount, "creditsFromAmount");
async function onRequestOptions4() {
  return new Response(null, { status: 204, headers: CORS4 });
}
__name(onRequestOptions4, "onRequestOptions4");
__name2(onRequestOptions4, "onRequestOptions");
async function onRequestPost4(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json4({ error: "\uC694\uCCAD \uD30C\uC2F1 \uC2E4\uD328" }, 400);
  }
  const { paymentKey, orderId, amount, uid } = body;
  if (!paymentKey || !orderId || !amount || !uid) {
    return json4({ error: "\uD544\uC218 \uD30C\uB77C\uBBF8\uD130 \uB204\uB77D" }, 400);
  }
  const tossSecret = env.TOSS_SECRET_KEY;
  if (!tossSecret) return json4({ error: "TOSS_SECRET_KEY \uD658\uACBD \uBCC0\uC218\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }, 500);
  const tossRes = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(tossSecret + ":")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ paymentKey, orderId, amount })
  });
  if (!tossRes.ok) {
    const err = await tossRes.json().catch(() => ({}));
    return json4({ error: `\uACB0\uC81C \uD655\uC778 \uC2E4\uD328: ${err.message || tossRes.status}` }, 400);
  }
  const tossData = await tossRes.json();
  if (tossData.status !== "DONE") {
    return json4({ error: `\uACB0\uC81C \uC0C1\uD0DC \uC624\uB958: ${tossData.status}` }, 400);
  }
  const credits = creditsFromAmount(amount);
  if (credits === 0) {
    return json4({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uACB0\uC81C \uAE08\uC561\uC785\uB2C8\uB2E4." }, 400);
  }
  try {
    const clientEmail = env.FIREBASE_CLIENT_EMAIL;
    const privateKey = env.FIREBASE_PRIVATE_KEY;
    if (!clientEmail || !privateKey) {
      return json4({ error: "Firebase \uC11C\uBE44\uC2A4 \uACC4\uC815 \uD658\uACBD \uBCC0\uC218\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }, 500);
    }
    const accessToken = await getFirebaseAccessToken3(clientEmail, privateKey);
    const alreadyProcessed = await checkAndRecordPayment(orderId, uid, credits, accessToken);
    if (alreadyProcessed) {
      return json4({ error: "\uC774\uBBF8 \uCC98\uB9AC\uB41C \uACB0\uC81C\uC785\uB2C8\uB2E4." }, 409);
    }
    await addCreditsToFirestore(uid, credits, accessToken);
  } catch (e) {
    console.error("Firestore update error:", e);
    return json4({ error: "\uD06C\uB808\uB527 \uCD94\uAC00 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4." }, 500);
  }
  return json4({ success: true, credits, orderId });
}
__name(onRequestPost4, "onRequestPost4");
__name2(onRequestPost4, "onRequestPost");
async function getFirebaseAccessToken3(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1e3);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/datastore"
  };
  const encode = /* @__PURE__ */ __name2((obj) => btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""), "encode");
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const pem = privateKey.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\\n/g, "").replace(/\n/g, "").replace(/\r/g, "").replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const sigEncoded = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const jwt = `${signingInput}.${sigEncoded}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error("Access token \uBC1C\uAE09 \uC2E4\uD328: " + JSON.stringify(tokenData));
  }
  return tokenData.access_token;
}
__name(getFirebaseAccessToken3, "getFirebaseAccessToken3");
__name2(getFirebaseAccessToken3, "getFirebaseAccessToken");
async function checkAndRecordPayment(orderId, uid, credits, accessToken) {
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID3}/databases/(default)/documents/payments/${orderId}`;
  const getRes = await fetch(baseUrl, {
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  if (getRes.ok) return true;
  await fetch(baseUrl, {
    method: "PATCH",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        uid: { stringValue: uid },
        credits: { integerValue: String(credits) },
        processedAt: { integerValue: String(Date.now()) }
      }
    })
  });
  return false;
}
__name(checkAndRecordPayment, "checkAndRecordPayment");
__name2(checkAndRecordPayment, "checkAndRecordPayment");
async function addCreditsToFirestore(uid, credits, accessToken) {
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID3}/databases/(default)/documents/users/${uid}`;
  const getRes = await fetch(baseUrl, {
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  let currentCredits = 0;
  if (getRes.ok) {
    const doc = await getRes.json();
    currentCredits = parseInt(doc.fields?.credits?.integerValue || 0);
  }
  const patchRes = await fetch(`${baseUrl}?updateMask.fieldPaths=credits`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      fields: {
        credits: { integerValue: String(currentCredits + credits) }
      }
    })
  });
  if (!patchRes.ok) {
    const err = await patchRes.text();
    throw new Error(`Firestore \uC5C5\uB370\uC774\uD2B8 \uC2E4\uD328: ${err}`);
  }
}
__name(addCreditsToFirestore, "addCreditsToFirestore");
__name2(addCreditsToFirestore, "addCreditsToFirestore");
function json4(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS4 });
}
__name(json4, "json4");
__name2(json4, "json");
var PROJECT_ID4 = "gwatop-8edaf";
var FIREBASE_WEB_API_KEY3 = "AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ";
var FIRESTORE_BASE2 = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID4}/databases/(default)/documents`;
var DOC_BASE2 = `projects/${PROJECT_ID4}/databases/(default)/documents`;
var _cachedToken2 = null;
var _tokenExpiry2 = 0;
var CORS5 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json"
};
async function onRequestOptions5() {
  return new Response(null, { status: 204, headers: CORS5 });
}
__name(onRequestOptions5, "onRequestOptions5");
__name2(onRequestOptions5, "onRequestOptions");
async function verifyFirebaseToken3(idToken) {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY3}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.users?.[0] || null;
  } catch {
    return null;
  }
}
__name(verifyFirebaseToken3, "verifyFirebaseToken3");
__name2(verifyFirebaseToken3, "verifyFirebaseToken");
async function getFirebaseAccessToken4(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1e3);
  if (_cachedToken2 && _tokenExpiry2 - now > 300) return _cachedToken2;
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase"
  };
  const encode = /* @__PURE__ */ __name2((obj) => btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""), "encode");
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const pem = privateKey.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\\n/g, "").replace(/\n/g, "").replace(/\r/g, "").replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const sigEncoded = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const jwt = `${signingInput}.${sigEncoded}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("Access token \uBC1C\uAE09 \uC2E4\uD328");
  _cachedToken2 = tokenData.access_token;
  _tokenExpiry2 = now + 3600;
  return _cachedToken2;
}
__name(getFirebaseAccessToken4, "getFirebaseAccessToken4");
__name2(getFirebaseAccessToken4, "getFirebaseAccessToken");
async function queryDocs(collectionPath, uid, accessToken, pageToken = null) {
  const url = `${FIRESTORE_BASE2}:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: collectionPath }],
      where: {
        fieldFilter: {
          field: { fieldPath: "uid" },
          op: "EQUAL",
          value: { stringValue: uid }
        }
      },
      limit: 100
    }
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`\uCFFC\uB9AC \uC2E4\uD328 (${res.status})`);
  const data = await res.json();
  return data.filter((r) => r.document).map((r) => r.document);
}
__name(queryDocs, "queryDocs");
__name2(queryDocs, "queryDocs");
async function getSubDocs(parentPath, subCollection, accessToken) {
  const url = `${FIRESTORE_BASE2}/${parentPath}/${subCollection}?pageSize=300`;
  const res = await fetch(url, { headers: { "Authorization": `Bearer ${accessToken}` } });
  if (!res.ok) return [];
  const data = await res.json();
  return data.documents || [];
}
__name(getSubDocs, "getSubDocs");
__name2(getSubDocs, "getSubDocs");
async function deleteDocument(name, accessToken) {
  await fetch(`https://firestore.googleapis.com/v1/${name}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
}
__name(deleteDocument, "deleteDocument");
__name2(deleteDocument, "deleteDocument");
var STORAGE_BUCKET = "gwatop-8edaf.firebasestorage.app";
async function deleteStorageFile(imageUrl, accessToken) {
  try {
    const match2 = imageUrl.match(/\/o\/([^?]+)/);
    if (!match2) return;
    const encodedPath = match2[1];
    await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodedPath}`,
      { method: "DELETE", headers: { "Authorization": `Bearer ${accessToken}` } }
    );
  } catch {
  }
}
__name(deleteStorageFile, "deleteStorageFile");
__name2(deleteStorageFile, "deleteStorageFile");
async function deleteAuthUser(uid, accessToken) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID4}/accounts/${uid}`,
    { method: "DELETE", headers: { "Authorization": `Bearer ${accessToken}` } }
  );
  return res.ok;
}
__name(deleteAuthUser, "deleteAuthUser");
__name2(deleteAuthUser, "deleteAuthUser");
async function onRequestPost5(context) {
  const { request, env } = context;
  const authHeader = request.headers.get("Authorization") || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) return json5({ error: "\uC778\uC99D \uD544\uC694" }, 401);
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return json5({ error: "Firebase \uC11C\uBE44\uC2A4 \uACC4\uC815 \uD658\uACBD \uBCC0\uC218 \uC5C6\uC74C" }, 500);
  }
  let user, accessToken;
  try {
    [user, accessToken] = await Promise.all([
      verifyFirebaseToken3(idToken),
      getFirebaseAccessToken4(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY)
    ]);
  } catch {
    return json5({ error: "\uC11C\uBC84 \uC778\uC99D \uC2E4\uD328" }, 500);
  }
  if (!user) return json5({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uD1A0\uD070" }, 401);
  const uid = user.localId;
  try {
    const myPosts = await queryDocs("community_posts", uid, accessToken);
    for (const post of myPosts) {
      const postPath = post.name.split("/documents/")[1];
      const comments = await getSubDocs(postPath, "comments", accessToken);
      for (const comment of comments) {
        await deleteDocument(comment.name, accessToken);
      }
      const imageUrl = post.fields?.imageUrl?.stringValue;
      if (imageUrl) await deleteStorageFile(imageUrl, accessToken);
      await deleteDocument(post.name, accessToken);
    }
    const myComments = await queryDocs("comments", uid, accessToken);
    for (const comment of myComments) {
      await deleteDocument(comment.name, accessToken);
    }
    const myLikes = await queryDocs("post_likes", uid, accessToken);
    for (const like of myLikes) {
      await deleteDocument(like.name, accessToken);
    }
    await deleteDocument(
      `projects/${PROJECT_ID4}/databases/(default)/documents/users/${uid}`,
      accessToken
    );
    await deleteAuthUser(uid, accessToken);
    return json5({ success: true });
  } catch (e) {
    console.error("delete-account error:", e);
    return json5({ error: e.message || "\uD0C8\uD1F4 \uCC98\uB9AC \uC2E4\uD328" }, 500);
  }
}
__name(onRequestPost5, "onRequestPost5");
__name2(onRequestPost5, "onRequestPost");
function json5(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS5 });
}
__name(json5, "json5");
__name2(json5, "json");
var GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
var PROJECT_ID5 = "gwatop-8edaf";
var RATE_LIMIT_SECONDS = 30;
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};
async function onRequestOptions6() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
__name(onRequestOptions6, "onRequestOptions6");
__name2(onRequestOptions6, "onRequestOptions");
async function onRequestGet2(context) {
  const { env } = context;
  const apiKey = env.GEMINI_API_KEY || env["GEMINI_API_KEY "] || "";
  if (!apiKey) return new Response(JSON.stringify({ error: "no key" }), { status: 200, headers: CORS_HEADERS });
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const data = await res.json();
  const models = (data.models || []).map((m) => m.name);
  return new Response(JSON.stringify({ models }), { status: 200, headers: CORS_HEADERS });
}
__name(onRequestGet2, "onRequestGet2");
__name2(onRequestGet2, "onRequestGet");
async function onRequestPost6(context) {
  const { request, env } = context;
  const apiKey = env.GEMINI_API_KEY || env["GEMINI_API_KEY "] || env.gemini_api_key || "";
  if (!apiKey) {
    return json6({
      error: "GEMINI_API_KEY \uD658\uACBD \uBCC0\uC218\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. Cloudflare Pages \u2192 \uC124\uC815 \u2192 \uD658\uACBD \uBCC0\uC218\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694."
    }, 500);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json6({ error: "\uC694\uCCAD \uBCF8\uBB38\uC744 \uD30C\uC2F1\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }, 400);
  }
  const { idToken } = body;
  if (idToken && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    try {
      const tokenPayload = decodeJWT(idToken);
      const uid = tokenPayload?.user_id || tokenPayload?.sub;
      if (uid) {
        const rateLimitResult = await checkAndUpdateRateLimit(uid, env);
        if (!rateLimitResult.allowed) {
          return json6({ error: `\uC694\uCCAD\uC774 \uB108\uBB34 \uBE60\uB985\uB2C8\uB2E4. ${rateLimitResult.waitSeconds}\uCD08 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.` }, 429);
        }
      }
    } catch {
    }
  }
  const { text, images, types, type, count } = body;
  const selectedTypes = types || (type ? [type] : ["mcq"]);
  const validTypes = selectedTypes.filter((t) => ["mcq", "short", "ox"].includes(t));
  if (validTypes.length === 0) return json6({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uBB38\uC81C \uC720\uD615\uC785\uB2C8\uB2E4." }, 400);
  const hasText = text && text.length >= 50;
  const hasImages = Array.isArray(images) && images.length > 0;
  if (!hasText && !hasImages) return json6({ error: "text \uB610\uB294 images \uD30C\uB77C\uBBF8\uD130\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." }, 400);
  if (!count || count < 1 || count > 50) return json6({ error: "\uBB38\uC81C \uAC1C\uC218\uB294 1~50 \uC0AC\uC774\uC5EC\uC57C \uD569\uB2C8\uB2E4." }, 400);
  const safeImages = hasImages ? images.slice(0, 20) : [];
  const isVisionMode = safeImages.length > 0;
  const truncatedText = hasText ? text.slice(0, 55e3) : "";
  const prompt = buildPrompt(truncatedText, validTypes, Math.min(parseInt(count), 50), isVisionMode);
  try {
    const parts = [];
    if (isVisionMode) {
      safeImages.forEach((img) => {
        parts.push({ inlineData: { mimeType: "image/jpeg", data: img } });
      });
    }
    parts.push({ text: prompt });
    const geminiBody = JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.7,
        topP: 0.95,
        maxOutputTokens: 8192,
        // Vision 모드: 수식/도표 해석을 위해 약간의 thinking 허용
        thinkingConfig: { thinkingBudget: isVisionMode ? 1024 : 0 }
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
      ]
    });
    const delays = [4e3, 8e3];
    let geminiRes;
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: geminiBody
      });
      if (geminiRes.status !== 429 || attempt === delays.length) break;
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini API error:", geminiRes.status, errText);
      if (geminiRes.status === 429) {
        return json6({ error: "\uC11C\uBC84\uAC00 \uD63C\uC7A1\uD569\uB2C8\uB2E4. 1~2\uBD84 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." }, 429);
      }
      console.error("Gemini API error detail:", geminiRes.status, errText.slice(0, 300));
      return json6({ error: "\uD034\uC988 \uC0DD\uC131\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." }, 502);
    }
    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return json6({ error: "Gemini API\uB85C\uBD80\uD130 \uC751\uB2F5\uC744 \uBC1B\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }, 502);
    }
    let quiz;
    try {
      quiz = JSON.parse(rawText);
    } catch {
      const match2 = rawText.match(/\{[\s\S]*\}/);
      if (match2) {
        try {
          quiz = JSON.parse(match2[0]);
        } catch {
          try {
            const fixed = match2[0].replace(
              /("(?:[^"\\]|\\.)*")/g,
              (m) => m.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")
            );
            quiz = JSON.parse(fixed);
          } catch {
            console.error("JSON \uD30C\uC2F1 \uC2E4\uD328. \uC6D0\uBB38:", rawText.slice(0, 500));
            return json6({ error: "\uD034\uC988 \uB370\uC774\uD130 \uD615\uC2DD \uC624\uB958\uC785\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." }, 502);
          }
        }
      } else {
        console.error("JSON \uC5C6\uC74C. \uC6D0\uBB38:", rawText.slice(0, 500));
        return json6({ error: "\uD034\uC988 \uC0DD\uC131 \uACB0\uACFC\uB97C \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." }, 502);
      }
    }
    if (!quiz.questions || !Array.isArray(quiz.questions)) {
      return json6({ error: "\uD034\uC988 \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." }, 502);
    }
    quiz.questions = quiz.questions.map((q, i) => ({ id: i + 1, ...q }));
    return json6(quiz, 200);
  } catch (err) {
    console.error("Unexpected error:", err);
    return json6({ error: `\uC11C\uBC84 \uC624\uB958: ${err.message}` }, 500);
  }
}
__name(onRequestPost6, "onRequestPost6");
__name2(onRequestPost6, "onRequestPost");
function decodeJWT(token) {
  try {
    const payload = token.split(".")[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const parsed = JSON.parse(decoded);
    const now = Math.floor(Date.now() / 1e3);
    if (parsed.exp && parsed.exp < now) return null;
    return parsed;
  } catch {
    return null;
  }
}
__name(decodeJWT, "decodeJWT");
__name2(decodeJWT, "decodeJWT");
async function getFirebaseAccessToken5(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1e3);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/datastore"
  };
  const encode = /* @__PURE__ */ __name2((obj) => btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""), "encode");
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const pem = privateKey.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\\n/g, "").replace(/\n/g, "").replace(/\r/g, "").replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const sigEncoded = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const jwt = `${signingInput}.${sigEncoded}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("Firebase \uC561\uC138\uC2A4 \uD1A0\uD070 \uBC1C\uAE09 \uC2E4\uD328");
  return tokenData.access_token;
}
__name(getFirebaseAccessToken5, "getFirebaseAccessToken5");
__name2(getFirebaseAccessToken5, "getFirebaseAccessToken");
async function checkAndUpdateRateLimit(uid, env) {
  const accessToken = await getFirebaseAccessToken5(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
  const docUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID5}/databases/(default)/documents/quiz_rate_limits/${uid}`;
  const headers = { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" };
  const getRes = await fetch(docUrl, { headers });
  if (getRes.ok) {
    const data = await getRes.json();
    const lastSec = parseInt(data.fields?.lastRequestAt?.integerValue || 0);
    const nowSec2 = Math.floor(Date.now() / 1e3);
    const elapsed = nowSec2 - lastSec;
    if (elapsed < RATE_LIMIT_SECONDS) {
      return { allowed: false, waitSeconds: RATE_LIMIT_SECONDS - elapsed };
    }
  }
  const nowSec = Math.floor(Date.now() / 1e3);
  await fetch(`${docUrl}?updateMask.fieldPaths=lastRequestAt`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ fields: { lastRequestAt: { integerValue: String(nowSec) } } })
  });
  return { allowed: true };
}
__name(checkAndUpdateRateLimit, "checkAndUpdateRateLimit");
__name2(checkAndUpdateRateLimit, "checkAndUpdateRateLimit");
function buildPrompt(text, types, count, isVisionMode = false) {
  const distribution = distributeCount(count, types);
  const typeDescriptions = {
    mcq: /* @__PURE__ */ __name2((n) => `
\uAC1D\uAD00\uC2DD ${n}\uAC1C:
- 4\uAC1C\uC758 \uC120\uD0DD\uC9C0 (\u2460\u2461\u2462\u2463 \uD615\uC2DD)
- answer: "\u2460" ~ "\u2463" \uC911 \uD558\uB098
- \uC608: {"type":"mcq","question":"...","options":["\u2460 ...","\u2461 ...","\u2462 ...","\u2463 ..."],"answer":"\u2461","explanation":"..."}`, "mcq"),
    short: /* @__PURE__ */ __name2((n) => `
\uC8FC\uAD00\uC2DD ${n}\uAC1C:
- \uD575\uC2EC \uD0A4\uC6CC\uB4DC \uB610\uB294 \uAC04\uACB0\uD55C \uBB38\uC7A5\uC73C\uB85C \uB2F5
- options \uD544\uB4DC \uC5C6\uC74C
- \uC608: {"type":"short","question":"...","answer":"...","explanation":"..."}`, "short"),
    ox: /* @__PURE__ */ __name2((n) => `
OX \uD034\uC988 ${n}\uAC1C:
- \uCC38/\uAC70\uC9D3 \uD310\uBCC4 \uC9C4\uC220\uBB38
- answer: "O" \uB610\uB294 "X"
- options \uD544\uB4DC \uC5C6\uC74C
- \uC608: {"type":"ox","question":"...","answer":"O","explanation":"..."}`, "ox")
  };
  const typeInstructions = types.map((t) => typeDescriptions[t](distribution[t])).join("\n");
  const totalDesc = types.map((t) => `${typeLabels[t]} ${distribution[t]}\uAC1C`).join(", ");
  const visionNote = isVisionMode ? `\uC704\uC5D0 \uCCA8\uBD80\uB41C PDF \uD398\uC774\uC9C0 \uC774\uBBF8\uC9C0\uB4E4\uC744 \uBD84\uC11D\uD558\uC5EC \uC218\uC2DD, \uB3C4\uD45C, \uADF8\uB798\uD504, \uACC4\uC0B0 \uACFC\uC815\uC744 \uD3EC\uD568\uD55C \uBB38\uC81C\uB97C \uCD9C\uC81C\uD558\uC138\uC694.${text ? "\n\uC544\uB798 \uCD94\uCD9C\uB41C \uD14D\uC2A4\uD2B8\uB3C4 \uD568\uAED8 \uCC38\uACE0\uD558\uC138\uC694." : ""}
` : "";
  const textSection = text ? `[\uD559\uC2B5 \uC790\uB8CC]
${text}

` : "";
  return `\uB2F9\uC2E0\uC740 \uB300\uD559\uAD50 \uC2DC\uD5D8\uC744 \uC804\uBB38\uC73C\uB85C \uCD9C\uC81C\uD558\uB294 \uAD50\uC218\uC785\uB2C8\uB2E4.
${isVisionMode ? "\uCCA8\uBD80\uB41C PDF \uC774\uBBF8\uC9C0\uC640 \uD14D\uC2A4\uD2B8 \uC790\uB8CC" : "\uC544\uB798 \uD14D\uC2A4\uD2B8"}\uB97C \uBC14\uD0D5\uC73C\uB85C \uB300\uD559\uC0DD \uC218\uC900\uC758 \uC2DC\uD5D8 \uBB38\uC81C \uCD1D ${count}\uAC1C\uB97C \uC0DD\uC131\uD574\uC8FC\uC138\uC694.

${visionNote}${textSection}[\uC0DD\uC131\uD560 \uBB38\uC81C]
${totalDesc}

[\uAC01 \uC720\uD615\uBCC4 \uD615\uC2DD]
${typeInstructions}

[\uC791\uC131 \uADDC\uCE59]
1. \uBC18\uB4DC\uC2DC \uD55C\uAD6D\uC5B4\uB85C \uC791\uC131\uD558\uC138\uC694.
2. \uAD50\uC7AC\uC758 \uD575\uC2EC \uAC1C\uB150\uACFC \uC911\uC694 \uC6D0\uB9AC\uB97C \uB2E4\uB8E8\uB294 \uBB38\uC81C\uB97C \uB9CC\uB4DC\uC138\uC694.
3. \uC218\uC2DD, \uACC4\uC0B0, \uB3C4\uD45C\uAC00 \uC788\uB2E4\uBA74 \uD574\uB2F9 \uB0B4\uC6A9\uC744 \uBB38\uC81C\uC5D0 \uBC18\uC601\uD558\uC138\uC694.
4. \uBB38\uC81C\uB294 \uC11C\uB85C \uC911\uBCF5\uB418\uC9C0 \uC54A\uC544\uC57C \uD569\uB2C8\uB2E4.
5. explanation\uC740 \uC65C \uC815\uB2F5\uC778\uC9C0 \uBA85\uD655\uD788 \uC124\uBA85\uD574\uC57C \uD569\uB2C8\uB2E4.
   - \uAC1D\uAD00\uC2DD(mcq) \uBB38\uC81C\uC758 \uACBD\uC6B0, \uAC01 \uC120\uC9C0(\u2460\u2461\u2462\u2463)\uB9C8\uB2E4 \uBC18\uB4DC\uC2DC \\n\\n\uC73C\uB85C \uAD6C\uBD84\uD558\uC5EC \uAC1C\uBCC4 \uD574\uC124\uC744 \uC791\uC131\uD558\uC138\uC694.
   - \uC608\uC2DC: "\u2460 ...\uC774\uBBC0\uB85C \uC633\uB2E4.\\n\\n\u2461 ...\uC774\uBBC0\uB85C \uD2C0\uB9AC\uB2E4.\\n\\n\u2462 ...\uC774\uBBC0\uB85C \uC633\uB2E4."
6. \uBC18\uB4DC\uC2DC \uC544\uB798 JSON \uD615\uC2DD\uC73C\uB85C\uB9CC \uC751\uB2F5\uD558\uC138\uC694. \uCD94\uAC00 \uD14D\uC2A4\uD2B8 \uC5C6\uC774 \uC21C\uC218 JSON\uB9CC \uBC18\uD658\uD558\uC138\uC694.
7. question \uD544\uB4DC\uB294 \uB9C8\uD06C\uB2E4\uC6B4 \uD615\uC2DD\uC73C\uB85C \uC791\uC131\uD558\uC138\uC694:
   - \uD45C \uD615\uD0DC\uC758 \uC790\uB8CC\uB294 \uBC18\uB4DC\uC2DC \uB9C8\uD06C\uB2E4\uC6B4 \uD45C(| \uD5E4\uB354 | \uD5E4\uB354 | \uD615\uC2DD)\uB85C \uC791\uC131\uD558\uC138\uC694.
   - \uC218\uC2DD\uC740 **\uAD75\uAC8C** \uD615\uC2DD\uC73C\uB85C \uAC15\uC870\uD558\uC138\uC694.
   - \uC790\uB8CC, \uC870\uAC74 \uB4F1 \uAD6C\uBD84\uC774 \uD544\uC694\uD55C \uD56D\uBAA9\uC740 **[\uC790\uB8CC]** \uCC98\uB7FC \uAD75\uAC8C \uD45C\uC2DC\uD558\uACE0 \uC904\uBC14\uAFC8\uC73C\uB85C \uAD6C\uBD84\uD558\uC138\uC694.
8. question \uD544\uB4DC\uC5D0 \uC808\uB300 \uD3EC\uD568\uD558\uC9C0 \uB9D0\uC544\uC57C \uD560 \uAC83:
   - \uACF5\uC2DD, \uC218\uC2DD, \uACC4\uC0B0 \uBC29\uBC95, \uD480\uC774 \uACFC\uC815 (\uC608: E(r) = \u03A3..., \u03C3(r) = ... \uAC19\uC740 \uC218\uC2DD)
     \u2192 \uD559\uC0DD\uC774 \uC9C1\uC811 \uC54C\uACE0 \uC788\uC5B4\uC57C \uD558\uB294 \uB0B4\uC6A9\uC774\uBBC0\uB85C \uC808\uB300 \uBB38\uC81C\uC5D0 \uC81C\uC2DC\uD558\uC9C0 \uB9C8\uC138\uC694.
   - [\uACC4\uC0B0 \uACFC\uC815], [\uACF5\uC2DD], [\uD480\uC774] \uB4F1 \uC6D0\uBB38\uC5D0 \uC788\uB294 \uACF5\uC2DD \uC139\uC158\uB3C4 \uADF8\uB300\uB85C \uBCF5\uC0AC\uD558\uC9C0 \uB9C8\uC138\uC694.
   - \uC120\uC9C0 \uBC88\uD638 (\u2460\u2461\u2462\u2463 \uB610\uB294 A/B/C/D \uB4F1). \uC120\uC9C0\uB294 \uBC18\uB4DC\uC2DC options \uBC30\uC5F4\uC5D0\uB9CC \uB123\uC73C\uC138\uC694.
   \u203B \uB2E8, \uC22B\uC790 \uB370\uC774\uD130\uAC00 \uB2F4\uAE34 \uD45C\uB098 [\uC790\uB8CC] \uC139\uC158\uC740 \uD3EC\uD568\uD574\uB3C4 \uB429\uB2C8\uB2E4.
9. JSON \uD615\uC2DD \uC8FC\uC758\uC0AC\uD56D:
   - JSON \uBB38\uC790\uC5F4 \uAC12 \uC548\uC758 \uC904\uBC14\uAFC8\uC740 \uBC18\uB4DC\uC2DC \\n\uC73C\uB85C \uD45C\uC2DC\uD558\uC138\uC694 (\uC2E4\uC81C \uC904\uBC14\uAFC8 \uBB38\uC790 \uC0AC\uC6A9 \uAE08\uC9C0)
   - \uC30D\uB530\uC634\uD45C(")\uB294 \uBC18\uB4DC\uC2DC \\"\uB85C \uC774\uC2A4\uCF00\uC774\uD504\uD558\uC138\uC694.

[\uC751\uB2F5 \uD615\uC2DD]
{"questions": [ ...\uBB38\uC81C \uBC30\uC5F4... ]}

\uC815\uD655\uD788 \uCD1D ${count}\uAC1C\uC758 \uBB38\uC81C\uB97C \uC0DD\uC131\uD558\uC138\uC694.`;
}
__name(buildPrompt, "buildPrompt");
__name2(buildPrompt, "buildPrompt");
var typeLabels = { mcq: "\uAC1D\uAD00\uC2DD", short: "\uC8FC\uAD00\uC2DD", ox: "OX \uD034\uC988" };
function distributeCount(total, types) {
  const result = {};
  const base = Math.floor(total / types.length);
  let remainder = total - base * types.length;
  types.forEach((t) => {
    result[t] = base + (remainder-- > 0 ? 1 : 0);
  });
  return result;
}
__name(distributeCount, "distributeCount");
__name2(distributeCount, "distributeCount");
function json6(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}
__name(json6, "json6");
__name2(json6, "json");
var PROJECT_ID6 = "gwatop-8edaf";
var FIREBASE_WEB_API_KEY4 = "AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ";
var FIRESTORE_BASE3 = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID6}/databases/(default)/documents`;
var ALGOLIA_INDEX = "posts";
var _cachedToken3 = null;
var _tokenExpiry3 = 0;
async function getServiceAccountToken(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1e3);
  if (_cachedToken3 && _tokenExpiry3 - now > 300) return _cachedToken3;
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iss: clientEmail, sub: clientEmail, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600, scope: "https://www.googleapis.com/auth/datastore" };
  const encode = /* @__PURE__ */ __name2((obj) => btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""), "encode");
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const pem = privateKey.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\\n/g, "").replace(/\n/g, "").replace(/\r/g, "").replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", keyData.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput));
  const sigEncoded = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const jwt = `${signingInput}.${sigEncoded}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}` });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("\uD1A0\uD070 \uBC1C\uAE09 \uC2E4\uD328");
  _cachedToken3 = tokenData.access_token;
  _tokenExpiry3 = now + 3600;
  return _cachedToken3;
}
__name(getServiceAccountToken, "getServiceAccountToken");
__name2(getServiceAccountToken, "getServiceAccountToken");
async function deletePostLikes(postId, accessToken) {
  try {
    const res = await fetch(`${FIRESTORE_BASE3}:runQuery`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "post_likes" }], where: { fieldFilter: { field: { fieldPath: "postId" }, op: "EQUAL", value: { stringValue: postId } } } } })
    });
    if (!res.ok) return;
    const docs = (await res.json()).filter((r) => r.document);
    await Promise.all(docs.map((r) => fetch(`https://firestore.googleapis.com/v1/${r.document.name}`, { method: "DELETE", headers: { "Authorization": `Bearer ${accessToken}` } })));
  } catch {
  }
}
__name(deletePostLikes, "deletePostLikes");
__name2(deletePostLikes, "deletePostLikes");
var CORS6 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json"
};
async function onRequestOptions7() {
  return new Response(null, { status: 204, headers: CORS6 });
}
__name(onRequestOptions7, "onRequestOptions7");
__name2(onRequestOptions7, "onRequestOptions");
async function verifyFirebaseToken4(idToken) {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY4}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.users?.[0] || null;
  } catch {
    return null;
  }
}
__name(verifyFirebaseToken4, "verifyFirebaseToken4");
__name2(verifyFirebaseToken4, "verifyFirebaseToken");
async function onRequestPost7(context) {
  const { request, env } = context;
  const authHeader = request.headers.get("Authorization") || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) return json7({ error: "\uC778\uC99D \uD544\uC694" }, 401);
  const user = await verifyFirebaseToken4(idToken);
  if (!user) return json7({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uD1A0\uD070" }, 401);
  let body;
  try {
    body = await request.json();
  } catch {
    return json7({ error: "\uC694\uCCAD \uD30C\uC2F1 \uC2E4\uD328" }, 400);
  }
  const { action, postId, post } = body;
  if (!action || !postId) return json7({ error: "\uD544\uC218 \uD30C\uB77C\uBBF8\uD130 \uB204\uB77D" }, 400);
  const appId = env.ALGOLIA_APP_ID;
  const adminKey = env.ALGOLIA_ADMIN_KEY;
  if (!appId || !adminKey) return json7({ error: "Algolia \uD658\uACBD \uBCC0\uC218 \uC5C6\uC74C" }, 500);
  const algoliaBase = `https://${appId}.algolia.net/1/indexes/${ALGOLIA_INDEX}`;
  const headers = {
    "X-Algolia-Application-Id": appId,
    "X-Algolia-API-Key": adminKey,
    "Content-Type": "application/json"
  };
  if (action === "remove") {
    if (post?.uid && post.uid !== user.localId) return json7({ error: "\uAD8C\uD55C \uC5C6\uC74C" }, 403);
    const algoliaDelete = fetch(`${algoliaBase}/${postId}`, { method: "DELETE", headers });
    const postLikesCleanup = env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY ? getServiceAccountToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY).then((token) => deletePostLikes(postId, token)).catch(() => {
    }) : Promise.resolve();
    const [algoliaRes] = await Promise.all([algoliaDelete, postLikesCleanup]);
    if (!algoliaRes.ok && algoliaRes.status !== 404) {
      return json7({ error: `Algolia \uC0AD\uC81C \uC2E4\uD328: ${algoliaRes.status}` }, 500);
    }
    return json7({ success: true });
  }
  if (action === "add") {
    if (!post) return json7({ error: "post \uB370\uC774\uD130 \uD544\uC694" }, 400);
    if (post.uid !== user.localId) return json7({ error: "\uAD8C\uD55C \uC5C6\uC74C" }, 403);
    const record = {
      objectID: postId,
      title: post.title || "",
      content: post.content || "",
      nickname: post.isAnonymous ? "" : post.nickname || "",
      university: post.university || "",
      uid: post.uid,
      isAnonymous: post.isAnonymous || false,
      createdAt: typeof post.createdAt === "number" ? post.createdAt : Date.now(),
      likes: post.likes || 0,
      commentCount: post.commentCount || 0,
      imageUrl: post.imageUrl || ""
    };
    const res = await fetch(`${algoliaBase}/${postId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(record)
    });
    if (!res.ok) {
      return json7({ error: `Algolia \uC778\uB371\uC2F1 \uC2E4\uD328: ${res.status}` }, 500);
    }
    return json7({ success: true });
  }
  return json7({ error: "\uC54C \uC218 \uC5C6\uB294 action" }, 400);
}
__name(onRequestPost7, "onRequestPost7");
__name2(onRequestPost7, "onRequestPost");
function json7(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS6 });
}
__name(json7, "json7");
__name2(json7, "json");
var PROJECT_ID7 = "gwatop-8edaf";
var FIREBASE_WEB_API_KEY5 = "AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ";
var FIRESTORE_BASE4 = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID7}/databases/(default)/documents`;
var DOC_BASE3 = `projects/${PROJECT_ID7}/databases/(default)/documents`;
var _cachedToken4 = null;
var _tokenExpiry4 = 0;
var CORS7 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json"
};
async function onRequestOptions8() {
  return new Response(null, { status: 204, headers: CORS7 });
}
__name(onRequestOptions8, "onRequestOptions8");
__name2(onRequestOptions8, "onRequestOptions");
async function verifyFirebaseToken5(idToken) {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY5}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.users?.[0] || null;
  } catch {
    return null;
  }
}
__name(verifyFirebaseToken5, "verifyFirebaseToken5");
__name2(verifyFirebaseToken5, "verifyFirebaseToken");
async function getFirebaseAccessToken6(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1e3);
  if (_cachedToken4 && _tokenExpiry4 - now > 300) return _cachedToken4;
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iss: clientEmail, sub: clientEmail, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600, scope: "https://www.googleapis.com/auth/datastore" };
  const encode = /* @__PURE__ */ __name2((obj) => btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""), "encode");
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const pem = privateKey.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\\n/g, "").replace(/\n/g, "").replace(/\r/g, "").replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", keyData.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput));
  const sigEncoded = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const jwt = `${signingInput}.${sigEncoded}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}` });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("Access token \uBC1C\uAE09 \uC2E4\uD328");
  _cachedToken4 = tokenData.access_token;
  _tokenExpiry4 = now + 3600;
  return _cachedToken4;
}
__name(getFirebaseAccessToken6, "getFirebaseAccessToken6");
__name2(getFirebaseAccessToken6, "getFirebaseAccessToken");
async function getDocument2(path, accessToken) {
  const res = await fetch(`${FIRESTORE_BASE4}/${path}`, { headers: { "Authorization": `Bearer ${accessToken}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`\uBB38\uC11C \uC77D\uAE30 \uC2E4\uD328 (${res.status})`);
  return res.json();
}
__name(getDocument2, "getDocument2");
__name2(getDocument2, "getDocument");
async function commitWrites2(writes, accessToken) {
  const res = await fetch(`${FIRESTORE_BASE4}:commit`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ writes })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`\uCEE4\uBC0B \uC2E4\uD328 (${res.status}): ${err}`);
  }
  return res.json();
}
__name(commitWrites2, "commitWrites2");
__name2(commitWrites2, "commitWrites");
async function onRequestPost8(context) {
  const { request, env } = context;
  const authHeader = request.headers.get("Authorization") || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) return json8({ error: "\uC778\uC99D \uD544\uC694" }, 401);
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return json8({ error: "Firebase \uC11C\uBE44\uC2A4 \uACC4\uC815 \uD658\uACBD \uBCC0\uC218 \uC5C6\uC74C" }, 500);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json8({ error: "\uC694\uCCAD \uD30C\uC2F1 \uC2E4\uD328" }, 400);
  }
  const { postId, commentId } = body;
  if (!postId || !commentId) return json8({ error: "\uD544\uC218 \uD30C\uB77C\uBBF8\uD130 \uB204\uB77D" }, 400);
  let user, accessToken;
  try {
    [user, accessToken] = await Promise.all([
      verifyFirebaseToken5(idToken),
      getFirebaseAccessToken6(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY)
    ]);
  } catch {
    return json8({ error: "\uC11C\uBC84 \uC778\uC99D \uC2E4\uD328" }, 500);
  }
  if (!user) return json8({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uD1A0\uD070" }, 401);
  const uid = user.localId;
  try {
    const commentDoc = await getDocument2(`community_posts/${postId}/comments/${commentId}`, accessToken);
    if (!commentDoc) return json8({ error: "\uB313\uAE00\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }, 404);
    if (commentDoc.fields?.deleted?.booleanValue) return json8({ error: "\uC0AD\uC81C\uB41C \uB313\uAE00\uC785\uB2C8\uB2E4." }, 400);
    const likedBy = (commentDoc.fields?.likedBy?.arrayValue?.values || []).map((v) => v.stringValue);
    const wasLiked = likedBy.includes(uid);
    const currentLikes = parseInt(commentDoc.fields?.likes?.integerValue || "0");
    const newLikes = wasLiked ? Math.max(0, currentLikes - 1) : currentLikes + 1;
    const newLikedBy = wasLiked ? likedBy.filter((id) => id !== uid) : [...likedBy, uid];
    await commitWrites2([{
      update: {
        name: `${DOC_BASE3}/community_posts/${postId}/comments/${commentId}`,
        fields: {
          likes: { integerValue: String(newLikes) },
          likedBy: { arrayValue: { values: newLikedBy.map((id) => ({ stringValue: id })) } }
        }
      },
      updateMask: { fieldPaths: ["likes", "likedBy"] }
    }], accessToken);
    return json8({ liked: !wasLiked, likes: newLikes });
  } catch (e) {
    return json8({ error: e.message || "\uCC98\uB9AC \uC911 \uC624\uB958 \uBC1C\uC0DD" }, 500);
  }
}
__name(onRequestPost8, "onRequestPost8");
__name2(onRequestPost8, "onRequestPost");
function json8(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS7 });
}
__name(json8, "json8");
__name2(json8, "json");
var PROJECT_ID8 = "gwatop-8edaf";
var FIREBASE_WEB_API_KEY6 = "AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ";
var FIRESTORE_BASE5 = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID8}/databases/(default)/documents`;
var DOC_BASE4 = `projects/${PROJECT_ID8}/databases/(default)/documents`;
var _cachedToken5 = null;
var _tokenExpiry5 = 0;
var _rateLimitMap = /* @__PURE__ */ new Map();
var RATE_LIMIT = 30;
var RATE_WINDOW = 60 * 1e3;
function isRateLimited(uid) {
  const now = Date.now();
  const entry = _rateLimitMap.get(uid);
  if (!entry || now - entry.start > RATE_WINDOW) {
    _rateLimitMap.set(uid, { count: 1, start: now });
    if (_rateLimitMap.size > 1e4) {
      for (const [k, v] of _rateLimitMap) {
        if (now - v.start > RATE_WINDOW) _rateLimitMap.delete(k);
      }
    }
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count++;
  return false;
}
__name(isRateLimited, "isRateLimited");
__name2(isRateLimited, "isRateLimited");
var CORS8 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json"
};
async function onRequestOptions9() {
  return new Response(null, { status: 204, headers: CORS8 });
}
__name(onRequestOptions9, "onRequestOptions9");
__name2(onRequestOptions9, "onRequestOptions");
async function verifyFirebaseToken6(idToken) {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY6}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.users?.[0] || null;
  } catch {
    return null;
  }
}
__name(verifyFirebaseToken6, "verifyFirebaseToken6");
__name2(verifyFirebaseToken6, "verifyFirebaseToken");
async function getFirebaseAccessToken7(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1e3);
  if (_cachedToken5 && _tokenExpiry5 - now > 300) return _cachedToken5;
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/datastore"
  };
  const encode = /* @__PURE__ */ __name2((obj) => btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""), "encode");
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const pem = privateKey.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\\n/g, "").replace(/\n/g, "").replace(/\r/g, "").replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const sigEncoded = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const jwt = `${signingInput}.${sigEncoded}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("Access token \uBC1C\uAE09 \uC2E4\uD328");
  _cachedToken5 = tokenData.access_token;
  _tokenExpiry5 = now + 3600;
  return _cachedToken5;
}
__name(getFirebaseAccessToken7, "getFirebaseAccessToken7");
__name2(getFirebaseAccessToken7, "getFirebaseAccessToken");
async function getDocument3(path, accessToken) {
  const res = await fetch(`${FIRESTORE_BASE5}/${path}`, {
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`\uBB38\uC11C \uC77D\uAE30 \uC2E4\uD328 (${res.status}): ${err}`);
  }
  return res.json();
}
__name(getDocument3, "getDocument3");
__name2(getDocument3, "getDocument");
async function commitWrites3(writes, accessToken) {
  const res = await fetch(`${FIRESTORE_BASE5}:commit`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ writes })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`\uCEE4\uBC0B \uC2E4\uD328 (${res.status}): ${err}`);
  }
  return res.json();
}
__name(commitWrites3, "commitWrites3");
__name2(commitWrites3, "commitWrites");
async function onRequestPost9(context) {
  const { request, env } = context;
  const authHeader = request.headers.get("Authorization") || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) return json9({ error: "\uC778\uC99D \uD1A0\uD070 \uC5C6\uC74C" }, 401);
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return json9({ error: "Firebase \uC11C\uBE44\uC2A4 \uACC4\uC815 \uD658\uACBD \uBCC0\uC218\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }, 500);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json9({ error: "\uC694\uCCAD \uD30C\uC2F1 \uC2E4\uD328" }, 400);
  }
  const { postId } = body;
  if (!postId || typeof postId !== "string" || postId.length > 100) {
    return json9({ error: "postId \uD615\uC2DD \uC624\uB958" }, 400);
  }
  let user, accessToken;
  try {
    [user, accessToken] = await Promise.all([
      verifyFirebaseToken6(idToken),
      getFirebaseAccessToken7(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY)
    ]);
  } catch (e) {
    return json9({ error: "\uC11C\uBC84 \uC778\uC99D \uC2E4\uD328" }, 500);
  }
  if (!user) return json9({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uD1A0\uD070" }, 401);
  const uid = user.localId;
  if (isRateLimited(uid)) {
    return json9({ error: "\uC694\uCCAD\uC774 \uB108\uBB34 \uB9CE\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." }, 429);
  }
  try {
    const [postDoc, likeDoc] = await Promise.all([
      getDocument3(`community_posts/${postId}`, accessToken),
      getDocument3(`post_likes/${postId}_${uid}`, accessToken)
    ]);
    if (!postDoc) return json9({ error: "\uAC8C\uC2DC\uBB3C\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }, 404);
    const authorUid = postDoc.fields?.uid?.stringValue;
    if (!authorUid) return json9({ error: "\uAC8C\uC2DC\uBB3C \uB370\uC774\uD130 \uC624\uB958" }, 500);
    if (authorUid === uid) return json9({ error: "\uC790\uAE30 \uAE00\uC5D0\uB294 \uC88B\uC544\uC694\uB97C \uB204\uB97C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }, 400);
    const currentLikes = parseInt(postDoc.fields?.likes?.integerValue || "0");
    const wasLiked = likeDoc !== null;
    const newLikes = wasLiked ? Math.max(0, currentLikes - 1) : currentLikes + 1;
    const writes = [];
    if (wasLiked) {
      writes.push({
        delete: `${DOC_BASE4}/post_likes/${postId}_${uid}`,
        currentDocument: { exists: true }
      });
      writes.push({
        transform: {
          document: `${DOC_BASE4}/community_posts/${postId}`,
          fieldTransforms: [{ fieldPath: "likes", increment: { integerValue: "-1" } }]
        }
      });
      if (currentLikes <= 5) {
        writes.push({
          transform: {
            document: `${DOC_BASE4}/users/${authorUid}`,
            fieldTransforms: [
              { fieldPath: "credits", increment: { integerValue: "-1" } },
              { fieldPath: "referralCredits", increment: { integerValue: "-1" } }
            ]
          }
        });
      }
    } else {
      writes.push({
        update: {
          name: `${DOC_BASE4}/post_likes/${postId}_${uid}`,
          fields: {
            postId: { stringValue: postId },
            uid: { stringValue: uid },
            createdAt: { timestampValue: (/* @__PURE__ */ new Date()).toISOString() }
          }
        },
        currentDocument: { exists: false }
      });
      writes.push({
        transform: {
          document: `${DOC_BASE4}/community_posts/${postId}`,
          fieldTransforms: [{ fieldPath: "likes", increment: { integerValue: "1" } }]
        }
      });
      if (currentLikes < 5) {
        writes.push({
          transform: {
            document: `${DOC_BASE4}/users/${authorUid}`,
            fieldTransforms: [
              { fieldPath: "credits", increment: { integerValue: "1" } },
              { fieldPath: "referralCredits", increment: { integerValue: "1" } }
            ]
          }
        });
      }
    }
    await commitWrites3(writes, accessToken);
    return json9({ liked: !wasLiked, likes: newLikes });
  } catch (e) {
    console.error("like-post error:", e);
    return json9({ error: e.message || "\uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4." }, 500);
  }
}
__name(onRequestPost9, "onRequestPost9");
__name2(onRequestPost9, "onRequestPost");
function json9(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS8 });
}
__name(json9, "json9");
__name2(json9, "json");
var PROJECT_ID9 = "gwatop-8edaf";
var ADMIN_EMAIL2 = "hjh2640730@gmail.com";
var FIREBASE_WEB_API_KEY7 = "AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ";
var FIRESTORE_BASE6 = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID9}/databases/(default)/documents`;
var ALGOLIA_INDEX2 = "posts";
var CORS9 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};
async function onRequestOptions10() {
  return new Response(null, { status: 204, headers: CORS9 });
}
__name(onRequestOptions10, "onRequestOptions10");
__name2(onRequestOptions10, "onRequestOptions");
async function verifyFirebaseToken7(idToken) {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY7}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.users?.[0] || null;
  } catch {
    return null;
  }
}
__name(verifyFirebaseToken7, "verifyFirebaseToken7");
__name2(verifyFirebaseToken7, "verifyFirebaseToken");
async function getFirebaseAccessToken8(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1e3);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/datastore"
  };
  const encode = /* @__PURE__ */ __name2((obj) => btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""), "encode");
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const pem = privateKey.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\\n/g, "").replace(/\n/g, "").replace(/\r/g, "").replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const sigEncoded = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const jwt = `${signingInput}.${sigEncoded}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("Access token \uBC1C\uAE09 \uC2E4\uD328");
  return tokenData.access_token;
}
__name(getFirebaseAccessToken8, "getFirebaseAccessToken8");
__name2(getFirebaseAccessToken8, "getFirebaseAccessToken");
function toAlgoliaRecord(docName, fields) {
  const postId = docName.split("/").pop();
  return {
    objectID: postId,
    title: fields.title?.stringValue || "",
    content: fields.content?.stringValue || "",
    nickname: fields.isAnonymous?.booleanValue ? "" : fields.nickname?.stringValue || "",
    university: fields.university?.stringValue || "",
    uid: fields.uid?.stringValue || "",
    isAnonymous: fields.isAnonymous?.booleanValue || false,
    createdAt: fields.createdAt?.timestampValue ? new Date(fields.createdAt.timestampValue).getTime() : Date.now(),
    likes: parseInt(fields.likes?.integerValue || "0"),
    commentCount: parseInt(fields.commentCount?.integerValue || "0"),
    imageUrl: fields.imageUrl?.stringValue || ""
  };
}
__name(toAlgoliaRecord, "toAlgoliaRecord");
__name2(toAlgoliaRecord, "toAlgoliaRecord");
async function onRequestPost10(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json10({ error: "\uC694\uCCAD \uD30C\uC2F1 \uC2E4\uD328" }, 400);
  }
  const user = await verifyFirebaseToken7(body.token || "");
  if (!user || user.email !== ADMIN_EMAIL2) {
    return json10({ error: "\uAD00\uB9AC\uC790 \uAD8C\uD55C \uC5C6\uC74C" }, 403);
  }
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return json10({ error: "Firebase \uC11C\uBE44\uC2A4 \uACC4\uC815 \uD658\uACBD \uBCC0\uC218 \uC5C6\uC74C" }, 500);
  }
  if (!env.ALGOLIA_APP_ID || !env.ALGOLIA_ADMIN_KEY) {
    return json10({ error: "Algolia \uD658\uACBD \uBCC0\uC218 \uC5C6\uC74C" }, 500);
  }
  const accessToken = await getFirebaseAccessToken8(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
  const algoliaBase = `https://${env.ALGOLIA_APP_ID}.algolia.net/1/indexes/${ALGOLIA_INDEX2}`;
  const algoliaHeaders = {
    "X-Algolia-Application-Id": env.ALGOLIA_APP_ID,
    "X-Algolia-API-Key": env.ALGOLIA_ADMIN_KEY,
    "Content-Type": "application/json"
  };
  let pageToken = null;
  let totalIndexed = 0;
  do {
    const url = `${FIRESTORE_BASE6}/community_posts?pageSize=100${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${accessToken}` } });
    if (!res.ok) return json10({ error: `Firestore \uC77D\uAE30 \uC2E4\uD328: ${res.status}` }, 500);
    const data = await res.json();
    pageToken = data.nextPageToken || null;
    const docs = data.documents || [];
    if (docs.length === 0) break;
    const requests = docs.map((d) => ({
      action: "addObject",
      body: toAlgoliaRecord(d.name, d.fields || {})
    }));
    const batchRes = await fetch(`${algoliaBase}/batch`, {
      method: "POST",
      headers: algoliaHeaders,
      body: JSON.stringify({ requests })
    });
    if (!batchRes.ok) {
      return json10({ error: `Algolia \uBC30\uCE58 \uC2E4\uD328: ${batchRes.status}` }, 500);
    }
    totalIndexed += docs.length;
  } while (pageToken);
  return json10({ success: true, totalIndexed });
}
__name(onRequestPost10, "onRequestPost10");
__name2(onRequestPost10, "onRequestPost");
function json10(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS9 });
}
__name(json10, "json10");
__name2(json10, "json");
var routes = [
  {
    routePath: "/api/admin",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/admin",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions]
  },
  {
    routePath: "/api/admin",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/auth-social",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions2]
  },
  {
    routePath: "/api/auth-social",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/comment",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions3]
  },
  {
    routePath: "/api/comment",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/api/confirm-payment",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions4]
  },
  {
    routePath: "/api/confirm-payment",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost4]
  },
  {
    routePath: "/api/delete-account",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions5]
  },
  {
    routePath: "/api/delete-account",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost5]
  },
  {
    routePath: "/api/generate-quiz",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/generate-quiz",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions6]
  },
  {
    routePath: "/api/generate-quiz",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost6]
  },
  {
    routePath: "/api/index-post",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions7]
  },
  {
    routePath: "/api/index-post",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost7]
  },
  {
    routePath: "/api/like-comment",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions8]
  },
  {
    routePath: "/api/like-comment",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost8]
  },
  {
    routePath: "/api/like-post",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions9]
  },
  {
    routePath: "/api/like-post",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost9]
  },
  {
    routePath: "/api/reindex-posts",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions10]
  },
  {
    routePath: "/api/reindex-posts",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost10]
  }
];
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
__name2(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name2(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name2(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name2(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name2(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name2(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
__name2(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
__name2(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name2(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
__name2(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
__name2(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
__name2(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
__name2(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
__name2(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
__name2(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
__name2(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");
__name2(pathToRegexp, "pathToRegexp");
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
__name2(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name2(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name2(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name2((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
var drainBody = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
__name2(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
__name2(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
__name2(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");
__name2(__facade_invoke__, "__facade_invoke__");
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  static {
    __name(this, "___Facade_ScheduledController__");
  }
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name2(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name2(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name2(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
__name2(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name2((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name2((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
__name2(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;

// ../../../usr/local/lib/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default2 = drainBody2;

// ../../../usr/local/lib/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError2(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError2(e.cause)
  };
}
__name(reduceError2, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError2(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default2 = jsonError2;

// .wrangler/tmp/bundle-fDCtz7/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__2 = [
  middleware_ensure_req_body_drained_default2,
  middleware_miniflare3_json_error_default2
];
var middleware_insertion_facade_default2 = middleware_loader_entry_default;

// ../../../usr/local/lib/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__2 = [];
function __facade_register__2(...args) {
  __facade_middleware__2.push(...args.flat());
}
__name(__facade_register__2, "__facade_register__");
function __facade_invokeChain__2(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__2(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__2, "__facade_invokeChain__");
function __facade_invoke__2(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__2(request, env, ctx, dispatch, [
    ...__facade_middleware__2,
    finalMiddleware
  ]);
}
__name(__facade_invoke__2, "__facade_invoke__");

// .wrangler/tmp/bundle-fDCtz7/middleware-loader.entry.ts
var __Facade_ScheduledController__2 = class ___Facade_ScheduledController__2 {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__2)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler2(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__2(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__2(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler2, "wrapExportedHandler");
function wrapWorkerEntrypoint2(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__2(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__2(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint2, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY2;
if (typeof middleware_insertion_facade_default2 === "object") {
  WRAPPED_ENTRY2 = wrapExportedHandler2(middleware_insertion_facade_default2);
} else if (typeof middleware_insertion_facade_default2 === "function") {
  WRAPPED_ENTRY2 = wrapWorkerEntrypoint2(middleware_insertion_facade_default2);
}
var middleware_loader_entry_default2 = WRAPPED_ENTRY2;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__2 as __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default2 as default
};
//# sourceMappingURL=functionsWorker-0.798021630426746.js.map
