var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/pages-DYHVEk/functionsWorker-0.9526881933305174.mjs
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
    if (type === "comments") {
      const comments = await getComments(accessToken);
      return json({ comments });
    }
    if (type === "shared_quizzes") {
      const quizzes = await getSharedQuizzes(accessToken);
      return json({ quizzes });
    }
    if (type === "games") {
      const games = await getGames(accessToken);
      return json({ games });
    }
    if (type === "user_quizzes") {
      const uid = url.searchParams.get("uid");
      if (!uid) return json({ error: "uid \uD544\uC694" }, 400);
      const quizzes = await getUserQuizHistory(uid, accessToken);
      return json({ quizzes });
    }
    if (type === "global_messages") {
      const messages = await getGlobalMessages(accessToken);
      return json({ messages });
    }
    if (type === "user_payments") {
      const uid = url.searchParams.get("uid");
      if (!uid) return json({ error: "uid \uD544\uC694" }, 400);
      const payments = await getPaymentsByUid(uid, accessToken);
      return json({ payments });
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
    const { uid, credits, freePoints, referralCredits, nickname, university } = body;
    if (!uid) return json({ error: "uid \uB204\uB77D" }, 400);
    const fields = {};
    if (credits !== void 0) fields.credits = parseInt(credits);
    if (freePoints !== void 0) fields.freePoints = parseInt(freePoints);
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
  if (action === "deleteSharedQuiz") {
    const { quizId } = body;
    if (!quizId) return json({ error: "quizId \uB204\uB77D" }, 400);
    try {
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
      await deleteFirestoreDoc(`shared_quizzes/${quizId}`, accessToken);
      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }
  if (action === "deleteComment") {
    const { postId, commentId } = body;
    if (!postId || !commentId) return json({ error: "postId, commentId \uB204\uB77D" }, 400);
    try {
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
      await deleteFirestoreDoc(`community_posts/${postId}/comments/${commentId}`, accessToken);
      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }
  if (action === "cancelGame") {
    const { gameId } = body;
    if (!gameId) return json({ error: "gameId \uB204\uB77D" }, 400);
    try {
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
      await patchFirestoreDoc(`games/${gameId}`, { status: { stringValue: "cancelled" } }, ["status"], accessToken);
      return json({ success: true });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }
  if (action === "grantFreePoints") {
    const amount = parseInt(body.amount);
    if (!amount || amount < 1 || amount > 1e4) return json({ error: "amount\uB294 1~10000 \uC0AC\uC774" }, 400);
    try {
      const accessToken = await getFirebaseAccessToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
      const count = await grantFreePointsToAll(amount, accessToken);
      return json({ success: true, count });
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
      freePoints: parseInt(f.freePoints?.integerValue || 0),
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
  const fsUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`;
  const fsRes = await fetch(fsUrl, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  if (!fsRes.ok && fsRes.status !== 404) throw new Error("\uC720\uC800 Firestore \uC0AD\uC81C \uC2E4\uD328");
  const authUrl = `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts/${uid}:delete`;
  const authRes = await fetch(authUrl, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  if (!authRes.ok && authRes.status !== 404) {
    console.error("Auth \uACC4\uC815 \uC0AD\uC81C \uC2E4\uD328:", authRes.status, await authRes.text().catch(() => ""));
  }
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
  if (fields.freePoints !== void 0) {
    firestoreFields.freePoints = { integerValue: String(fields.freePoints) };
    updateMasks.push("freePoints");
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
    scope: "https://www.googleapis.com/auth/cloud-platform"
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
async function getComments(accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "comments", allDescendants: true }],
        orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
        limit: 500
      }
    })
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.filter((r) => r.document).map((r) => {
    const f = r.document.fields || {};
    const parts = r.document.name.split("/");
    const commentId = parts.pop();
    parts.pop();
    const postId = parts.pop();
    return {
      commentId,
      postId,
      uid: f.uid?.stringValue || "",
      nickname: f.nickname?.stringValue || "",
      content: f.content?.stringValue || "",
      deleted: f.deleted?.booleanValue || false,
      isAnonymous: f.isAnonymous?.booleanValue || false,
      likes: parseInt(f.likes?.integerValue || 0),
      createdAt: f.createdAt?.timestampValue || null
    };
  });
}
__name(getComments, "getComments");
__name2(getComments, "getComments");
async function getSharedQuizzes(accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "shared_quizzes" }],
        orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
        limit: 300
      }
    })
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.filter((r) => r.document).map((r) => {
    const f = r.document.fields || {};
    return {
      id: r.document.name.split("/").pop(),
      title: f.title?.stringValue || "",
      subject: f.subject?.stringValue || "",
      uid: f.uid?.stringValue || "",
      nickname: f.nickname?.stringValue || "",
      questionCount: parseInt(f.questionCount?.integerValue || 0),
      viewCount: parseInt(f.viewCount?.integerValue || 0),
      createdAt: f.createdAt?.timestampValue || null
    };
  });
}
__name(getSharedQuizzes, "getSharedQuizzes");
__name2(getSharedQuizzes, "getSharedQuizzes");
async function getGames(accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "games" }],
        orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
        limit: 200
      }
    })
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.filter((r) => r.document).map((r) => {
    const f = r.document.fields || {};
    const p1f = f.player1?.mapValue?.fields;
    const p2f = f.player2?.mapValue?.fields;
    return {
      id: r.document.name.split("/").pop(),
      status: f.status?.stringValue || "",
      wager: parseInt(f.wager?.integerValue || 0),
      title: f.title?.stringValue || "",
      hasPassword: f.hasPassword?.booleanValue || false,
      player1: p1f ? { uid: p1f.uid?.stringValue || "", name: p1f.name?.stringValue || "" } : null,
      player2: p2f ? { uid: p2f.uid?.stringValue || "", name: p2f.name?.stringValue || "" } : null,
      winner: f.winner?.stringValue || null,
      p1Choice: f.p1Choice?.stringValue || null,
      p2Choice: f.p2Choice?.stringValue || null,
      createdAt: f.createdAt?.timestampValue || null
    };
  });
}
__name(getGames, "getGames");
__name2(getGames, "getGames");
async function getUserQuizHistory(uid, accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/quiz_history?pageSize=20`;
  const res = await fetch(url, { headers: { "Authorization": `Bearer ${accessToken}` } });
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.documents) return [];
  return data.documents.map((doc) => {
    const f = doc.fields || {};
    return {
      id: doc.name.split("/").pop(),
      subject: f.subject?.stringValue || "",
      questionCount: parseInt(f.questionCount?.integerValue || 0),
      type: f.type?.stringValue || "",
      createdAt: f.createdAt?.timestampValue || null
    };
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
__name(getUserQuizHistory, "getUserQuizHistory");
__name2(getUserQuizHistory, "getUserQuizHistory");
async function getPaymentsByUid(uid, accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "payments" }],
        where: { fieldFilter: { field: { fieldPath: "uid" }, op: "EQUAL", value: { stringValue: uid } } },
        orderBy: [{ field: { fieldPath: "processedAt" }, direction: "DESCENDING" }],
        limit: 50
      }
    })
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.filter((r) => r.document).map((r) => {
    const f = r.document.fields || {};
    return {
      orderId: f.orderId?.stringValue || r.document.name.split("/").pop(),
      credits: parseInt(f.credits?.integerValue || 0),
      amount: parseInt(f.amount?.integerValue || 0),
      processedAt: parseInt(f.processedAt?.integerValue || 0)
    };
  });
}
__name(getPaymentsByUid, "getPaymentsByUid");
__name2(getPaymentsByUid, "getPaymentsByUid");
async function getGlobalMessages(accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "global_messages" }],
        orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
        limit: 50
      }
    })
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.filter((r) => r.document).map((r) => {
    const f = r.document.fields || {};
    return {
      id: r.document.name.split("/").pop(),
      title: f.title?.stringValue || "",
      body: f.body?.stringValue || "",
      rewardType: f.rewardType?.stringValue || "none",
      rewardAmount: parseInt(f.rewardAmount?.integerValue || 0),
      createdAt: f.createdAt?.timestampValue || null
    };
  });
}
__name(getGlobalMessages, "getGlobalMessages");
__name2(getGlobalMessages, "getGlobalMessages");
async function grantFreePointsToAll(amount, accessToken) {
  const users = await getUsers(accessToken);
  const DOC_BASE11 = `projects/${PROJECT_ID}/databases/(default)/documents`;
  const batchUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:batchWrite`;
  const chunks = [];
  for (let i = 0; i < users.length; i += 400) chunks.push(users.slice(i, i + 400));
  let total = 0;
  for (const chunk of chunks) {
    const writes = chunk.map((u) => ({
      update: {
        name: `${DOC_BASE11}/users/${u.uid}`,
        fields: { freePoints: { integerValue: String((u.freePoints || 0) + amount) } }
      },
      updateMask: { fieldPaths: ["freePoints"] }
    }));
    const res = await fetch(batchUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ writes })
    });
    if (res.ok) total += chunk.length;
  }
  return total;
}
__name(grantFreePointsToAll, "grantFreePointsToAll");
__name2(grantFreePointsToAll, "grantFreePointsToAll");
async function deleteFirestoreDoc(path, accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
  const res = await fetch(url, { method: "DELETE", headers: { "Authorization": `Bearer ${accessToken}` } });
  if (!res.ok && res.status !== 404) throw new Error("\uC0AD\uC81C \uC2E4\uD328");
}
__name(deleteFirestoreDoc, "deleteFirestoreDoc");
__name2(deleteFirestoreDoc, "deleteFirestoreDoc");
async function patchFirestoreDoc(path, fields, fieldPaths, accessToken) {
  const maskQuery = fieldPaths.map((f) => `updateMask.fieldPaths=${f}`).join("&");
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}?${maskQuery}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields })
  });
  if (!res.ok) throw new Error("\uC5C5\uB370\uC774\uD2B8 \uC2E4\uD328");
}
__name(patchFirestoreDoc, "patchFirestoreDoc");
__name2(patchFirestoreDoc, "patchFirestoreDoc");
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
__name(json, "json");
__name2(json, "json");
var PROJECT_ID2 = "gwatop-8edaf";
var FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID2}/databases/(default)/documents`;
var ADMIN_EMAIL2 = "hjh2640730@gmail.com";
var ALERT_COOLDOWN_MS = 20 * 60 * 60 * 1e3;
var KV_LAST_ALERT_KEY = "alert_last_sent";
var _cachedToken = null;
var _tokenExpiry = 0;
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
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("\uD1A0\uD070 \uBC1C\uAE09 \uC2E4\uD328");
  _cachedToken = tokenData.access_token;
  _tokenExpiry = now + 3600;
  return _cachedToken;
}
__name(getFirebaseAccessToken2, "getFirebaseAccessToken2");
__name2(getFirebaseAccessToken2, "getFirebaseAccessToken");
async function queryCount(accessToken, filters) {
  const query = { from: [{ collectionId: filters.collection }], limit: filters.limit || 500 };
  if (filters.where) query.where = filters.where;
  const res = await fetch(`${FIRESTORE_BASE}:runQuery`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: query })
  });
  if (!res.ok) return 0;
  const docs = await res.json();
  return docs.filter((d) => d.document).length;
}
__name(queryCount, "queryCount");
__name2(queryCount, "queryCount");
function calcFirebaseMonthlyKRW(dailyReads, dailyWrites) {
  const monthlyReads = dailyReads * 30;
  const monthlyWrites = dailyWrites * 30;
  const readsCost = Math.max(0, monthlyReads - 15e5) / 1e5 * 90;
  const writesCost = Math.max(0, monthlyWrites - 6e5) / 1e5 * 270;
  return Math.round(readsCost + writesCost);
}
__name(calcFirebaseMonthlyKRW, "calcFirebaseMonthlyKRW");
__name2(calcFirebaseMonthlyKRW, "calcFirebaseMonthlyKRW");
function getRoadmapStage(data) {
  const { estimatedDailyReads, totalPosts, firebaseMonthlyKRW } = data;
  const readRatio = estimatedDailyReads / 5e4;
  if (firebaseMonthlyKRW > 15e4) return 3;
  if (firebaseMonthlyKRW > 1e5 || readRatio > 0.8) return 2;
  if (readRatio > 0.6 || totalPosts > 7e3) return 1;
  return 0;
}
__name(getRoadmapStage, "getRoadmapStage");
__name2(getRoadmapStage, "getRoadmapStage");
function buildEmailHtml(alerts, data, stage) {
  const stageNames = ["\uCD08\uAE30 \uB2E8\uACC4", "\uC131\uC7A5 \uC8FC\uC758", "\uC720\uB8CC \uC804\uD658 \uD544\uC694", "\uC11C\uBC84 \uC774\uC804 \uD544\uC694"];
  const stageColors = ["#22c55e", "#f59e0b", "#ef4444", "#7c3aed"];
  const stageName = stageNames[stage];
  const stageColor = stageColors[stage];
  const todayKST = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(/* @__PURE__ */ new Date());
  const criticals = alerts.filter((a) => a.level === "critical");
  const warnings = alerts.filter((a) => a.level === "warning");
  const alertRows = alerts.map((a) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">
        <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;background:${a.level === "critical" ? "#fee2e2" : "#fef3c7"};color:${a.level === "critical" ? "#dc2626" : "#d97706"};">
          ${a.level === "critical" ? "\uC704\uD5D8" : "\uC8FC\uC758"}
        </span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#374151;">${a.message}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#6b7280;">${a.action}</td>
    </tr>
  `).join("");
  return `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:640px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 8px rgba(0,0,0,0.08);">

    <!-- \uD5E4\uB354 -->
    <div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:28px 32px;">
      <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px;">GWATOP \uC11C\uBE44\uC2A4 \uC54C\uB9BC</div>
      <div style="font-size:13px;color:#94a3b8;margin-top:6px;">${todayKST} \uAE30\uC900</div>
    </div>

    <!-- \uB85C\uB4DC\uB9F5 \uB2E8\uACC4 -->
    <div style="padding:20px 32px;border-bottom:1px solid #f0f0f0;background:#fafafa;">
      <div style="font-size:13px;color:#6b7280;margin-bottom:4px;">\uD604\uC7AC \uC11C\uBE44\uC2A4 \uB2E8\uACC4</div>
      <div style="display:inline-block;padding:6px 16px;border-radius:20px;background:${stageColor};color:#fff;font-size:14px;font-weight:600;">
        ${stage}\uB2E8\uACC4 \xB7 ${stageName}
      </div>
    </div>

    <!-- \uC9C0\uD45C \uC694\uC57D -->
    <div style="padding:20px 32px;border-bottom:1px solid #f0f0f0;">
      <div style="font-size:14px;font-weight:600;color:#374151;margin-bottom:12px;">\uC624\uB298 \uC9C0\uD45C</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        <div style="background:#f8fafc;border-radius:8px;padding:12px 16px;">
          <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">\uC608\uC0C1 \uC77C\uC77C \uC77D\uAE30</div>
          <div style="font-size:16px;font-weight:700;color:#1e293b;">${data.estimatedDailyReads.toLocaleString()}</div>
        </div>
        <div style="background:#f8fafc;border-radius:8px;padding:12px 16px;">
          <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">\uAC8C\uC2DC\uAE00 \uC218</div>
          <div style="font-size:16px;font-weight:700;color:#1e293b;">${data.totalPosts.toLocaleString()}</div>
        </div>
        <div style="background:#f8fafc;border-radius:8px;padding:12px 16px;">
          <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">\uC608\uC0C1 \uC6D4 \uBE44\uC6A9</div>
          <div style="font-size:16px;font-weight:700;color:#1e293b;">\u20A9${data.firebaseMonthlyKRW.toLocaleString()}</div>
        </div>
      </div>
    </div>

    <!-- \uC54C\uB9BC \uBAA9\uB85D -->
    ${alerts.length > 0 ? `
    <div style="padding:20px 32px;border-bottom:1px solid #f0f0f0;">
      <div style="font-size:14px;font-weight:600;color:#374151;margin-bottom:12px;">
        \uC54C\uB9BC ${criticals.length > 0 ? `<span style="color:#dc2626;">\uC704\uD5D8 ${criticals.length}\uAC74</span>` : ""}
        ${warnings.length > 0 ? `<span style="color:#d97706;"> \uC8FC\uC758 ${warnings.length}\uAC74</span>` : ""}
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:500;width:60px;">\uC218\uC900</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:500;">\uB0B4\uC6A9</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:500;">\uC870\uCE58</th>
          </tr>
        </thead>
        <tbody>${alertRows}</tbody>
      </table>
    </div>
    ` : `
    <div style="padding:24px 32px;border-bottom:1px solid #f0f0f0;text-align:center;">
      <div style="font-size:32px;margin-bottom:8px;">\u2705</div>
      <div style="font-size:15px;color:#374151;font-weight:500;">\uBAA8\uB4E0 \uC9C0\uD45C\uAC00 \uC815\uC0C1\uC785\uB2C8\uB2E4</div>
      <div style="font-size:13px;color:#9ca3af;margin-top:4px;">\uC784\uACC4\uAC12\uC744 \uCD08\uACFC\uD55C \uD56D\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</div>
    </div>
    `}

    <!-- \uAD00\uB9AC\uC790 \uD398\uC774\uC9C0 \uB9C1\uD06C -->
    <div style="padding:20px 32px;">
      <a href="https://gwatop.pages.dev/admin.html" style="display:inline-block;padding:10px 20px;background:#1e293b;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:500;">
        \uAD00\uB9AC\uC790 \uD398\uC774\uC9C0\uC5D0\uC11C \uC790\uC138\uD788 \uBCF4\uAE30 \u2192
      </a>
    </div>

    <!-- \uD478\uD130 -->
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #f0f0f0;">
      <div style="font-size:12px;color:#9ca3af;">
        \uC774 \uBA54\uC77C\uC740 cron-job.org\uB97C \uD1B5\uD574 \uB9E4\uC77C \uC790\uB3D9 \uBC1C\uC1A1\uB429\uB2C8\uB2E4. \xB7 GWATOP \uC11C\uBE44\uC2A4 \uBAA8\uB2C8\uD130\uB9C1
      </div>
    </div>

  </div>
</body>
</html>
  `.trim();
}
__name(buildEmailHtml, "buildEmailHtml");
__name2(buildEmailHtml, "buildEmailHtml");
async function sendEmail(resendApiKey, subject, html) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "GWATOP \uC54C\uB9BC <onboarding@resend.dev>",
      to: [ADMIN_EMAIL2],
      subject,
      html
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend \uBC1C\uC1A1 \uC2E4\uD328: ${err}`);
  }
  return await res.json();
}
__name(sendEmail, "sendEmail");
__name2(sendEmail, "sendEmail");
var CORS2 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};
async function onRequestOptions2() {
  return new Response(null, { status: 204, headers: CORS2 });
}
__name(onRequestOptions2, "onRequestOptions2");
__name2(onRequestOptions2, "onRequestOptions");
async function onRequestGet2(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (!env.ALERT_SECRET || secret !== env.ALERT_SECRET) {
    return json2({ error: "\uC778\uC99D \uC2E4\uD328" }, 401);
  }
  const kv = env.GWATOP_CACHE;
  if (kv) {
    const lastSent = await kv.get(KV_LAST_ALERT_KEY, "json");
    if (lastSent && Date.now() - lastSent.ts < ALERT_COOLDOWN_MS) {
      return json2({ skipped: true, reason: "\uCFE8\uB2E4\uC6B4 \uC911", nextAt: new Date(lastSent.ts + ALERT_COOLDOWN_MS).toISOString() });
    }
  }
  let accessToken;
  try {
    accessToken = await getFirebaseAccessToken2(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
  } catch (e) {
    return json2({ error: `Firebase \uC778\uC99D \uC2E4\uD328: ${e.message}` }, 500);
  }
  const todayKST = new Intl.DateTimeFormat("sv", { timeZone: "Asia/Seoul" }).format(/* @__PURE__ */ new Date());
  const todayStartISO = (/* @__PURE__ */ new Date(`${todayKST}T00:00:00+09:00`)).toISOString();
  const [activeGames, waitingRooms, todayGames, totalPosts, todayQuizzes] = await Promise.all([
    queryCount(accessToken, {
      collection: "games",
      where: {
        compositeFilter: {
          op: "AND",
          filters: [
            { fieldFilter: { field: { fieldPath: "status" }, op: "NOT_EQUAL", value: { stringValue: "waiting" } } },
            { fieldFilter: { field: { fieldPath: "status" }, op: "NOT_EQUAL", value: { stringValue: "finished" } } },
            { fieldFilter: { field: { fieldPath: "status" }, op: "NOT_EQUAL", value: { stringValue: "cancelled" } } }
          ]
        }
      },
      limit: 500
    }),
    queryCount(accessToken, {
      collection: "games",
      where: { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "waiting" } } },
      limit: 200
    }),
    queryCount(accessToken, {
      collection: "games",
      where: { fieldFilter: { field: { fieldPath: "createdAt" }, op: "GREATER_THAN_OR_EQUAL", value: { stringValue: todayStartISO } } },
      limit: 500
    }),
    queryCount(accessToken, { collection: "community_posts", where: null, limit: 500 }),
    queryCount(accessToken, {
      collection: "quizzes",
      where: { fieldFilter: { field: { fieldPath: "createdAt" }, op: "GREATER_THAN_OR_EQUAL", value: { stringValue: todayStartISO } } },
      limit: 500
    })
  ]);
  const estimatedDailyReads = Math.max(waitingRooms * 2, activeGames) * 144;
  const estimatedDailyWrites = todayGames * 8;
  const estimatedDailyKvReads = Math.max(waitingRooms * 2, activeGames) * 144;
  const firebaseMonthlyKRW = calcFirebaseMonthlyKRW(estimatedDailyReads, estimatedDailyWrites);
  const data = { activeGames, waitingRooms, todayGames, totalPosts, todayQuizzes, estimatedDailyReads, estimatedDailyWrites, estimatedDailyKvReads, firebaseMonthlyKRW };
  const alerts = [];
  if (activeGames > 300) {
    alerts.push({ level: "critical", message: `\uB3D9\uC2DC \uAC8C\uC784 ${activeGames}\uD310`, action: "Firestore \uAD6C\uC870 \uC7AC\uC124\uACC4 \uD544\uC694. \uAC1C\uBC1C\uC790\uC5D0\uAC8C \uBB38\uC758\uD558\uC138\uC694." });
  } else if (activeGames > 100) {
    alerts.push({ level: "warning", message: `\uB3D9\uC2DC \uAC8C\uC784 ${activeGames}\uD310`, action: "300\uD310 \uCD08\uACFC \uC2DC \uC7AC\uC124\uACC4\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." });
  }
  if (waitingRooms > 30) {
    alerts.push({ level: "warning", message: `\uB300\uAE30\uBC29 ${waitingRooms}\uAC1C \uB204\uC801`, action: "cron-job.org cleanup \uC8FC\uAE30\uB97C 5\uBD84\uC73C\uB85C \uB2E8\uCD95\uD558\uC138\uC694." });
  }
  if (estimatedDailyReads > 4e4) {
    alerts.push({ level: "critical", message: `Firestore \uC77D\uAE30 ~${estimatedDailyReads.toLocaleString()}\uD68C (\uD55C\uB3C4 80% \uCD08\uACFC)`, action: "Firebase Blaze \uD50C\uB79C \uD655\uC778 \uB610\uB294 \uD3F4\uB9C1 \uAC04\uACA9 \uC870\uC815 \uD544\uC694." });
  } else if (estimatedDailyReads > 3e4) {
    alerts.push({ level: "warning", message: `Firestore \uC77D\uAE30 ~${estimatedDailyReads.toLocaleString()}\uD68C (\uD55C\uB3C4 60% \uCD08\uACFC)`, action: "Firebase \uCF58\uC194 \u2192 \uC0AC\uC6A9\uB7C9 \uD0ED\uC5D0\uC11C \uC2E4\uC81C \uC77D\uAE30 \uC218 \uD655\uC778." });
  }
  if (estimatedDailyWrites > 16e3) {
    alerts.push({ level: "critical", message: `Firestore \uC4F0\uAE30 ~${estimatedDailyWrites.toLocaleString()}\uD68C (\uD55C\uB3C4 80% \uCD08\uACFC)`, action: "Firebase Blaze \uD50C\uB79C \uD655\uC778. \uCD08\uACFC\uBD84\uC740 \uC790\uB3D9 \uACFC\uAE08\uB429\uB2C8\uB2E4." });
  } else if (estimatedDailyWrites > 12e3) {
    alerts.push({ level: "warning", message: `Firestore \uC4F0\uAE30 ~${estimatedDailyWrites.toLocaleString()}\uD68C (\uD55C\uB3C4 60% \uCD08\uACFC)`, action: "Firebase \uCF58\uC194 \u2192 \uC0AC\uC6A9\uB7C9 \uD0ED\uC5D0\uC11C \uC2E4\uC81C \uC4F0\uAE30 \uC218 \uD655\uC778." });
  }
  if (totalPosts > 9e3) {
    alerts.push({ level: "critical", message: `\uAC8C\uC2DC\uAE00 ${totalPosts}\uAC1C (Algolia \uD55C\uB3C4 90% \uCD08\uACFC)`, action: "Algolia \u2192 Firestore \uAC80\uC0C9 \uAD50\uCCB4 \uC989\uC2DC \uD544\uC694. \uAC1C\uBC1C\uC790\uC5D0\uAC8C \uBB38\uC758\uD558\uC138\uC694." });
  } else if (totalPosts > 7e3) {
    alerts.push({ level: "warning", message: `\uAC8C\uC2DC\uAE00 ${totalPosts}\uAC1C (Algolia \uD55C\uB3C4 70% \uCD08\uACFC)`, action: "Algolia \uB300\uC2DC\uBCF4\uB4DC \uD655\uC778 \uBC0F \uAD50\uCCB4 \uC2DC\uC810 \uC900\uBE44." });
  }
  if (todayQuizzes > 300) {
    alerts.push({ level: "warning", message: `\uC624\uB298 \uD034\uC988 ${todayQuizzes}\uAC1C (Gemini \uC0AC\uC6A9\uB7C9 \uB192\uC74C)`, action: "Google AI Studio\uC5D0\uC11C \uD560\uB2F9\uB7C9 \uD604\uD669 \uD655\uC778." });
  }
  if (estimatedDailyKvReads > 8e4) {
    alerts.push({ level: "critical", message: `KV \uC77D\uAE30 ~${estimatedDailyKvReads.toLocaleString()}\uD68C (\uD55C\uB3C4 80% \uCD08\uACFC)`, action: "Cloudflare Workers Paid \uD50C\uB79C($5/\uC6D4)\uC73C\uB85C \uC5C5\uADF8\uB808\uC774\uB4DC \uD544\uC694." });
  } else if (estimatedDailyKvReads > 6e4) {
    alerts.push({ level: "warning", message: `KV \uC77D\uAE30 ~${estimatedDailyKvReads.toLocaleString()}\uD68C (\uD55C\uB3C4 60% \uCD08\uACFC)`, action: "Cloudflare Workers Paid \uD50C\uB79C \uC5C5\uADF8\uB808\uC774\uB4DC \uC900\uBE44." });
  }
  if (firebaseMonthlyKRW > 15e4) {
    alerts.push({ level: "critical", message: `Firebase \uC6D4 \uBE44\uC6A9 \u20A9${firebaseMonthlyKRW.toLocaleString()} (3\uB2E8\uACC4 \uCD08\uACFC)`, action: "\uC790\uCCB4 \uC11C\uBC84 \uC774\uC804\uC744 \uC9C0\uAE08 \uBC14\uB85C \uC2DC\uC791\uD574\uC57C \uD569\uB2C8\uB2E4. \uAC1C\uBC1C\uC790\uC5D0\uAC8C \uBB38\uC758\uD558\uC138\uC694." });
  } else if (firebaseMonthlyKRW > 1e5) {
    alerts.push({ level: "warning", message: `Firebase \uC6D4 \uBE44\uC6A9 \u20A9${firebaseMonthlyKRW.toLocaleString()} (2\uB2E8\uACC4 \uC9C4\uC785)`, action: "\uC790\uCCB4 \uC11C\uBC84 \uC774\uC804 \uACC4\uD68D\uC744 \uC138\uC6B0\uC138\uC694. \uC774\uC804\uC5D0 2-3\uAC1C\uC6D4\uC774 \uC18C\uC694\uB429\uB2C8\uB2E4." });
  }
  const stage = getRoadmapStage(data);
  const hasCritical = alerts.some((a) => a.level === "critical");
  const hasWarning = alerts.some((a) => a.level === "warning");
  if (!hasCritical && !hasWarning) {
    return json2({ sent: false, reason: "\uC815\uC0C1 \uBC94\uC704 \u2014 \uC774\uBA54\uC77C \uBC1C\uC1A1 \uC5C6\uC74C", data });
  }
  if (!env.RESEND_API_KEY) {
    return json2({ error: "RESEND_API_KEY \uD658\uACBD\uBCC0\uC218 \uC5C6\uC74C", alerts }, 500);
  }
  const subjectEmoji = hasCritical ? "\u{1F6A8}" : "\u26A0\uFE0F";
  const subjectLevel = hasCritical ? "\uC704\uD5D8" : "\uC8FC\uC758";
  const subject = `${subjectEmoji} GWATOP \uC11C\uBE44\uC2A4 ${subjectLevel} \u2014 ${alerts.length}\uAC1C \uD56D\uBAA9 \uD655\uC778 \uD544\uC694`;
  const html = buildEmailHtml(alerts, data, stage);
  try {
    const result = await sendEmail(env.RESEND_API_KEY, subject, html);
    if (kv) await kv.put(KV_LAST_ALERT_KEY, JSON.stringify({ ts: Date.now(), alertCount: alerts.length }), { expirationTtl: 86400 });
    return json2({ sent: true, emailId: result.id, alertCount: alerts.length, stage, data });
  } catch (e) {
    return json2({ error: e.message, alerts }, 500);
  }
}
__name(onRequestGet2, "onRequestGet2");
__name2(onRequestGet2, "onRequestGet");
function json2(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS2 });
}
__name(json2, "json2");
__name2(json2, "json");
var PROJECT_ID3 = "gwatop-8edaf";
var FIRESTORE_BASE2 = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID3}/databases/(default)/documents`;
var DOC_BASE = `projects/${PROJECT_ID3}/databases/(default)/documents`;
var _cachedToken2 = null;
var _tokenExpiry2 = 0;
var _publicKeys = null;
var _publicKeysExpiry = 0;
async function getFirebasePublicKeys() {
  const now = Date.now();
  if (_publicKeys && _publicKeysExpiry > now) return _publicKeys;
  const res = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
  if (!res.ok) throw new Error("\uACF5\uAC1C\uD0A4 \uC870\uD68C \uC2E4\uD328");
  const data = await res.json();
  const maxAgeMatch = (res.headers.get("Cache-Control") || "").match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1]) * 1e3 : 36e5;
  _publicKeys = data.keys;
  _publicKeysExpiry = now + Math.min(maxAge, 36e5);
  return _publicKeys;
}
__name(getFirebasePublicKeys, "getFirebasePublicKeys");
__name2(getFirebasePublicKeys, "getFirebasePublicKeys");
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
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;
    const decode = /* @__PURE__ */ __name2((b64) => JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))
    )), "decode");
    const header = decode(parts[0]);
    const payload = decode(parts[1]);
    const now = Math.floor(Date.now() / 1e3);
    if (payload.exp < now) return null;
    if (payload.aud !== PROJECT_ID3) return null;
    if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID3}`) return null;
    if (!payload.sub) return null;
    const keys = await getFirebasePublicKeys();
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const cryptoKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const sig = Uint8Array.from(atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, sig, new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!valid) return null;
    return { localId: payload.sub, email: payload.email, displayName: payload.name };
  } catch {
    return null;
  }
}
__name(verifyFirebaseToken2, "verifyFirebaseToken2");
__name2(verifyFirebaseToken2, "verifyFirebaseToken");
async function getFirebaseAccessToken3(clientEmail, privateKey, kv) {
  const now = Math.floor(Date.now() / 1e3);
  if (kv) {
    const cached = await kv.get("firebase_admin_token", "json");
    if (cached && cached.expiry - now > 300) return cached.token;
  } else if (_cachedToken2 && _tokenExpiry2 - now > 300) return _cachedToken2;
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
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("\uD1A0\uD070 \uBC1C\uAE09 \uC2E4\uD328");
  _cachedToken2 = tokenData.access_token;
  _tokenExpiry2 = now + 3600;
  if (kv) {
    await kv.put("firebase_admin_token", JSON.stringify({ token: tokenData.access_token, expiry: now + 3600 }), { expirationTtl: 3500 });
  }
  return _cachedToken2;
}
__name(getFirebaseAccessToken3, "getFirebaseAccessToken3");
__name2(getFirebaseAccessToken3, "getFirebaseAccessToken");
async function onRequestPost2(context) {
  const { request, env } = context;
  const idToken = (request.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (!idToken) return json3({ error: "\uC778\uC99D \uD544\uC694" }, 401);
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return json3({ error: "\uC11C\uBC84 \uD658\uACBD \uBCC0\uC218 \uC5C6\uC74C" }, 500);
  let user, accessToken;
  try {
    [user, accessToken] = await Promise.all([
      verifyFirebaseToken2(idToken),
      getFirebaseAccessToken3(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY, env.GWATOP_CACHE)
    ]);
  } catch {
    return json3({ error: "\uC11C\uBC84 \uC778\uC99D \uC2E4\uD328" }, 500);
  }
  if (!user) return json3({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uD1A0\uD070" }, 401);
  const uid = user.localId;
  const today = new Intl.DateTimeFormat("sv", { timeZone: "Asia/Seoul" }).format(/* @__PURE__ */ new Date());
  const userRes = await fetch(`${FIRESTORE_BASE2}/users/${uid}`, {
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  if (!userRes.ok) return json3({ error: "\uC720\uC800 \uC815\uBCF4 \uC5C6\uC74C" }, 404);
  const userDoc = await userRes.json();
  if (userDoc.fields?.lastAttendance?.stringValue === today) {
    return json3({ alreadyChecked: true });
  }
  const updateTime = userDoc.updateTime;
  const commitRes = await fetch(`${FIRESTORE_BASE2}:commit`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      writes: [
        {
          update: {
            name: `${DOC_BASE}/users/${uid}`,
            fields: { lastAttendance: { stringValue: today } }
          },
          updateMask: { fieldPaths: ["lastAttendance"] },
          currentDocument: { updateTime }
        },
        {
          transform: {
            document: `${DOC_BASE}/users/${uid}`,
            fieldTransforms: [{ fieldPath: "freePoints", increment: { integerValue: "3" } }]
          }
        }
      ]
    })
  });
  if (!commitRes.ok) {
    const err = await commitRes.json();
    if (err.error?.status === "FAILED_PRECONDITION") {
      const recheck = await fetch(`${FIRESTORE_BASE2}/users/${uid}`, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      const recheckDoc = await recheck.json();
      if (recheckDoc.fields?.lastAttendance?.stringValue === today) return json3({ alreadyChecked: true });
    }
    return json3({ error: "\uCD9C\uC11D \uCC98\uB9AC \uC2E4\uD328" }, 500);
  }
  return json3({ success: true });
}
__name(onRequestPost2, "onRequestPost2");
__name2(onRequestPost2, "onRequestPost");
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
async function onRequestOptions4() {
  return new Response(null, { status: 204, headers: CORS4 });
}
__name(onRequestOptions4, "onRequestOptions4");
__name2(onRequestOptions4, "onRequestOptions");
async function onRequestPost3(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json4({ error: "\uC694\uCCAD \uD30C\uC2F1 \uC2E4\uD328" }, 400);
  }
  const { provider, code, redirectUri } = body;
  const clientEmail = env.FIREBASE_CLIENT_EMAIL;
  const privateKey = env.FIREBASE_PRIVATE_KEY;
  if (!clientEmail || !privateKey) {
    return json4({ error: "Firebase \uC11C\uBE44\uC2A4 \uACC4\uC815 \uD658\uACBD \uBCC0\uC218\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }, 500);
  }
  let uid, displayName = "", email = "", photoURL = "", phone = "";
  if (provider === "kakao") {
    if (!code) return json4({ error: "code\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." }, 400);
    const kakaoKey = env.KAKAO_REST_API_KEY;
    if (!kakaoKey) return json4({ error: "\uCE74\uCE74\uC624 \uD658\uACBD \uBCC0\uC218\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }, 500);
    const kakaoSecret = env.KAKAO_CLIENT_SECRET || "";
    const tokenBody = `grant_type=authorization_code&client_id=${kakaoKey}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}${kakaoSecret ? `&client_secret=${kakaoSecret}` : ""}`;
    const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return json4({ error: `\uCE74\uCE74\uC624 \uD1A0\uD070 \uBC1C\uAE09 \uC2E4\uD328: ${tokenData.error_description || ""}` }, 401);
    }
    const kakaoRes = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    if (!kakaoRes.ok) return json4({ error: "\uCE74\uCE74\uC624 \uC778\uC99D \uC2E4\uD328" }, 401);
    const kakaoUser = await kakaoRes.json();
    uid = `kakao:${kakaoUser.id}`;
    email = kakaoUser.kakao_account?.email || "";
    displayName = kakaoUser.kakao_account?.profile?.nickname || "";
    photoURL = kakaoUser.kakao_account?.profile?.profile_image_url || "";
    const kakaoPhone = kakaoUser.kakao_account?.phone_number || "";
    phone = normalizePhone(kakaoPhone);
  } else if (provider === "naver") {
    if (!code) return json4({ error: "code\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." }, 400);
    const clientId = env.NAVER_CLIENT_ID;
    const clientSecret = env.NAVER_CLIENT_SECRET;
    if (!clientId || !clientSecret) return json4({ error: "\uB124\uC774\uBC84 \uD658\uACBD \uBCC0\uC218\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }, 500);
    const tokenUrl = `https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id=${clientId}&client_secret=${clientSecret}&code=${encodeURIComponent(code)}&state=gwatop`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return json4({ error: `\uB124\uC774\uBC84 \uD1A0\uD070 \uBC1C\uAE09 \uC2E4\uD328: ${tokenData.error_description || ""}` }, 401);
    }
    const naverRes = await fetch("https://openapi.naver.com/v1/nid/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const naverData = await naverRes.json();
    if (naverData.resultcode !== "00") return json4({ error: "\uB124\uC774\uBC84 \uC0AC\uC6A9\uC790 \uC815\uBCF4 \uC870\uD68C \uC2E4\uD328" }, 401);
    const naverUser = naverData.response;
    uid = `naver:${naverUser.id}`;
    email = naverUser.email || "";
    displayName = naverUser.name || naverUser.nickname || "";
    photoURL = naverUser.profile_image || "";
    phone = normalizePhone(naverUser.mobile || "");
  } else {
    return json4({ error: "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uC18C\uC15C \uB85C\uADF8\uC778\uC785\uB2C8\uB2E4." }, 400);
  }
  try {
    const customToken = await createFirebaseCustomToken(uid, clientEmail, privateKey);
    return json4({ customToken, displayName, email, photoURL, phone });
  } catch (e) {
    return json4({ error: `\uCEE4\uC2A4\uD140 \uD1A0\uD070 \uC0DD\uC131 \uC2E4\uD328: ${e.message}` }, 500);
  }
}
__name(onRequestPost3, "onRequestPost3");
__name2(onRequestPost3, "onRequestPost");
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
function json4(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS4 });
}
__name(json4, "json4");
__name2(json4, "json");
var FIREBASE_WEB_API_KEY2 = "AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ";
var PROJECT_ID4 = "gwatop-8edaf";
var BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID4}/databases/(default)/documents`;
var DOC_BASE2 = `projects/${PROJECT_ID4}/databases/(default)/documents`;
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
async function onRequestPost4(context) {
  const { request, env } = context;
  const idToken = (request.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (!idToken) return json5({ error: "\uC778\uC99D \uD544\uC694" }, 401);
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return json5({ error: "\uC11C\uBC84 \uD658\uACBD \uBCC0\uC218 \uC5C6\uC74C" }, 500);
  let body;
  try {
    body = await request.json();
  } catch {
    return json5({ error: "parse error" }, 400);
  }
  const { messageId, messageType } = body;
  if (!messageId || !messageType) return json5({ error: "\uD30C\uB77C\uBBF8\uD130 \uB204\uB77D" }, 400);
  if (!["inbox", "global"].includes(messageType)) return json5({ error: "\uC798\uBABB\uB41C messageType" }, 400);
  const [user, accessToken] = await Promise.all([
    verifyFirebaseToken3(idToken),
    getFirebaseAccessToken4(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY)
  ]).catch(() => [null, null]);
  if (!user) return json5({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uD1A0\uD070" }, 401);
  const uid = user.localId;
  const msgPath = messageType === "global" ? `${BASE}/global_messages/${messageId}` : `${BASE}/users/${uid}/inbox/${messageId}`;
  const msgRes = await fetch(msgPath, { headers: { "Authorization": `Bearer ${accessToken}` } });
  if (!msgRes.ok) return json5({ error: "\uBA54\uC2DC\uC9C0\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" }, 404);
  const msgDoc = await msgRes.json();
  const f = msgDoc.fields || {};
  if (f.rewardType?.stringValue !== "freePoints") return json5({ error: "\uBCF4\uC0C1\uC774 \uC5C6\uB294 \uBA54\uC2DC\uC9C0\uC785\uB2C8\uB2E4" }, 400);
  const rewardAmount = parseInt(f.rewardAmount?.integerValue || 0);
  if (!rewardAmount) return json5({ error: "\uBCF4\uC0C1 \uAE08\uC561\uC774 \uC5C6\uC2B5\uB2C8\uB2E4" }, 400);
  const msgUpdateTime = msgDoc.updateTime;
  if (messageType === "global") {
    const claimedRes = await fetch(`${BASE}/users/${uid}/claimed/${messageId}`, {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
    if (claimedRes.ok) return json5({ error: "\uC774\uBBF8 \uC218\uB839\uD55C \uBCF4\uC0C1\uC785\uB2C8\uB2E4" }, 409);
  } else {
    if (f.claimed?.booleanValue) return json5({ error: "\uC774\uBBF8 \uC218\uB839\uD55C \uBCF4\uC0C1\uC785\uB2C8\uB2E4" }, 409);
  }
  const userRes = await fetch(`${BASE}/users/${uid}`, { headers: { "Authorization": `Bearer ${accessToken}` } });
  if (!userRes.ok) return json5({ error: "\uC720\uC800 \uC815\uBCF4 \uC5C6\uC74C" }, 404);
  const userDoc = await userRes.json();
  const currentFP = parseInt(userDoc.fields?.freePoints?.integerValue || 0);
  const newFP = currentFP + rewardAmount;
  const writes = [
    {
      update: { name: `${DOC_BASE2}/users/${uid}`, fields: { freePoints: { integerValue: String(newFP) } } },
      updateMask: { fieldPaths: ["freePoints"] }
    }
  ];
  if (messageType === "global") {
    writes.push({
      update: {
        name: `${DOC_BASE2}/users/${uid}/claimed/${messageId}`,
        fields: { claimedAt: { timestampValue: (/* @__PURE__ */ new Date()).toISOString() } }
      },
      currentDocument: { exists: false }
      // precondition: reject if already claimed
    });
  } else {
    writes.push({
      update: { name: `${DOC_BASE2}/users/${uid}/inbox/${messageId}`, fields: { claimed: { booleanValue: true } } },
      updateMask: { fieldPaths: ["claimed"] },
      currentDocument: { updateTime: msgUpdateTime }
      // precondition: reject if doc changed since read
    });
  }
  const batchRes = await fetch(`${BASE}:batchWrite`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ writes })
  });
  if (!batchRes.ok) {
    const status = batchRes.status;
    if (status === 400 || status === 409) return json5({ error: "\uC774\uBBF8 \uC218\uB839\uD55C \uBCF4\uC0C1\uC785\uB2C8\uB2E4" }, 409);
    return json5({ error: "\uCC98\uB9AC \uC2E4\uD328" }, 500);
  }
  return json5({ success: true, rewardAmount, newFreePoints: newFP });
}
__name(onRequestPost4, "onRequestPost4");
__name2(onRequestPost4, "onRequestPost");
async function verifyFirebaseToken3(idToken) {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY2}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
    );
    if (!res.ok) return null;
    return (await res.json()).users?.[0] || null;
  } catch {
    return null;
  }
}
__name(verifyFirebaseToken3, "verifyFirebaseToken3");
__name2(verifyFirebaseToken3, "verifyFirebaseToken");
async function getFirebaseAccessToken4(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1e3);
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
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("\uD1A0\uD070 \uBC1C\uAE09 \uC2E4\uD328");
  return tokenData.access_token;
}
__name(getFirebaseAccessToken4, "getFirebaseAccessToken4");
__name2(getFirebaseAccessToken4, "getFirebaseAccessToken");
function json5(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS5 });
}
__name(json5, "json5");
__name2(json5, "json");
var PROJECT_ID5 = "gwatop-8edaf";
var FIRESTORE_BASE3 = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID5}/databases/(default)/documents`;
var DOC_BASE3 = `projects/${PROJECT_ID5}/databases/(default)/documents`;
var _cachedToken3 = null;
var _tokenExpiry3 = 0;
var CORS6 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};
async function onRequestOptions6() {
  return new Response(null, { status: 204, headers: CORS6 });
}
__name(onRequestOptions6, "onRequestOptions6");
__name2(onRequestOptions6, "onRequestOptions");
async function getFirebaseAccessToken5(clientEmail, privateKey) {
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
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("\uD1A0\uD070 \uBC1C\uAE09 \uC2E4\uD328");
  _cachedToken3 = tokenData.access_token;
  _tokenExpiry3 = now + 3600;
  return _cachedToken3;
}
__name(getFirebaseAccessToken5, "getFirebaseAccessToken5");
__name2(getFirebaseAccessToken5, "getFirebaseAccessToken");
async function onRequestGet3(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (!env.CLEANUP_SECRET || secret !== env.CLEANUP_SECRET) {
    return new Response(JSON.stringify({ error: "\uC778\uC99D \uC2E4\uD328" }), { status: 401, headers: CORS6 });
  }
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return new Response(JSON.stringify({ error: "\uC11C\uBC84 \uD658\uACBD \uBCC0\uC218 \uC5C6\uC74C" }), { status: 500, headers: CORS6 });
  }
  let accessToken;
  try {
    accessToken = await getFirebaseAccessToken5(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
  } catch {
    return new Response(JSON.stringify({ error: "\uC11C\uBC84 \uC778\uC99D \uC2E4\uD328" }), { status: 500, headers: CORS6 });
  }
  const cutoff = new Date(Date.now() - 15 * 60 * 1e3).toISOString();
  const queryRes = await fetch(`${FIRESTORE_BASE3}:runQuery`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "games" }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "waiting" } } },
              { fieldFilter: { field: { fieldPath: "createdAt" }, op: "LESS_THAN", value: { stringValue: cutoff } } }
            ]
          }
        },
        limit: 100
      }
    })
  });
  if (!queryRes.ok) {
    return new Response(JSON.stringify({ error: "\uC870\uD68C \uC2E4\uD328" }), { status: 500, headers: CORS6 });
  }
  const queryDocs2 = await queryRes.json();
  const expiredGames = queryDocs2.filter((d) => d.document?.name);
  if (expiredGames.length === 0) {
    return new Response(JSON.stringify({ cleaned: 0 }), { status: 200, headers: CORS6 });
  }
  let cleaned = 0;
  const refundWrites = [];
  for (const d of expiredGames) {
    const doc = d.document;
    const docName = doc.name;
    const wager = parseInt(doc.fields?.wager?.integerValue || "0");
    const player1Uid = doc.fields?.player1?.mapValue?.fields?.uid?.stringValue;
    refundWrites.push({
      update: {
        name: docName,
        fields: { status: { stringValue: "cancelled" } }
      },
      updateMask: { fieldPaths: ["status"] }
    });
    if (player1Uid && wager > 0) {
      refundWrites.push({
        transform: {
          document: `${DOC_BASE3}/users/${player1Uid}`,
          fieldTransforms: [{ fieldPath: "freePoints", increment: { integerValue: String(wager) } }]
        }
      });
    }
    cleaned++;
  }
  const BATCH = 20;
  for (let i = 0; i < refundWrites.length; i += BATCH) {
    const batch = refundWrites.slice(i, i + BATCH);
    await fetch(`${FIRESTORE_BASE3}:commit`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ writes: batch })
    });
  }
  return new Response(JSON.stringify({ cleaned }), { status: 200, headers: CORS6 });
}
__name(onRequestGet3, "onRequestGet3");
__name2(onRequestGet3, "onRequestGet");
var PROJECT_ID6 = "gwatop-8edaf";
var FIREBASE_WEB_API_KEY3 = "AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ";
var FIRESTORE_BASE4 = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID6}/databases/(default)/documents`;
var DOC_BASE4 = `projects/${PROJECT_ID6}/databases/(default)/documents`;
var MAX_COMMENTS = 300;
var _cachedToken4 = null;
var _tokenExpiry4 = 0;
var CORS7 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json"
};
async function onRequestOptions7() {
  return new Response(null, { status: 204, headers: CORS7 });
}
__name(onRequestOptions7, "onRequestOptions7");
__name2(onRequestOptions7, "onRequestOptions");
async function verifyFirebaseToken4(idToken) {
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
__name(verifyFirebaseToken4, "verifyFirebaseToken4");
__name2(verifyFirebaseToken4, "verifyFirebaseToken");
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
async function getDocument(path, accessToken) {
  const res = await fetch(`${FIRESTORE_BASE4}/${path}`, { headers: { "Authorization": `Bearer ${accessToken}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`\uBB38\uC11C \uC77D\uAE30 \uC2E4\uD328 (${res.status})`);
  return res.json();
}
__name(getDocument, "getDocument");
__name2(getDocument, "getDocument");
async function commitWrites(writes, accessToken) {
  const res = await fetch(`${FIRESTORE_BASE4}:commit`, {
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
    for (const [k, v2] of Object.entries(existingMap)) anonMap[k] = parseInt(v2.integerValue || v2.stringValue || 0);
    if (anonMap[uid] !== void 0) {
      anonNumber = anonMap[uid];
    } else {
      const counter = parseInt(postDoc.fields?.anonymousCounter?.integerValue || "0");
      anonNumber = counter + 1;
      anonMap[uid] = anonNumber;
      writes.push({
        update: {
          name: `${DOC_BASE4}/community_posts/${postId}`,
          fields: {
            anonymousMap: { mapValue: { fields: Object.fromEntries(Object.entries(anonMap).map(([k, v2]) => [k, { integerValue: String(v2) }])) } },
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
      name: `${DOC_BASE4}/community_posts/${postId}/comments/${commentId}`,
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
      document: `${DOC_BASE4}/community_posts/${postId}`,
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
        name: `${DOC_BASE4}/community_posts/${postId}/comments/${commentId}`,
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
        document: `${DOC_BASE4}/community_posts/${postId}`,
        fieldTransforms: [{ fieldPath: "commentCount", increment: { integerValue: "-1" } }]
      }
    }
  ], accessToken);
}
__name(deleteComment, "deleteComment");
__name2(deleteComment, "deleteComment");
async function onRequestPost5(context) {
  const { request, env } = context;
  const authHeader = request.headers.get("Authorization") || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) return json6({ error: "\uC778\uC99D \uD544\uC694" }, 401);
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return json6({ error: "Firebase \uC11C\uBE44\uC2A4 \uACC4\uC815 \uD658\uACBD \uBCC0\uC218 \uC5C6\uC74C" }, 500);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json6({ error: "\uC694\uCCAD \uD30C\uC2F1 \uC2E4\uD328" }, 400);
  }
  const { action, postId } = body;
  if (!action || !postId) return json6({ error: "\uD544\uC218 \uD30C\uB77C\uBBF8\uD130 \uB204\uB77D" }, 400);
  let user, accessToken;
  try {
    [user, accessToken] = await Promise.all([
      verifyFirebaseToken4(idToken),
      getFirebaseAccessToken6(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY)
    ]);
  } catch {
    return json6({ error: "\uC11C\uBC84 \uC778\uC99D \uC2E4\uD328" }, 500);
  }
  if (!user) return json6({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uD1A0\uD070" }, 401);
  const uid = user.localId;
  try {
    if (action === "add") {
      const { content, isAnonymous, parentId, nickname, university } = body;
      if (!content?.trim()) return json6({ error: "\uB0B4\uC6A9\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694." }, 400);
      if (content.length > 500) return json6({ error: "\uB313\uAE00\uC740 500\uC790 \uC774\uD558\uB85C \uC791\uC131\uD574\uC8FC\uC138\uC694." }, 400);
      const result = await addComment({ postId, uid, content: content.trim(), isAnonymous: !!isAnonymous, parentId: parentId || null, nickname: nickname || "", university: university || "", accessToken });
      return json6({ success: true, ...result });
    }
    if (action === "delete") {
      const { commentId } = body;
      if (!commentId) return json6({ error: "commentId \uB204\uB77D" }, 400);
      await deleteComment({ postId, commentId, uid, accessToken });
      return json6({ success: true });
    }
    return json6({ error: "\uC54C \uC218 \uC5C6\uB294 action" }, 400);
  } catch (e) {
    const status = e.message?.includes("\uAD8C\uD55C") ? 403 : e.message?.includes("\uCC3E\uC744 \uC218 \uC5C6") ? 404 : 400;
    return json6({ error: e.message || "\uCC98\uB9AC \uC911 \uC624\uB958 \uBC1C\uC0DD" }, status);
  }
}
__name(onRequestPost5, "onRequestPost5");
__name2(onRequestPost5, "onRequestPost");
function json6(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS7 });
}
__name(json6, "json6");
__name2(json6, "json");
var CORS8 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};
var PROJECT_ID7 = "gwatop-8edaf";
function creditsFromAmount(amount) {
  if (amount === 1900) return 100;
  if (amount === 3900) return 300;
  if (amount === 9900) return 1e3;
  return 0;
}
__name(creditsFromAmount, "creditsFromAmount");
__name2(creditsFromAmount, "creditsFromAmount");
async function onRequestOptions8() {
  return new Response(null, { status: 204, headers: CORS8 });
}
__name(onRequestOptions8, "onRequestOptions8");
__name2(onRequestOptions8, "onRequestOptions");
async function onRequestPost6(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json7({ error: "\uC694\uCCAD \uD30C\uC2F1 \uC2E4\uD328" }, 400);
  }
  const { paymentKey, orderId, amount, uid } = body;
  if (!paymentKey || !orderId || !amount || !uid) {
    return json7({ error: "\uD544\uC218 \uD30C\uB77C\uBBF8\uD130 \uB204\uB77D" }, 400);
  }
  const tossSecret = env.TOSS_SECRET_KEY;
  if (!tossSecret) return json7({ error: "TOSS_SECRET_KEY \uD658\uACBD \uBCC0\uC218\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }, 500);
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
    return json7({ error: `\uACB0\uC81C \uD655\uC778 \uC2E4\uD328: ${err.message || tossRes.status}` }, 400);
  }
  const tossData = await tossRes.json();
  if (tossData.status !== "DONE") {
    return json7({ error: `\uACB0\uC81C \uC0C1\uD0DC \uC624\uB958: ${tossData.status}` }, 400);
  }
  const credits = creditsFromAmount(amount);
  if (credits === 0) {
    return json7({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uACB0\uC81C \uAE08\uC561\uC785\uB2C8\uB2E4." }, 400);
  }
  try {
    const clientEmail = env.FIREBASE_CLIENT_EMAIL;
    const privateKey = env.FIREBASE_PRIVATE_KEY;
    if (!clientEmail || !privateKey) {
      return json7({ error: "Firebase \uC11C\uBE44\uC2A4 \uACC4\uC815 \uD658\uACBD \uBCC0\uC218\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }, 500);
    }
    const accessToken = await getFirebaseAccessToken7(clientEmail, privateKey);
    const alreadyProcessed = await checkAndRecordPayment(orderId, uid, credits, amount, accessToken);
    if (alreadyProcessed) {
      return json7({ error: "\uC774\uBBF8 \uCC98\uB9AC\uB41C \uACB0\uC81C\uC785\uB2C8\uB2E4." }, 409);
    }
    await addCreditsToFirestore(uid, credits, accessToken);
  } catch (e) {
    console.error("Firestore update error:", e);
    return json7({ error: "\uD06C\uB808\uB527 \uCD94\uAC00 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4." }, 500);
  }
  return json7({ success: true, credits, orderId });
}
__name(onRequestPost6, "onRequestPost6");
__name2(onRequestPost6, "onRequestPost");
async function getFirebaseAccessToken7(clientEmail, privateKey) {
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
__name(getFirebaseAccessToken7, "getFirebaseAccessToken7");
__name2(getFirebaseAccessToken7, "getFirebaseAccessToken");
async function checkAndRecordPayment(orderId, uid, credits, amount, accessToken) {
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID7}/databases/(default)/documents/payments/${orderId}`;
  const getRes = await fetch(baseUrl, {
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  if (getRes.ok) return true;
  await fetch(baseUrl, {
    method: "PATCH",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        orderId: { stringValue: orderId },
        uid: { stringValue: uid },
        credits: { integerValue: String(credits) },
        amount: { integerValue: String(amount) },
        processedAt: { integerValue: String(Date.now()) }
      }
    })
  });
  return false;
}
__name(checkAndRecordPayment, "checkAndRecordPayment");
__name2(checkAndRecordPayment, "checkAndRecordPayment");
async function addCreditsToFirestore(uid, credits, accessToken) {
  const commitUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID7}/databases/(default)/documents:commit`;
  const docPath = `projects/${PROJECT_ID7}/databases/(default)/documents/users/${uid}`;
  const commitRes = await fetch(commitUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      writes: [{
        transform: {
          document: docPath,
          fieldTransforms: [{
            fieldPath: "credits",
            increment: { integerValue: String(credits) }
          }]
        }
      }]
    })
  });
  if (!commitRes.ok) {
    const err = await commitRes.text();
    throw new Error(`Firestore \uC5C5\uB370\uC774\uD2B8 \uC2E4\uD328: ${err}`);
  }
}
__name(addCreditsToFirestore, "addCreditsToFirestore");
__name2(addCreditsToFirestore, "addCreditsToFirestore");
function json7(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS8 });
}
__name(json7, "json7");
__name2(json7, "json");
var PROJECT_ID8 = "gwatop-8edaf";
var FIREBASE_WEB_API_KEY4 = "AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ";
var FIRESTORE_BASE5 = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID8}/databases/(default)/documents`;
var DOC_BASE5 = `projects/${PROJECT_ID8}/databases/(default)/documents`;
var _cachedToken5 = null;
var _tokenExpiry5 = 0;
var CORS9 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json"
};
async function onRequestOptions9() {
  return new Response(null, { status: 204, headers: CORS9 });
}
__name(onRequestOptions9, "onRequestOptions9");
__name2(onRequestOptions9, "onRequestOptions");
async function verifyFirebaseToken5(idToken) {
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
__name(verifyFirebaseToken5, "verifyFirebaseToken5");
__name2(verifyFirebaseToken5, "verifyFirebaseToken");
async function getFirebaseAccessToken8(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1e3);
  if (_cachedToken5 && _tokenExpiry5 - now > 300) return _cachedToken5;
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
  _cachedToken5 = tokenData.access_token;
  _tokenExpiry5 = now + 3600;
  return _cachedToken5;
}
__name(getFirebaseAccessToken8, "getFirebaseAccessToken8");
__name2(getFirebaseAccessToken8, "getFirebaseAccessToken");
async function queryDocs(collectionPath, uid, accessToken, { allDescendants = false } = {}) {
  const url = `${FIRESTORE_BASE5}:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: collectionPath, allDescendants }],
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
  const url = `${FIRESTORE_BASE5}/${parentPath}/${subCollection}?pageSize=300`;
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
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID8}/accounts/${uid}`,
    { method: "DELETE", headers: { "Authorization": `Bearer ${accessToken}` } }
  );
  return res.ok;
}
__name(deleteAuthUser, "deleteAuthUser");
__name2(deleteAuthUser, "deleteAuthUser");
async function onRequestPost7(context) {
  const { request, env } = context;
  const authHeader = request.headers.get("Authorization") || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) return json8({ error: "\uC778\uC99D \uD544\uC694" }, 401);
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return json8({ error: "Firebase \uC11C\uBE44\uC2A4 \uACC4\uC815 \uD658\uACBD \uBCC0\uC218 \uC5C6\uC74C" }, 500);
  }
  let user, accessToken;
  try {
    [user, accessToken] = await Promise.all([
      verifyFirebaseToken5(idToken),
      getFirebaseAccessToken8(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY)
    ]);
  } catch {
    return json8({ error: "\uC11C\uBC84 \uC778\uC99D \uC2E4\uD328" }, 500);
  }
  if (!user) return json8({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uD1A0\uD070" }, 401);
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
    const myComments = await queryDocs("comments", uid, accessToken, { allDescendants: true });
    for (const comment of myComments) {
      await deleteDocument(comment.name, accessToken);
    }
    const myLikes = await queryDocs("post_likes", uid, accessToken);
    for (const like of myLikes) {
      await deleteDocument(like.name, accessToken);
    }
    await deleteDocument(
      `projects/${PROJECT_ID8}/databases/(default)/documents/users/${uid}`,
      accessToken
    );
    await deleteAuthUser(uid, accessToken);
    return json8({ success: true });
  } catch (e) {
    console.error("delete-account error:", e);
    return json8({ error: e.message || "\uD0C8\uD1F4 \uCC98\uB9AC \uC2E4\uD328" }, 500);
  }
}
__name(onRequestPost7, "onRequestPost7");
__name2(onRequestPost7, "onRequestPost");
function json8(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS9 });
}
__name(json8, "json8");
__name2(json8, "json");
var PROJECT_ID9 = "gwatop-8edaf";
var FIRESTORE_BASE6 = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID9}/databases/(default)/documents`;
var DOC_BASE6 = `projects/${PROJECT_ID9}/databases/(default)/documents`;
var ALGOLIA_INDEX = "posts";
var VALID_CATEGORIES = ["\uC790\uC720", "\uC9C8\uBB38", "\uC815\uBCF4", "\uC720\uBA38", "\uAC70\uB798"];
var _cachedToken6 = null;
var _tokenExpiry6 = 0;
var _publicKeys2 = null;
var _publicKeysExpiry2 = 0;
async function getFirebasePublicKeys2() {
  const now = Date.now();
  if (_publicKeys2 && _publicKeysExpiry2 > now) return _publicKeys2;
  const res = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
  if (!res.ok) throw new Error("\uACF5\uAC1C\uD0A4 \uC870\uD68C \uC2E4\uD328");
  const data = await res.json();
  const maxAgeMatch = (res.headers.get("Cache-Control") || "").match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1]) * 1e3 : 36e5;
  _publicKeys2 = data.keys;
  _publicKeysExpiry2 = now + Math.min(maxAge, 36e5);
  return _publicKeys2;
}
__name(getFirebasePublicKeys2, "getFirebasePublicKeys2");
__name2(getFirebasePublicKeys2, "getFirebasePublicKeys");
var CORS10 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json"
};
async function onRequestOptions10() {
  return new Response(null, { status: 204, headers: CORS10 });
}
__name(onRequestOptions10, "onRequestOptions10");
__name2(onRequestOptions10, "onRequestOptions");
async function verifyFirebaseToken6(idToken) {
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;
    const decode = /* @__PURE__ */ __name2((b64) => JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))
    )), "decode");
    const header = decode(parts[0]);
    const payload = decode(parts[1]);
    const now = Math.floor(Date.now() / 1e3);
    if (payload.exp < now) return null;
    if (payload.aud !== PROJECT_ID9) return null;
    if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID9}`) return null;
    if (!payload.sub) return null;
    const keys = await getFirebasePublicKeys2();
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const cryptoKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const sig = Uint8Array.from(atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, sig, new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!valid) return null;
    return { localId: payload.sub, email: payload.email, displayName: payload.name };
  } catch {
    return null;
  }
}
__name(verifyFirebaseToken6, "verifyFirebaseToken6");
__name2(verifyFirebaseToken6, "verifyFirebaseToken");
async function getFirebaseAccessToken9(clientEmail, privateKey, kv) {
  const now = Math.floor(Date.now() / 1e3);
  if (kv) {
    const cached = await kv.get("firebase_admin_token", "json");
    if (cached && cached.expiry - now > 300) return cached.token;
  } else if (_cachedToken6 && _tokenExpiry6 - now > 300) return _cachedToken6;
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iss: clientEmail, sub: clientEmail, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600, scope: "https://www.googleapis.com/auth/datastore" };
  const encode = /* @__PURE__ */ __name2((obj) => btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""), "encode");
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const pem = privateKey.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\\n/g, "").replace(/\r/g, "").replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", keyData.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput));
  const sigEncoded = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const jwt = `${signingInput}.${sigEncoded}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("\uD1A0\uD070 \uBC1C\uAE09 \uC2E4\uD328");
  _cachedToken6 = tokenData.access_token;
  _tokenExpiry6 = now + 3600;
  if (kv) {
    await kv.put("firebase_admin_token", JSON.stringify({ token: tokenData.access_token, expiry: now + 3600 }), { expirationTtl: 3500 });
  }
  return _cachedToken6;
}
__name(getFirebaseAccessToken9, "getFirebaseAccessToken9");
__name2(getFirebaseAccessToken9, "getFirebaseAccessToken");
async function onRequestPost8(context) {
  const { request, env } = context;
  const idToken = (request.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (!idToken) return json9({ error: "\uC778\uC99D \uD544\uC694" }, 401);
  let body;
  try {
    body = await request.json();
  } catch {
    return json9({ error: "\uC694\uCCAD \uD30C\uC2F1 \uC2E4\uD328" }, 400);
  }
  const { postId, title, content, category } = body;
  if (!postId || !content?.trim()) return json9({ error: "\uD544\uC218 \uD30C\uB77C\uBBF8\uD130 \uB204\uB77D" }, 400);
  if (content.length > 1e3) return json9({ error: "\uBCF8\uBB38\uC740 1000\uC790 \uC774\uD558\uB85C \uC791\uC131\uD574\uC8FC\uC138\uC694." }, 400);
  if (category && !VALID_CATEGORIES.includes(category)) return json9({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uCE74\uD14C\uACE0\uB9AC" }, 400);
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return json9({ error: "\uC11C\uBC84 \uD658\uACBD \uBCC0\uC218 \uC5C6\uC74C" }, 500);
  let user, accessToken;
  try {
    [user, accessToken] = await Promise.all([
      verifyFirebaseToken6(idToken),
      getFirebaseAccessToken9(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY, env.GWATOP_CACHE)
    ]);
  } catch {
    return json9({ error: "\uC11C\uBC84 \uC778\uC99D \uC2E4\uD328" }, 500);
  }
  if (!user) return json9({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uD1A0\uD070" }, 401);
  const postRes = await fetch(`${FIRESTORE_BASE6}/community_posts/${postId}`, {
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  if (!postRes.ok) return json9({ error: "\uAC8C\uC2DC\uAE00 \uC5C6\uC74C" }, 404);
  const postDoc = await postRes.json();
  if (postDoc.fields?.uid?.stringValue !== user.localId) return json9({ error: "\uC218\uC815 \uAD8C\uD55C \uC5C6\uC74C" }, 403);
  const fields = {
    title: { stringValue: title?.trim() || "" },
    titleLower: { stringValue: (title?.trim() || "").toLowerCase() },
    content: { stringValue: content.trim() },
    editedAt: { timestampValue: (/* @__PURE__ */ new Date()).toISOString() }
  };
  if (category) fields.category = { stringValue: category };
  const fieldPaths = ["title", "titleLower", "content", "editedAt", ...category ? ["category"] : []];
  const commitRes = await fetch(`${FIRESTORE_BASE6}:commit`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      writes: [{
        update: { name: `${DOC_BASE6}/community_posts/${postId}`, fields },
        updateMask: { fieldPaths }
      }]
    })
  });
  if (!commitRes.ok) return json9({ error: "\uC218\uC815 \uC2E4\uD328" }, 500);
  if (env.ALGOLIA_APP_ID && env.ALGOLIA_ADMIN_KEY) {
    fetch(`https://${env.ALGOLIA_APP_ID}.algolia.net/1/indexes/${ALGOLIA_INDEX}/${postId}/partial`, {
      method: "POST",
      headers: {
        "X-Algolia-Application-Id": env.ALGOLIA_APP_ID,
        "X-Algolia-API-Key": env.ALGOLIA_ADMIN_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: title?.trim() || "",
        content: content.trim(),
        ...category ? { category } : {}
      })
    }).catch(() => {
    });
  }
  return json9({ success: true });
}
__name(onRequestPost8, "onRequestPost8");
__name2(onRequestPost8, "onRequestPost");
function json9(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS10 });
}
__name(json9, "json9");
__name2(json9, "json");
var PROJECT_ID10 = "gwatop-8edaf";
var FIRESTORE_BASE7 = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID10}/databases/(default)/documents`;
var DOC_BASE7 = `projects/${PROJECT_ID10}/databases/(default)/documents`;
var RTDB_BASE = `https://${PROJECT_ID10}-default-rtdb.asia-southeast1.firebasedatabase.app`;
var _cachedToken7 = null;
var _tokenExpiry7 = 0;
var _publicKeys3 = null;
var _publicKeysExpiry3 = 0;
async function getFirebasePublicKeys3() {
  const now = Date.now();
  if (_publicKeys3 && _publicKeysExpiry3 > now) return _publicKeys3;
  const res = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
  if (!res.ok) throw new Error("\uACF5\uAC1C\uD0A4 \uC870\uD68C \uC2E4\uD328");
  const data = await res.json();
  const maxAgeMatch = (res.headers.get("Cache-Control") || "").match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1]) * 1e3 : 36e5;
  _publicKeys3 = data.keys;
  _publicKeysExpiry3 = now + Math.min(maxAge, 36e5);
  return _publicKeys3;
}
__name(getFirebasePublicKeys3, "getFirebasePublicKeys3");
__name2(getFirebasePublicKeys3, "getFirebasePublicKeys");
var CORS11 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json"
};
async function onRequestOptions11() {
  return new Response(null, { status: 204, headers: CORS11 });
}
__name(onRequestOptions11, "onRequestOptions11");
__name2(onRequestOptions11, "onRequestOptions");
async function verifyFirebaseToken7(idToken) {
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;
    const decode = /* @__PURE__ */ __name2((b64) => JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))
    )), "decode");
    const header = decode(parts[0]);
    const payload = decode(parts[1]);
    const now = Math.floor(Date.now() / 1e3);
    if (payload.exp < now) return null;
    if (payload.aud !== PROJECT_ID10) return null;
    if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID10}`) return null;
    if (!payload.sub) return null;
    const keys = await getFirebasePublicKeys3();
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const cryptoKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const sig = Uint8Array.from(atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, sig, new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!valid) return null;
    return { localId: payload.sub, email: payload.email, displayName: payload.name };
  } catch {
    return null;
  }
}
__name(verifyFirebaseToken7, "verifyFirebaseToken7");
__name2(verifyFirebaseToken7, "verifyFirebaseToken");
async function getFirebaseAccessToken10(clientEmail, privateKey, kv) {
  const now = Math.floor(Date.now() / 1e3);
  if (kv) {
    const cached = await kv.get("firebase_admin_token_v3", "json");
    if (cached && cached.expiry - now > 300) return cached.token;
  } else if (_cachedToken7 && _tokenExpiry7 - now > 300) return _cachedToken7;
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iss: clientEmail, sub: clientEmail, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600, scope: "https://www.googleapis.com/auth/cloud-platform" };
  const encode = /* @__PURE__ */ __name2((obj) => btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""), "encode");
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const pem = privateKey.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\\n/g, "").replace(/\n/g, "").replace(/\r/g, "").replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", keyData.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput));
  const sigEncoded = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const jwt = `${signingInput}.${sigEncoded}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("\uD1A0\uD070 \uBC1C\uAE09 \uC2E4\uD328");
  _cachedToken7 = tokenData.access_token;
  _tokenExpiry7 = now + 3600;
  if (kv) {
    await kv.put("firebase_admin_token_v3", JSON.stringify({ token: tokenData.access_token, expiry: now + 3600 }), { expirationTtl: 3500 });
  }
  return _cachedToken7;
}
__name(getFirebaseAccessToken10, "getFirebaseAccessToken10");
__name2(getFirebaseAccessToken10, "getFirebaseAccessToken");
async function fsGet(path, accessToken) {
  const res = await fetch(`${FIRESTORE_BASE7}/${path}`, { headers: { "Authorization": `Bearer ${accessToken}` } });
  if (!res.ok) {
    if (res.status !== 404) {
      const errText = await res.text().catch(() => "");
      console.error(`fsGet ${path} failed: ${res.status}`, errText);
    }
    return null;
  }
  return res.json();
}
__name(fsGet, "fsGet");
__name2(fsGet, "fsGet");
async function fsPatch(path, fields, accessToken) {
  const res = await fetch(`${FIRESTORE_BASE7}/${path}?updateMask.fieldPaths=${Object.keys(fields).join("&updateMask.fieldPaths=")}`, {
    method: "PATCH",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields })
  });
  return res.ok;
}
__name(fsPatch, "fsPatch");
__name2(fsPatch, "fsPatch");
async function fsBeginTransaction(accessToken) {
  const res = await fetch(`${FIRESTORE_BASE7}:beginTransaction`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ options: { readWrite: {} } })
  });
  if (!res.ok) throw new Error("\uD2B8\uB79C\uC7AD\uC158 \uC2DC\uC791 \uC2E4\uD328");
  return (await res.json()).transaction;
}
__name(fsBeginTransaction, "fsBeginTransaction");
__name2(fsBeginTransaction, "fsBeginTransaction");
async function fsGetTx(path, accessToken, txId) {
  const res = await fetch(`${FIRESTORE_BASE7}/${path}?transaction=${encodeURIComponent(txId)}`, {
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  if (!res.ok) return null;
  return res.json();
}
__name(fsGetTx, "fsGetTx");
__name2(fsGetTx, "fsGetTx");
async function fsCommitTx(writes, accessToken, txId) {
  const res = await fetch(`${FIRESTORE_BASE7}:commit`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: txId, writes })
  });
  const data = await res.json();
  return { ok: res.ok, data };
}
__name(fsCommitTx, "fsCommitTx");
__name2(fsCommitTx, "fsCommitTx");
async function rtdbSet(gameId, data, idToken) {
  try {
    const res = await fetch(`${RTDB_BASE}/game_realtime/${gameId}.json?auth=${idToken}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) console.error(`rtdbSet ${gameId} failed: ${res.status}`, await res.text().catch(() => ""));
  } catch (e) {
    console.error(`rtdbSet ${gameId} exception:`, e?.message || e);
  }
}
__name(rtdbSet, "rtdbSet");
__name2(rtdbSet, "rtdbSet");
async function rtdbPatch(gameId, data, idToken) {
  try {
    const res = await fetch(`${RTDB_BASE}/game_realtime/${gameId}.json?auth=${idToken}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) console.error(`rtdbPatch ${gameId} failed: ${res.status}`, await res.text().catch(() => ""));
  } catch (e) {
    console.error(`rtdbPatch ${gameId} exception:`, e?.message || e);
  }
}
__name(rtdbPatch, "rtdbPatch");
__name2(rtdbPatch, "rtdbPatch");
async function fsCreate(collection, fields, accessToken) {
  const res = await fetch(`${FIRESTORE_BASE7}/${collection}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields })
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.name?.split("/").pop();
}
__name(fsCreate, "fsCreate");
__name2(fsCreate, "fsCreate");
function v(val) {
  if (val === null || val === void 0) return { nullValue: null };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") return { integerValue: String(Math.round(val)) };
  if (typeof val === "string") return { stringValue: val };
  if (typeof val === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(val).map(([k, u]) => [k, v(u)])) } };
  return { stringValue: String(val) };
}
__name(v, "v");
__name2(v, "v");
function fromFs(fields) {
  if (!fields) return {};
  const r = {};
  for (const [k, val] of Object.entries(fields)) {
    if ("stringValue" in val) r[k] = val.stringValue;
    else if ("integerValue" in val) r[k] = parseInt(val.integerValue);
    else if ("booleanValue" in val) r[k] = val.booleanValue;
    else if ("nullValue" in val) r[k] = null;
    else if ("doubleValue" in val) r[k] = val.doubleValue;
    else if ("timestampValue" in val) r[k] = val.timestampValue;
    else if ("mapValue" in val) r[k] = fromFs(val.mapValue?.fields);
  }
  return r;
}
__name(fromFs, "fromFs");
__name2(fromFs, "fromFs");
async function getOrCreateUserDoc(uid, user, accessToken) {
  const existing = await fsGet(`users/${uid}`, accessToken);
  if (existing) return existing;
  const DOC_NAME = `projects/${PROJECT_ID10}/databases/(default)/documents/users/${uid}`;
  const fields = {
    uid: { stringValue: uid },
    email: { stringValue: user.email || "" },
    displayName: { stringValue: user.displayName || "" },
    photoURL: { stringValue: user.photoUrl || "" },
    phone: { stringValue: "" },
    credits: { integerValue: "30" },
    freePoints: { integerValue: "0" },
    referralCredits: { integerValue: "0" },
    totalQuizzes: { integerValue: "0" },
    createdAt: { timestampValue: (/* @__PURE__ */ new Date()).toISOString() }
  };
  const commitRes = await fetch(`${FIRESTORE_BASE7}:commit`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ writes: [{ update: { name: DOC_NAME, fields } }] })
  });
  if (!commitRes.ok) {
    console.error("getOrCreateUserDoc commit failed:", commitRes.status, await commitRes.text().catch(() => ""));
    return null;
  }
  return fsGet(`users/${uid}`, accessToken);
}
__name(getOrCreateUserDoc, "getOrCreateUserDoc");
__name2(getOrCreateUserDoc, "getOrCreateUserDoc");
async function hashPassword(pwd) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("gwatop:" + pwd));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hashPassword, "hashPassword");
__name2(hashPassword, "hashPassword");
function determineWinner(c1, c2) {
  if (c1 === c2) return "draw";
  if (c1 === "\uAC00\uC704" && c2 === "\uBCF4" || c1 === "\uBC14\uC704" && c2 === "\uAC00\uC704" || c1 === "\uBCF4" && c2 === "\uBC14\uC704") return "p1";
  return "p2";
}
__name(determineWinner, "determineWinner");
__name2(determineWinner, "determineWinner");
function newGameFields(wager, player1, player2) {
  return {
    wager: v(wager),
    title: v(""),
    hasPassword: v(false),
    passwordHash: v(""),
    player1: v(player1),
    player2: v(player2),
    p1LeftHand: v(null),
    p1RightHand: v(null),
    p2LeftHand: v(null),
    p2RightHand: v(null),
    p1HandsSubmitted: v(false),
    p2HandsSubmitted: v(false),
    p1FinalHand: v(null),
    p2FinalHand: v(null),
    p1FinalSubmitted: v(false),
    p2FinalSubmitted: v(false),
    winner: v(null),
    result: v(null),
    rematchRequest: v(null),
    createdAt: { timestampValue: (/* @__PURE__ */ new Date()).toISOString() }
  };
}
__name(newGameFields, "newGameFields");
__name2(newGameFields, "newGameFields");
async function onRequestPost9(context) {
  const { request, env } = context;
  const idToken = (request.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (!idToken) return json10({ error: "\uC778\uC99D \uD544\uC694" }, 401);
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return json10({ error: "\uC11C\uBC84 \uD658\uACBD \uBCC0\uC218 \uC5C6\uC74C" }, 500);
  let body;
  try {
    body = await request.json();
  } catch {
    return json10({ error: "parse error" }, 400);
  }
  let user, accessToken;
  try {
    [user, accessToken] = await Promise.all([
      verifyFirebaseToken7(idToken),
      getFirebaseAccessToken10(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY, env.GWATOP_CACHE)
    ]);
  } catch {
    return json10({ error: "\uC11C\uBC84 \uC778\uC99D \uC2E4\uD328" }, 500);
  }
  if (!user) return json10({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uD1A0\uD070" }, 401);
  const { action, gameId, wager, leftHand, rightHand, finalHand, title, password } = body;
  const uid = user.localId;
  const VALID_HANDS = ["\uAC00\uC704", "\uBC14\uC704", "\uBCF4"];
  if (action === "create") {
    const w = parseInt(wager);
    if (!w || w < 1 || w > 10) return json10({ error: "\uBC30\uD305\uC740 1~10 \uD3EC\uC778\uD2B8" }, 400);
    const roomTitle = (title || "").trim().slice(0, 20);
    const roomPw = (password || "").trim().slice(0, 20);
    const passwordHash = roomPw ? await hashPassword(roomPw) : "";
    const userDoc = await getOrCreateUserDoc(uid, user, accessToken);
    if (!userDoc) return json10({ error: "\uACC4\uC815 \uC815\uBCF4\uB97C \uCD08\uAE30\uD654\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." }, 500);
    const userData = fromFs(userDoc.fields);
    if ((userData.freePoints || 0) < w) return json10({ error: "\uBB34\uB8CC \uD3EC\uC778\uD2B8\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4" }, 400);
    const fields = newGameFields(w, { uid, name: userData.nickname || user.displayName || "\uC775\uBA85", photo: user.photoUrl || "" }, null);
    fields.status = v("waiting");
    fields.title = v(roomTitle);
    fields.hasPassword = v(!!roomPw);
    fields.passwordHash = v(passwordHash);
    const newId = await fsCreate("games", fields, accessToken);
    if (!newId) return json10({ error: "\uAC8C\uC784 \uC0DD\uC131 \uC2E4\uD328" }, 500);
    await rtdbSet(newId, {
      status: "waiting",
      wager: w,
      title: roomTitle,
      hasPassword: !!roomPw,
      createdAt: Date.now(),
      player1: { uid, name: userData.nickname || user.displayName || "\uC775\uBA85", photo: user.photoUrl || "" },
      player2: null,
      p1HandsSubmitted: false,
      p2HandsSubmitted: false
    }, idToken);
    return json10({ gameId: newId });
  }
  if (action === "join") {
    if (!gameId) return json10({ error: "gameId \uD544\uC694" }, 400);
    const userDoc = await getOrCreateUserDoc(uid, user, accessToken);
    if (!userDoc) return json10({ error: "\uACC4\uC815 \uC815\uBCF4\uB97C \uCD08\uAE30\uD654\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." }, 500);
    const userData = fromFs(userDoc.fields);
    const inputHash = password ? await hashPassword((password || "").trim().slice(0, 20)) : "";
    for (let attempt = 0; attempt < 3; attempt++) {
      let txId;
      try {
        txId = await fsBeginTransaction(accessToken);
      } catch {
        return json10({ error: "\uC11C\uBC84 \uC624\uB958" }, 500);
      }
      const gameDoc = await fsGetTx(`games/${gameId}`, accessToken, txId);
      if (!gameDoc) return json10({ error: "\uAC8C\uC784\uBC29 \uC5C6\uC74C" }, 404);
      const game = fromFs(gameDoc.fields);
      if (game.status !== "waiting") return json10({ error: "\uC774\uBBF8 \uC2DC\uC791\uB41C \uAC8C\uC784" }, 400);
      if (game.player1?.uid === uid) return json10({ error: "\uC790\uC2E0\uC758 \uBC29\uC5D0\uB294 \uC785\uC7A5\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" }, 400);
      if ((userData.freePoints || 0) < game.wager) return json10({ error: "\uBB34\uB8CC \uD3EC\uC778\uD2B8\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4" }, 400);
      if (game.hasPassword) {
        if (!password) return json10({ error: "\uBE44\uBC00\uBC88\uD638\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4" }, 403);
        if (inputHash !== game.passwordHash) return json10({ error: "\uBE44\uBC00\uBC88\uD638\uAC00 \uD2C0\uB838\uC2B5\uB2C8\uB2E4" }, 403);
      }
      const fields = {
        status: v("ready"),
        player2: v({ uid, name: userData.nickname || user.displayName || "\uC775\uBA85", photo: user.photoUrl || "" })
      };
      const { ok, data } = await fsCommitTx([{
        update: { name: `${DOC_BASE7}/games/${gameId}`, fields },
        updateMask: { fieldPaths: Object.keys(fields) }
      }], accessToken, txId);
      if (ok) {
        await rtdbSet(gameId, {
          status: "ready",
          wager: game.wager,
          player1: game.player1,
          player2: { uid, name: userData.nickname || user.displayName || "\uC775\uBA85", photo: user.photoUrl || "" },
          p1HandsSubmitted: false,
          p2HandsSubmitted: false
        }, idToken);
        return json10({ success: true, wager: game.wager });
      }
      if (data.error?.status === "ABORTED") continue;
      return json10({ error: "\uC785\uC7A5 \uC2E4\uD328" }, 500);
    }
    return json10({ error: "\uC774\uBBF8 \uB2E4\uB978 \uD50C\uB808\uC774\uC5B4\uAC00 \uC785\uC7A5\uD588\uC2B5\uB2C8\uB2E4" }, 409);
  }
  if (action === "submit_hands") {
    if (!gameId || !leftHand || !rightHand) return json10({ error: "gameId, leftHand, rightHand \uD544\uC694" }, 400);
    if (!VALID_HANDS.includes(leftHand) || !VALID_HANDS.includes(rightHand)) return json10({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uC190 \uC120\uD0DD" }, 400);
    for (let attempt = 0; attempt < 3; attempt++) {
      let txId;
      try {
        txId = await fsBeginTransaction(accessToken);
      } catch {
        return json10({ error: "\uC11C\uBC84 \uC624\uB958" }, 500);
      }
      const gameDoc = await fsGetTx(`games/${gameId}`, accessToken, txId);
      if (!gameDoc) return json10({ error: "\uAC8C\uC784\uBC29 \uC5C6\uC74C" }, 404);
      const game = fromFs(gameDoc.fields);
      if (game.status !== "ready") return json10({ error: "\uAC8C\uC784\uC774 \uC900\uBE44 \uC0C1\uD0DC\uAC00 \uC544\uB2D8" }, 400);
      const isP1 = game.player1?.uid === uid;
      const isP2 = game.player2?.uid === uid;
      if (!isP1 && !isP2) return json10({ error: "\uAC8C\uC784 \uCC38\uAC00\uC790\uAC00 \uC544\uB2D8" }, 403);
      if (isP1 && game.p1HandsSubmitted) return json10({ error: "\uC774\uBBF8 \uC81C\uCD9C\uD588\uC2B5\uB2C8\uB2E4" }, 400);
      if (isP2 && game.p2HandsSubmitted) return json10({ error: "\uC774\uBBF8 \uC81C\uCD9C\uD588\uC2B5\uB2C8\uB2E4" }, 400);
      const bothSubmitted = isP1 ? game.p2HandsSubmitted : game.p1HandsSubmitted;
      const fields = isP1 ? { p1LeftHand: v(leftHand), p1RightHand: v(rightHand), p1HandsSubmitted: v(true) } : { p2LeftHand: v(leftHand), p2RightHand: v(rightHand), p2HandsSubmitted: v(true) };
      if (bothSubmitted) fields.status = v("hands_shown");
      const { ok, data } = await fsCommitTx([{
        update: { name: `${DOC_BASE7}/games/${gameId}`, fields },
        updateMask: { fieldPaths: Object.keys(fields) }
      }], accessToken, txId);
      if (ok) {
        const rtdbUpdate = isP1 ? { p1HandsSubmitted: true, p1LeftHand: leftHand, p1RightHand: rightHand } : { p2HandsSubmitted: true, p2LeftHand: leftHand, p2RightHand: rightHand };
        if (bothSubmitted) rtdbUpdate.status = "hands_shown";
        await rtdbPatch(gameId, rtdbUpdate, idToken);
        return json10({ handsShown: !!bothSubmitted });
      }
      if (data.error?.status === "ABORTED") continue;
      return json10({ error: "\uC81C\uCD9C \uC2E4\uD328" }, 500);
    }
    return json10({ error: "\uC77C\uC2DC\uC801 \uCDA9\uB3CC, \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694" }, 409);
  }
  if (action === "submit_final") {
    if (!gameId || !finalHand) return json10({ error: "gameId, finalHand \uD544\uC694" }, 400);
    if (!VALID_HANDS.includes(finalHand)) return json10({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uC120\uD0DD" }, 400);
    for (let attempt = 0; attempt < 3; attempt++) {
      let txId;
      try {
        txId = await fsBeginTransaction(accessToken);
      } catch {
        return json10({ error: "\uC11C\uBC84 \uC624\uB958" }, 500);
      }
      const [gameDoc, finalsDoc] = await Promise.all([
        fsGetTx(`games/${gameId}`, accessToken, txId),
        fsGetTx(`game_finals/${gameId}`, accessToken, txId)
      ]);
      if (!gameDoc) return json10({ error: "\uAC8C\uC784\uBC29 \uC5C6\uC74C" }, 404);
      const game = fromFs(gameDoc.fields);
      const finals = fromFs(finalsDoc?.fields || {});
      if (game.status !== "hands_shown") return json10({ error: "\uC190 \uACF5\uAC1C \uC0C1\uD0DC\uAC00 \uC544\uB2D8" }, 400);
      const isP1 = game.player1?.uid === uid;
      const isP2 = game.player2?.uid === uid;
      if (!isP1 && !isP2) return json10({ error: "\uAC8C\uC784 \uCC38\uAC00\uC790\uAC00 \uC544\uB2D8" }, 403);
      if (isP1 && game.p1FinalSubmitted) return json10({ error: "\uC774\uBBF8 \uC120\uD0DD\uD588\uC2B5\uB2C8\uB2E4" }, 400);
      if (isP2 && game.p2FinalSubmitted) return json10({ error: "\uC774\uBBF8 \uC120\uD0DD\uD588\uC2B5\uB2C8\uB2E4" }, 400);
      const myLeft = isP1 ? game.p1LeftHand : game.p2LeftHand;
      const myRight = isP1 ? game.p1RightHand : game.p2RightHand;
      if (finalHand !== myLeft && finalHand !== myRight) return json10({ error: "\uC790\uC2E0\uC774 \uB0B8 \uC190\uB9CC \uC120\uD0DD \uAC00\uB2A5" }, 400);
      const bothFinal = isP1 ? game.p2FinalSubmitted : game.p1FinalSubmitted;
      const myFinalKey = isP1 ? "p1FinalHand" : "p2FinalHand";
      const mySubKey = isP1 ? "p1FinalSubmitted" : "p2FinalSubmitted";
      if (!bothFinal) {
        const { ok: ok2, data: data2 } = await fsCommitTx([
          { update: { name: `${DOC_BASE7}/game_finals/${gameId}`, fields: { [myFinalKey]: v(finalHand) } }, updateMask: { fieldPaths: [myFinalKey] } },
          { update: { name: `${DOC_BASE7}/games/${gameId}`, fields: { [mySubKey]: v(true) } }, updateMask: { fieldPaths: [mySubKey] } }
        ], accessToken, txId);
        if (ok2) {
          await rtdbPatch(gameId, { [mySubKey]: true }, idToken);
          return json10({ waiting: true });
        }
        if (data2.error?.status === "ABORTED") continue;
        return json10({ error: "\uCC98\uB9AC \uC2E4\uD328" }, 500);
      }
      const oppFinalHand = isP1 ? finals.p2FinalHand : finals.p1FinalHand;
      if (!oppFinalHand) return json10({ error: "\uC0C1\uB300\uBC29 \uC190 \uC120\uD0DD \uB370\uC774\uD130 \uC5C6\uC74C" }, 500);
      const p1FinalHand = isP1 ? finalHand : oppFinalHand;
      const p2FinalHand = isP2 ? finalHand : oppFinalHand;
      const winnerSide = determineWinner(p1FinalHand, p2FinalHand);
      if (winnerSide === "draw") {
        const rematchId = `${gameId}_r`;
        const rematchFields = { ...newGameFields(
          game.wager,
          { uid: game.player1.uid, name: game.player1.name, photo: game.player1.photo || "" },
          { uid: game.player2.uid, name: game.player2.name, photo: game.player2.photo || "" }
        ), status: v("ready") };
        const { ok: ok2, data: data2 } = await fsCommitTx([
          { update: { name: `${DOC_BASE7}/game_finals/${gameId}`, fields: { [myFinalKey]: v(finalHand) } }, updateMask: { fieldPaths: [myFinalKey] } },
          { update: { name: `${DOC_BASE7}/games/${rematchId}`, fields: rematchFields }, updateMask: { fieldPaths: Object.keys(rematchFields) } },
          { update: { name: `${DOC_BASE7}/games/${gameId}`, fields: { [mySubKey]: v(true), status: v("finished"), winner: v(null), result: v({ p1FinalHand, p2FinalHand }), drawRematchId: v(rematchId) } }, updateMask: { fieldPaths: [mySubKey, "status", "winner", "result", "drawRematchId"] } }
        ], accessToken, txId);
        if (ok2) {
          await Promise.all([
            rtdbPatch(gameId, { [mySubKey]: true, status: "finished", result: { p1FinalHand, p2FinalHand }, drawRematchId: rematchId }, idToken),
            rtdbSet(rematchId, {
              status: "ready",
              wager: game.wager,
              player1: game.player1,
              player2: game.player2,
              p1HandsSubmitted: false,
              p2HandsSubmitted: false
            }, idToken)
          ]);
          return json10({ finished: true, draw: true, drawRematchId: rematchId });
        }
        if (data2.error?.status === "ABORTED") continue;
        return json10({ error: "\uAC8C\uC784 \uCC98\uB9AC \uC2E4\uD328" }, 500);
      }
      const [p1Doc, p2Doc] = await Promise.all([
        fsGetTx(`users/${game.player1.uid}`, accessToken, txId),
        fsGetTx(`users/${game.player2.uid}`, accessToken, txId)
      ]);
      const p1FP = parseInt(fromFs(p1Doc?.fields)?.freePoints || 0);
      const p2FP = parseInt(fromFs(p2Doc?.fields)?.freePoints || 0);
      const winnerId = winnerSide === "p1" ? game.player1.uid : game.player2.uid;
      let newP1FP = p1FP, newP2FP = p2FP;
      if (winnerSide === "p1") {
        newP1FP = p1FP + game.wager;
        newP2FP = Math.max(0, p2FP - game.wager);
      } else {
        newP2FP = p2FP + game.wager;
        newP1FP = Math.max(0, p1FP - game.wager);
      }
      const { ok, data } = await fsCommitTx([
        { update: { name: `${DOC_BASE7}/game_finals/${gameId}`, fields: { [myFinalKey]: v(finalHand) } }, updateMask: { fieldPaths: [myFinalKey] } },
        { update: { name: `${DOC_BASE7}/games/${gameId}`, fields: { [mySubKey]: v(true), status: v("finished"), winner: v(winnerId), result: v({ p1FinalHand, p2FinalHand }) } }, updateMask: { fieldPaths: [mySubKey, "status", "winner", "result"] } },
        { update: { name: `${DOC_BASE7}/users/${game.player1.uid}`, fields: { freePoints: v(newP1FP) } }, updateMask: { fieldPaths: ["freePoints"] } },
        { update: { name: `${DOC_BASE7}/users/${game.player2.uid}`, fields: { freePoints: v(newP2FP) } }, updateMask: { fieldPaths: ["freePoints"] } }
      ], accessToken, txId);
      if (ok) {
        await rtdbPatch(gameId, { [mySubKey]: true, status: "finished", winner: winnerId, result: { p1FinalHand, p2FinalHand } }, idToken);
        return json10({ finished: true, result: { p1FinalHand, p2FinalHand, winner: winnerId, winnerSide, wager: game.wager } });
      }
      if (data.error?.status === "ABORTED") continue;
      return json10({ error: "\uAC8C\uC784 \uCC98\uB9AC \uC2E4\uD328" }, 500);
    }
    return json10({ error: "\uC77C\uC2DC\uC801 \uCDA9\uB3CC, \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694" }, 409);
  }
  if (action === "rematch_request") {
    if (!gameId || !wager) return json10({ error: "gameId, wager \uD544\uC694" }, 400);
    const w = parseInt(wager);
    if (!w || w < 1 || w > 10) return json10({ error: "\uBC30\uD305\uC740 1~10 \uD3EC\uC778\uD2B8" }, 400);
    const [gameDoc, userDoc] = await Promise.all([
      fsGet(`games/${gameId}`, accessToken),
      fsGet(`users/${uid}`, accessToken)
    ]);
    if (!gameDoc) return json10({ error: "\uAC8C\uC784\uBC29 \uC5C6\uC74C" }, 404);
    if (!userDoc) return json10({ error: "\uACC4\uC815 \uC815\uBCF4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uB85C\uADF8\uC778\uD574\uC8FC\uC138\uC694." }, 404);
    const game = fromFs(gameDoc.fields);
    if (game.status !== "finished") return json10({ error: "\uC885\uB8CC\uB41C \uAC8C\uC784\uB9CC \uC7AC\uB300\uACB0 \uAC00\uB2A5" }, 400);
    if (game.player1?.uid !== uid && game.player2?.uid !== uid) return json10({ error: "\uAC8C\uC784 \uCC38\uAC00\uC790 \uC544\uB2D8" }, 403);
    if (game.rematchRequest?.status === "pending") return json10({ error: "\uC774\uBBF8 \uC7AC\uB300\uACB0 \uC2E0\uCCAD \uC911" }, 400);
    const userData = fromFs(userDoc.fields);
    if ((userData.freePoints || 0) < w) return json10({ error: "\uBB34\uB8CC \uD3EC\uC778\uD2B8 \uBD80\uC871" }, 400);
    await fsPatch(`games/${gameId}`, {
      rematchRequest: v({ fromUid: uid, fromName: userData.nickname || user.displayName || "\uC775\uBA85", wager: w, status: "pending" })
    }, accessToken);
    await rtdbPatch(gameId, { rematchRequest: { fromUid: uid, fromName: userData.nickname || user.displayName || "\uC775\uBA85", wager: w, status: "pending" } }, idToken);
    return json10({ success: true });
  }
  if (action === "rematch_accept") {
    if (!gameId) return json10({ error: "gameId \uD544\uC694" }, 400);
    const [gameDoc, userDoc] = await Promise.all([
      fsGet(`games/${gameId}`, accessToken),
      fsGet(`users/${uid}`, accessToken)
    ]);
    if (!gameDoc) return json10({ error: "\uAC8C\uC784\uBC29 \uC5C6\uC74C" }, 404);
    if (!userDoc) return json10({ error: "\uACC4\uC815 \uC815\uBCF4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uB85C\uADF8\uC778\uD574\uC8FC\uC138\uC694." }, 404);
    const game = fromFs(gameDoc.fields);
    const rr = game.rematchRequest;
    if (!rr || rr.status !== "pending") return json10({ error: "\uC720\uD6A8\uD55C \uC7AC\uB300\uACB0 \uC2E0\uCCAD \uC5C6\uC74C" }, 400);
    if (rr.fromUid === uid) return json10({ error: "\uC790\uC2E0\uC758 \uC2E0\uCCAD\uC740 \uC218\uB77D \uBD88\uAC00" }, 403);
    const userData = fromFs(userDoc.fields);
    if ((userData.freePoints || 0) < rr.wager) return json10({ error: "\uBB34\uB8CC \uD3EC\uC778\uD2B8 \uBD80\uC871" }, 400);
    const requesterDoc = await fsGet(`users/${rr.fromUid}`, accessToken);
    if (!requesterDoc) return json10({ error: "\uC2E0\uCCAD\uC790 \uACC4\uC815 \uC815\uBCF4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }, 404);
    const requesterData = fromFs(requesterDoc.fields);
    if ((requesterData.freePoints || 0) < rr.wager) return json10({ error: "\uC2E0\uCCAD\uC790 \uD3EC\uC778\uD2B8 \uBD80\uC871" }, 400);
    const fields = newGameFields(
      rr.wager,
      { uid: game.player1.uid, name: game.player1.name, photo: game.player1.photo || "" },
      { uid: game.player2.uid, name: game.player2.name, photo: game.player2.photo || "" }
    );
    fields.status = v("ready");
    const newId = await fsCreate("games", fields, accessToken);
    if (!newId) return json10({ error: "\uC7AC\uB300\uACB0 \uAC8C\uC784 \uC0DD\uC131 \uC2E4\uD328" }, 500);
    await fsPatch(`games/${gameId}`, {
      rematchRequest: v({ fromUid: rr.fromUid, fromName: rr.fromName, wager: rr.wager, status: "accepted", newGameId: newId })
    }, accessToken);
    await Promise.all([
      rtdbPatch(gameId, { rematchRequest: { fromUid: rr.fromUid, fromName: rr.fromName, wager: rr.wager, status: "accepted", newGameId: newId } }, idToken),
      rtdbSet(newId, {
        status: "ready",
        wager: rr.wager,
        player1: { uid: game.player1.uid, name: game.player1.name, photo: game.player1.photo || "" },
        player2: { uid: game.player2.uid, name: game.player2.name, photo: game.player2.photo || "" },
        p1HandsSubmitted: false,
        p2HandsSubmitted: false
      }, idToken)
    ]);
    const isP1ForAcceptor = game.player1?.uid === uid;
    return json10({ success: true, newGameId: newId, isP1: isP1ForAcceptor });
  }
  if (action === "rematch_decline") {
    if (!gameId) return json10({ error: "gameId \uD544\uC694" }, 400);
    const gameDoc = await fsGet(`games/${gameId}`, accessToken);
    if (!gameDoc) return json10({ error: "\uAC8C\uC784\uBC29 \uC5C6\uC74C" }, 404);
    const game = fromFs(gameDoc.fields);
    if (game.player1?.uid !== uid && game.player2?.uid !== uid) return json10({ error: "\uAC8C\uC784 \uCC38\uAC00\uC790 \uC544\uB2D8" }, 403);
    const rr = game.rematchRequest;
    if (!rr || rr.status !== "pending") return json10({ error: "\uC720\uD6A8\uD55C \uC2E0\uCCAD \uC5C6\uC74C" }, 400);
    const newRR = rr.fromUid === uid ? null : { fromUid: rr.fromUid, fromName: rr.fromName, wager: rr.wager, status: "declined" };
    await fsPatch(`games/${gameId}`, { rematchRequest: v(newRR) }, accessToken);
    await rtdbPatch(gameId, { rematchRequest: newRR }, idToken);
    return json10({ success: true });
  }
  if (action === "timeout") {
    if (!gameId) return json10({ error: "gameId \uD544\uC694" }, 400);
    for (let attempt = 0; attempt < 3; attempt++) {
      let txId;
      try {
        txId = await fsBeginTransaction(accessToken);
      } catch {
        return json10({ error: "\uC11C\uBC84 \uC624\uB958" }, 500);
      }
      const gameDoc = await fsGetTx(`games/${gameId}`, accessToken, txId);
      if (!gameDoc) return json10({ error: "\uAC8C\uC784\uBC29 \uC5C6\uC74C" }, 404);
      const game = fromFs(gameDoc.fields);
      if (game.status !== "ready" && game.status !== "hands_shown") return json10({ error: "\uC9C4\uD589 \uC911\uC778 \uAC8C\uC784\uC774 \uC544\uB2D8" }, 400);
      const isP1 = game.player1?.uid === uid;
      const isP2 = game.player2?.uid === uid;
      if (!isP1 && !isP2) return json10({ error: "\uAC8C\uC784 \uCC38\uAC00\uC790 \uC544\uB2D8" }, 403);
      const callerAlreadySubmitted = game.status === "ready" && isP1 && game.p1HandsSubmitted || game.status === "ready" && isP2 && game.p2HandsSubmitted || game.status === "hands_shown" && isP1 && game.p1FinalSubmitted || game.status === "hands_shown" && isP2 && game.p2FinalSubmitted;
      const winnerId = callerAlreadySubmitted ? isP1 ? game.player1.uid : game.player2.uid : isP1 ? game.player2.uid : game.player1.uid;
      const winnerSide = callerAlreadySubmitted ? isP1 ? "p1" : "p2" : isP1 ? "p2" : "p1";
      const [p1Doc, p2Doc] = await Promise.all([
        fsGetTx(`users/${game.player1.uid}`, accessToken, txId),
        fsGetTx(`users/${game.player2.uid}`, accessToken, txId)
      ]);
      const p1FP = parseInt(fromFs(p1Doc?.fields)?.freePoints || 0);
      const p2FP = parseInt(fromFs(p2Doc?.fields)?.freePoints || 0);
      let newP1FP = p1FP, newP2FP = p2FP;
      if (winnerSide === "p1") {
        newP1FP = p1FP + game.wager;
        newP2FP = Math.max(0, p2FP - game.wager);
      } else {
        newP2FP = p2FP + game.wager;
        newP1FP = Math.max(0, p1FP - game.wager);
      }
      const { ok, data } = await fsCommitTx([
        { update: { name: `${DOC_BASE7}/games/${gameId}`, fields: { status: v("finished"), winner: v(winnerId), result: v({ timeout: true }) } }, updateMask: { fieldPaths: ["status", "winner", "result"] } },
        { update: { name: `${DOC_BASE7}/users/${game.player1.uid}`, fields: { freePoints: v(newP1FP) } }, updateMask: { fieldPaths: ["freePoints"] } },
        { update: { name: `${DOC_BASE7}/users/${game.player2.uid}`, fields: { freePoints: v(newP2FP) } }, updateMask: { fieldPaths: ["freePoints"] } }
      ], accessToken, txId);
      if (ok) {
        await rtdbPatch(gameId, { status: "finished", winner: winnerId, result: { timeout: true } }, idToken);
        return json10({ finished: true, timeout: true });
      }
      if (data.error?.status === "ABORTED") continue;
      return json10({ error: "\uD0C0\uC784\uC544\uC6C3 \uCC98\uB9AC \uC2E4\uD328" }, 500);
    }
    return json10({ error: "\uC77C\uC2DC\uC801 \uCDA9\uB3CC, \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694" }, 409);
  }
  if (action === "cancel") {
    if (!gameId) return json10({ error: "gameId \uD544\uC694" }, 400);
    const gameDoc = await fsGet(`games/${gameId}`, accessToken);
    if (!gameDoc) return json10({ error: "\uAC8C\uC784\uBC29 \uC5C6\uC74C" }, 404);
    const game = fromFs(gameDoc.fields);
    if (game.player1?.uid !== uid) return json10({ error: "\uBC29\uC7A5\uB9CC \uCDE8\uC18C \uAC00\uB2A5" }, 403);
    if (game.status !== "waiting") return json10({ error: "\uC774\uBBF8 \uC2DC\uC791\uB41C \uAC8C\uC784\uC740 \uCDE8\uC18C \uBD88\uAC00" }, 400);
    await fsPatch(`games/${gameId}`, { status: v("cancelled") }, accessToken);
    await rtdbPatch(gameId, { status: "cancelled" }, idToken);
    return json10({ success: true });
  }
  return json10({ error: "\uC54C \uC218 \uC5C6\uB294 \uC561\uC158" }, 400);
}
__name(onRequestPost9, "onRequestPost9");
__name2(onRequestPost9, "onRequestPost");
function json10(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS11 });
}
__name(json10, "json10");
__name2(json10, "json");
var GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
var PROJECT_ID11 = "gwatop-8edaf";
var RATE_LIMIT_SECONDS = 30;
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};
async function onRequestOptions12() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
__name(onRequestOptions12, "onRequestOptions12");
__name2(onRequestOptions12, "onRequestOptions");
async function onRequestGet4(context) {
  const { env } = context;
  const apiKey = env.GEMINI_API_KEY || env["GEMINI_API_KEY "] || "";
  if (!apiKey) return new Response(JSON.stringify({ error: "no key" }), { status: 200, headers: CORS_HEADERS });
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const data = await res.json();
  const models = (data.models || []).map((m) => m.name);
  return new Response(JSON.stringify({ models }), { status: 200, headers: CORS_HEADERS });
}
__name(onRequestGet4, "onRequestGet4");
__name2(onRequestGet4, "onRequestGet");
async function onRequestPost10(context) {
  const { request, env } = context;
  const apiKey = env.GEMINI_API_KEY || env["GEMINI_API_KEY "] || env.gemini_api_key || "";
  if (!apiKey) {
    return json11({
      error: "GEMINI_API_KEY \uD658\uACBD \uBCC0\uC218\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. Cloudflare Pages \u2192 \uC124\uC815 \u2192 \uD658\uACBD \uBCC0\uC218\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694."
    }, 500);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json11({ error: "\uC694\uCCAD \uBCF8\uBB38\uC744 \uD30C\uC2F1\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }, 400);
  }
  const { idToken, continuation } = body;
  if (!continuation && idToken && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    try {
      const tokenPayload = decodeJWT(idToken);
      const uid = tokenPayload?.user_id || tokenPayload?.sub;
      if (uid) {
        const rateLimitResult = await checkAndUpdateRateLimit(uid, env);
        if (!rateLimitResult.allowed) {
          return json11({ error: `\uC694\uCCAD\uC774 \uB108\uBB34 \uBE60\uB985\uB2C8\uB2E4. ${rateLimitResult.waitSeconds}\uCD08 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.` }, 429);
        }
      }
    } catch {
    }
  }
  const { text, types, type, count, lang } = body;
  const language = lang === "en" ? "en" : "ko";
  const selectedTypes = types || (type ? [type] : ["mcq"]);
  const validTypes = selectedTypes.filter((t) => ["mcq", "short", "ox"].includes(t));
  if (validTypes.length === 0) return json11({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uBB38\uC81C \uC720\uD615\uC785\uB2C8\uB2E4." }, 400);
  const hasText = text && text.length >= 50;
  if (!hasText) return json11({ error: "text \uD30C\uB77C\uBBF8\uD130\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." }, 400);
  if (!count || count < 1 || count > 50) return json11({ error: "\uBB38\uC81C \uAC1C\uC218\uB294 1~50 \uC0AC\uC774\uC5EC\uC57C \uD569\uB2C8\uB2E4." }, 400);
  const truncatedText = text.slice(0, 55e3);
  const prompt = buildPrompt(truncatedText, validTypes, Math.min(parseInt(count), 50), language);
  try {
    const parts = [{ text: prompt }];
    const geminiBody = JSON.stringify({
      system_instruction: {
        parts: [{ text: "\uB2F9\uC2E0\uC740 \uAD6D\uAC00 \uC218\uC900\uC758 \uC2DC\uD5D8\uC744 10\uB144 \uC774\uC0C1 \uCD9C\uC81C\uD574\uC628 \uB300\uD559\uAD50\uC218\uC774\uC790 \uAD50\uC721\uD3C9\uAC00 \uC804\uBB38\uAC00\uC785\uB2C8\uB2E4. \uB2E8\uC21C \uC554\uAE30 \uBB38\uC81C\uAC00 \uC544\uB2CC, \uD559\uC0DD\uC758 \uC9C4\uC9DC \uC774\uD574\uB3C4\uC640 \uC801\uC6A9 \uB2A5\uB825\uC744 \uC815\uBC00\uD558\uAC8C \uCE21\uC815\uD558\uB294 \uBB38\uC81C\uB97C \uCD9C\uC81C\uD569\uB2C8\uB2E4. \uCD9C\uC81C\uD55C \uBAA8\uB4E0 \uBB38\uC81C\uB294 \uAD50\uC721 \uC804\uBB38\uAC00\uC758 \uAC80\uD1A0\uB97C \uD1B5\uACFC\uD560 \uC218 \uC788\uB294 \uC218\uC900\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4." }]
      },
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.4,
        topP: 0.9,
        maxOutputTokens: 16384,
        thinkingConfig: { thinkingBudget: 1e4 }
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
        return json11({ error: "\uC11C\uBC84\uAC00 \uD63C\uC7A1\uD569\uB2C8\uB2E4. 1~2\uBD84 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." }, 429);
      }
      console.error("Gemini API error detail:", geminiRes.status, errText.slice(0, 300));
      return json11({ error: "\uD034\uC988 \uC0DD\uC131\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." }, 502);
    }
    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return json11({ error: "Gemini API\uB85C\uBD80\uD130 \uC751\uB2F5\uC744 \uBC1B\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." }, 502);
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
            return json11({ error: "\uD034\uC988 \uB370\uC774\uD130 \uD615\uC2DD \uC624\uB958\uC785\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." }, 502);
          }
        }
      } else {
        console.error("JSON \uC5C6\uC74C. \uC6D0\uBB38:", rawText.slice(0, 500));
        return json11({ error: "\uD034\uC988 \uC0DD\uC131 \uACB0\uACFC\uB97C \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." }, 502);
      }
    }
    if (!quiz.questions || !Array.isArray(quiz.questions)) {
      return json11({ error: "\uD034\uC988 \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." }, 502);
    }
    quiz.questions = quiz.questions.map((q, i) => ({ id: i + 1, ...q }));
    return json11(quiz, 200);
  } catch (err) {
    console.error("Unexpected error:", err);
    return json11({ error: `\uC11C\uBC84 \uC624\uB958: ${err.message}` }, 500);
  }
}
__name(onRequestPost10, "onRequestPost10");
__name2(onRequestPost10, "onRequestPost");
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
async function getFirebaseAccessToken11(clientEmail, privateKey) {
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
__name(getFirebaseAccessToken11, "getFirebaseAccessToken11");
__name2(getFirebaseAccessToken11, "getFirebaseAccessToken");
async function checkAndUpdateRateLimit(uid, env) {
  const accessToken = await getFirebaseAccessToken11(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
  const docUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID11}/databases/(default)/documents/quiz_rate_limits/${uid}`;
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
function buildPrompt(text, types, count, language = "ko") {
  const distribution = distributeCount(count, types);
  const typeDescriptions = {
    mcq: /* @__PURE__ */ __name2((n) => `
\u25B6 \uAC1D\uAD00\uC2DD(mcq) ${n}\uAC1C
\uD615\uC2DD: {"type":"mcq","question":"...","options":["\u2460 ...","\u2461 ...","\u2462 ...","\u2463 ..."],"answer":"\u2461","explanation":"..."}
- \uC120\uC9C0\uB294 \u2460\u2461\u2462\u2463 \uD615\uC2DD, answer\uB294 "\u2460"~"\u2463" \uC911 \uD558\uB098
- \uC624\uB2F5 \uC120\uC9C0 \uD544\uC218 \uC870\uAC74:
  \xB7 \uAC01 \uC624\uB2F5\uC740 \uD559\uC0DD\uB4E4\uC774 \uC790\uC8FC \uBC94\uD558\uB294 \uAD6C\uCCB4\uC801 \uC624\uAC1C\uB150\uC744 \uBC18\uC601\uD560 \uAC83
  \xB7 \uC815\uB2F5\uACFC \uBBF8\uBB18\uD558\uAC8C \uB2E4\uB978 \uAC1C\uB150\uC744 \uD65C\uC6A9\uD558\uC5EC \uB2E8\uC21C\uD788 '\uBA85\uBC31\uD788 \uD2C0\uB9B0' \uC120\uC9C0\uB97C \uB9CC\uB4E4\uC9C0 \uB9D0 \uAC83
  \xB7 "\uBAA8\uB450 \uB9DE\uB2E4", "\uBAA8\uB450 \uD2C0\uB9AC\uB2E4", "\uD574\uB2F9 \uC5C6\uC74C" \uB4F1\uC758 \uC120\uC9C0 \uC808\uB300 \uAE08\uC9C0
  \xB7 \uC120\uC9C0 \uAE38\uC774\uAC00 \uBE44\uC2B7\uD574\uC57C \uD568 (\uC815\uB2F5\uB9CC \uC720\uB3C5 \uAE38\uAC70\uB098 \uC9E7\uC73C\uBA74 \uC548 \uB428)
  \xB7 \uC120\uC9C0 \uC21C\uC11C: \uC218\uCE58\uBA74 \uC624\uB984\uCC28\uC21C, \uAC1C\uB150\uC774\uBA74 \uB17C\uB9AC\uC801 \uC21C\uC11C`, "mcq"),
    short: /* @__PURE__ */ __name2((n) => `
\u25B6 \uC8FC\uAD00\uC2DD(short) ${n}\uAC1C
\uD615\uC2DD: {"type":"short","question":"...","answer":"...","explanation":"..."}
- answer\uB294 \uD575\uC2EC \uAC1C\uB150\uC5B4 \uB610\uB294 \uBA85\uD655\uD55C \uB2E8\uBB38(\uC815\uB2F5\uC774 \uD558\uB098\uB85C \uC218\uB834\uD574\uC57C \uD568)
- \uC815\uB2F5\uC774 2\uAC00\uC9C0 \uC774\uC0C1 \uAC00\uB2A5\uD55C \uBB38\uC81C \uAE08\uC9C0
- options \uD544\uB4DC \uC5C6\uC74C`, "short"),
    ox: /* @__PURE__ */ __name2((n) => `
\u25B6 OX\uD034\uC988(ox) ${n}\uAC1C
\uD615\uC2DD: {"type":"ox","question":"...","answer":"O","explanation":"..."}
- \uCC38/\uAC70\uC9D3\uC774 100% \uBA85\uD655\uD55C \uC9C4\uC220\uBB38\uB9CC \uC0AC\uC6A9
- \uBD80\uBD84\uC801\uC73C\uB85C\uB9CC \uB9DE\uAC70\uB098 \uBAA8\uD638\uD55C \uC9C4\uC220 \uAE08\uC9C0
- answer\uB294 "O" \uB610\uB294 "X"
- options \uD544\uB4DC \uC5C6\uC74C`, "ox")
  };
  const typeInstructions = types.map((t) => typeDescriptions[t](distribution[t])).join("\n");
  const totalDesc = types.map((t) => `${typeLabels[t]} ${distribution[t]}\uAC1C`).join(", ");
  const langRule = language === "en" ? "L1. ALL text (questions, options, answers, explanations) must be in English." : "L1. \uBAA8\uB4E0 \uB0B4\uC6A9\uC744 \uBC18\uB4DC\uC2DC \uD55C\uAD6D\uC5B4\uB85C \uC791\uC131\uD558\uC138\uC694.";
  return `\uC544\uB798 \uD559\uC2B5 \uC790\uB8CC\uB97C \uBC14\uD0D5\uC73C\uB85C \uB300\uD559\uC0DD \uC218\uC900\uC758 \uACE0\uD488\uC9C8 \uC2DC\uD5D8 \uBB38\uC81C ${count}\uAC1C\uB97C \uC0DD\uC131\uD558\uC138\uC694.

\u2501\u2501\u2501 \uD559\uC2B5 \uC790\uB8CC \u2501\u2501\u2501
${text}
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

\u2501\u2501\u2501 \uC0DD\uC131\uD560 \uBB38\uC81C \uAD6C\uC131 \u2501\u2501\u2501
${totalDesc} (\uCD1D ${count}\uAC1C)

\u2501\u2501\u2501 \uC720\uD615\uBCC4 \uD615\uC2DD \u2501\u2501\u2501
${typeInstructions}

\u2501\u2501\u2501 \uBB38\uC81C \uD488\uC9C8 \uAE30\uC900 (\uBC18\uB4DC\uC2DC \uC900\uC218) \u2501\u2501\u2501
${langRule}
L2. \u3010\uC778\uC9C0 \uC218\uC900 \uBD84\uBC30\u3011\uC804\uCCB4 \uBB38\uC81C \uC911:
   - \uB2E8\uC21C \uC554\uAE30(\uC815\uC758\xB7\uC6A9\uC5B4 \uC7AC\uD604): \uCD5C\uB300 30%
   - \uC774\uD574\xB7\uC801\uC6A9(\uAC1C\uB150 \uC124\uBA85, \uB2E4\uB978 \uC0C1\uD669\uC5D0 \uC801\uC6A9): \uCD5C\uC18C 40%
   - \uBD84\uC11D\xB7\uD3C9\uAC00(\uC6D0\uC778 \uBD84\uC11D, \uBE44\uAD50\xB7\uD310\uB2E8, \uACC4\uC0B0 \uD574\uC11D): \uCD5C\uC18C 30%
L3. \u3010\uB0B4\uC6A9 \uBC94\uC704\u3011\uD559\uC2B5 \uC790\uB8CC \uC804\uCCB4\uB97C \uACE0\uB974\uAC8C \uB2E4\uB8E8\uC138\uC694. \uD55C \uC8FC\uC81C\uC5D0\uB9CC \uC9D1\uC911\uD558\uC9C0 \uB9C8\uC138\uC694.
L4. \u3010\uBB38\uC81C \uB3C5\uB9BD\uC131\u3011\uAC01 \uBB38\uC81C\uB294 \uB2E4\uB978 \uBB38\uC81C\uB97C \uD480\uC9C0 \uC54A\uC544\uB3C4 \uB3C5\uB9BD\uC801\uC73C\uB85C \uD480 \uC218 \uC788\uC5B4\uC57C \uD569\uB2C8\uB2E4.
L5. \u3010\uC911\uBCF5 \uAE08\uC9C0\u3011\uB3D9\uC77C \uAC1C\uB150\uC744 \uBB3B\uB294 \uBB38\uC81C\uB97C \uBC18\uBCF5 \uCD9C\uC81C\uD558\uC9C0 \uB9C8\uC138\uC694.
L6. \u3010question \uC791\uC131 \uADDC\uCE59\u3011
   - \uB9C8\uD06C\uB2E4\uC6B4 \uD615\uC2DD \uC801\uADF9 \uD65C\uC6A9: \uD45C\uB294 | col | col | \uD615\uC2DD, \uAC15\uC870\uB294 **\uAD75\uAC8C**, \uCF54\uB4DC\uB294 \`\uC778\uB77C\uC778\`
   - \uC218\uCE58 \uB370\uC774\uD130\xB7\uBE44\uAD50 \uC790\uB8CC\uAC00 \uD544\uC694\uD55C \uBB38\uC81C\uB294 \uB9C8\uD06C\uB2E4\uC6B4 \uD45C\uB85C \uC9C1\uC811 \uC791\uC131\uD558\uC5EC \uBB38\uC81C \uBCF8\uBB38\uC5D0 \uD3EC\uD568
   - \uADF8\uB798\uD504\xB7\uCD94\uC138 \uB370\uC774\uD130\uB294 \uD45C\uB85C \uBCC0\uD658\uD558\uAC70\uB098 \uC218\uCE58\uB97C \uBCF8\uBB38\uC5D0 \uC9C1\uC811 \uC11C\uC220
   - \uC218\uC2DD\xB7\uACF5\uC2DD\xB7\uD480\uC774 \uACFC\uC815\uC744 \uBB38\uC81C \uBCF8\uBB38\uC5D0 \uC9C1\uC811 \uB123\uC9C0 \uB9D0 \uAC83 (\uD559\uC0DD\uC774 \uC54C\uACE0 \uC788\uC5B4\uC57C \uD558\uB294 \uB0B4\uC6A9)
   - [\uC790\uB8CC], [\uC870\uAC74], [\uBCF4\uAE30] \uAC19\uC740 \uB300\uAD04\uD638 \uB808\uC774\uBE14 \uC0AC\uC6A9 \uAE08\uC9C0
   - \uC120\uC9C0 \uBC88\uD638(\u2460\u2461\u2462\u2463)\uB97C question \uC548\uC5D0 \uB123\uC9C0 \uB9D0 \uAC83 (options \uBC30\uC5F4\uC5D0\uB9CC)
L7. \u3010explanation \uC791\uC131 \uADDC\uCE59\u3011
   - \uB2E8\uC21C\uD788 "\uC815\uB2F5\uC740 ~\uC774\uB2E4" \uBC18\uBCF5 \uAE08\uC9C0
   - \uC815\uB2F5\uC778 \uC774\uC720\uB97C \uC6D0\uB9AC\xB7\uBA54\uCEE4\uB2C8\uC998 \uC911\uC2EC\uC73C\uB85C \uC124\uBA85\uD560 \uAC83
   - \uAC1D\uAD00\uC2DD: \uAC01 \uC120\uC9C0(\u2460\u2461\u2462\u2463)\uB9C8\uB2E4 \uB9DE\uACE0 \uD2C0\uB9B0 \uC774\uC720\uB97C \uBC18\uB4DC\uC2DC \\n\\n\uC73C\uB85C \uAD6C\uBD84\uD558\uC5EC \uAC1C\uBCC4 \uC124\uBA85
     \uC608: "\u2460 ~\uC774\uBBC0\uB85C \uC633\uB2E4.\\n\\n\u2461 ~\uC774\uBBC0\uB85C \uD2C0\uB9AC\uB2E4. ~\uC758 \uAC1C\uB150\uACFC \uD63C\uB3D9\uD558\uAE30 \uC26C\uC6B4\uB370...\\n\\n\u2462 ..."
   - \uAD00\uB828 \uD575\uC2EC \uAC1C\uB150\uC774\uB098 \uC6D0\uB9AC\uB97C \uD574\uC124\uC5D0 \uD3EC\uD568\uD558\uC5EC \uD559\uC2B5 \uAC00\uC774\uB4DC \uC5ED\uD560\uC744 \uD558\uAC8C \uD560 \uAC83

\u2501\u2501\u2501 JSON \uCD9C\uB825 \uD615\uC2DD \u2501\u2501\u2501
- \uC21C\uC218 JSON\uB9CC \uBC18\uD658 (\`\`\`\uB098 \uCD94\uAC00 \uD14D\uC2A4\uD2B8 \uC77C\uC808 \uAE08\uC9C0)
- \uBB38\uC790\uC5F4 \uB0B4 \uC904\uBC14\uAFC8: \\n \uC0AC\uC6A9 (\uC2E4\uC81C \uAC1C\uD589 \uBB38\uC790 \uAE08\uC9C0)
- \uC30D\uB530\uC634\uD45C: \\" \uB85C \uC774\uC2A4\uCF00\uC774\uD504

{"questions": [ ...${count}\uAC1C\uC758 \uBB38\uC81C \uAC1D\uCCB4... ]}

\uC815\uD655\uD788 ${count}\uAC1C\uB97C \uC0DD\uC131\uD558\uC138\uC694.`;
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
function json11(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}
__name(json11, "json11");
__name2(json11, "json");
var GEMINI_API_URL2 = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
var CORS12 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};
async function onRequestOptions13() {
  return new Response(null, { status: 204, headers: CORS12 });
}
__name(onRequestOptions13, "onRequestOptions13");
__name2(onRequestOptions13, "onRequestOptions");
async function onRequestPost11(context) {
  const { request, env } = context;
  const apiKey = env.GEMINI_API_KEY || env["GEMINI_API_KEY "] || "";
  if (!apiKey) return json12({ correct: null }, 500);
  let body;
  try {
    body = await request.json();
  } catch {
    return json12({ error: "parse error" }, 400);
  }
  const { userAnswer, correctAnswer } = body;
  if (!userAnswer || !correctAnswer) return json12({ error: "missing params" }, 400);
  const prompt = `\uC815\uB2F5: "${correctAnswer}"
\uD559\uC0DD \uB2F5\uC548: "${userAnswer}"

\uD559\uC0DD \uB2F5\uC548\uC774 \uC815\uB2F5\uACFC \uAC19\uC740 \uC758\uBBF8\uB97C \uB2F4\uACE0 \uC788\uB294\uC9C0 \uD310\uB2E8\uD558\uC138\uC694.
\uD310\uB2E8 \uAE30\uC900:
- \uD575\uC2EC \uAC1C\uB150/\uD0A4\uC6CC\uB4DC\uAC00 \uBAA8\uB450 \uD3EC\uD568\uB418\uC5B4 \uC788\uC73C\uBA74 \uC815\uB2F5\uC785\uB2C8\uB2E4. \uC5B4\uC21C, \uC870\uC0AC, \uC5B4\uBBF8, \uBB38\uC7A5 \uAD6C\uC870\uAC00 \uB2EC\uB77C\uB3C4 \uB429\uB2C8\uB2E4.
  \uC608: "\uC628\uB3C4 \uC77C\uC815, \uC555\uB825 \uC77C\uC815" = "\uC77C\uC815\uD55C \uC628\uB3C4\uC640 \uC555\uB825" = "T\uC640 P\uAC00 \uC77C\uC815"
  \uC608: "\uC18D\uB3C4\uAC00 \uBE68\uB77C\uC9C4\uB2E4" = "\uC18D\uB3C4 \uC99D\uAC00" = "\uBE60\uB974\uAC8C \uC6C0\uC9C1\uC778\uB2E4"
- \uD654\uD559\uC2DD/\uC218\uC2DD \uD45C\uAE30 \uCC28\uC774\uB294 \uB3D9\uC77C\uD569\uB2C8\uB2E4: PO2=PO\u2082=P_O2, H2O=H\u2082O, T=\uC628\uB3C4, P=\uC555\uB825 \uB4F1
- \uC815\uB2F5\uC5D0 \uC788\uB294 \uD575\uC2EC \uAC1C\uB150 \uC911 \uD558\uB098\uB77C\uB3C4 \uBE60\uC9C0\uAC70\uB098 \uD2C0\uB9B0 \uAC1C\uB150\uC774 \uC788\uC73C\uBA74 \uC624\uB2F5\uC785\uB2C8\uB2E4.

JSON\uC73C\uB85C\uB9CC \uC751\uB2F5\uD558\uC138\uC694: {"correct":true} \uB610\uB294 {"correct":false}`;
  try {
    const res = await fetch(`${GEMINI_API_URL2}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0,
          maxOutputTokens: 20,
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    });
    if (!res.ok) return json12({ correct: null }, 502);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const result = JSON.parse(text);
    return json12({ correct: !!result.correct });
  } catch {
    return json12({ correct: null }, 500);
  }
}
__name(onRequestPost11, "onRequestPost11");
__name2(onRequestPost11, "onRequestPost");
function json12(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS12 });
}
__name(json12, "json12");
__name2(json12, "json");
var PROJECT_ID12 = "gwatop-8edaf";
var FIRESTORE_BASE8 = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID12}/databases/(default)/documents`;
var ALGOLIA_INDEX2 = "posts";
var _cachedToken8 = null;
var _tokenExpiry8 = 0;
var _publicKeys4 = null;
var _publicKeysExpiry4 = 0;
async function getFirebasePublicKeys4() {
  const now = Date.now();
  if (_publicKeys4 && _publicKeysExpiry4 > now) return _publicKeys4;
  const res = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
  if (!res.ok) throw new Error("\uACF5\uAC1C\uD0A4 \uC870\uD68C \uC2E4\uD328");
  const data = await res.json();
  const maxAgeMatch = (res.headers.get("Cache-Control") || "").match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1]) * 1e3 : 36e5;
  _publicKeys4 = data.keys;
  _publicKeysExpiry4 = now + Math.min(maxAge, 36e5);
  return _publicKeys4;
}
__name(getFirebasePublicKeys4, "getFirebasePublicKeys4");
__name2(getFirebasePublicKeys4, "getFirebasePublicKeys");
async function getServiceAccountToken(clientEmail, privateKey, kv) {
  const now = Math.floor(Date.now() / 1e3);
  if (kv) {
    const cached = await kv.get("firebase_admin_token", "json");
    if (cached && cached.expiry - now > 300) return cached.token;
  } else if (_cachedToken8 && _tokenExpiry8 - now > 300) return _cachedToken8;
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
  _cachedToken8 = tokenData.access_token;
  _tokenExpiry8 = now + 3600;
  if (kv) {
    await kv.put("firebase_admin_token", JSON.stringify({ token: tokenData.access_token, expiry: now + 3600 }), { expirationTtl: 3500 });
  }
  return _cachedToken8;
}
__name(getServiceAccountToken, "getServiceAccountToken");
__name2(getServiceAccountToken, "getServiceAccountToken");
async function deletePostLikes(postId, accessToken) {
  try {
    const res = await fetch(`${FIRESTORE_BASE8}:runQuery`, {
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
var CORS13 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json"
};
async function onRequestOptions14() {
  return new Response(null, { status: 204, headers: CORS13 });
}
__name(onRequestOptions14, "onRequestOptions14");
__name2(onRequestOptions14, "onRequestOptions");
async function verifyFirebaseToken8(idToken) {
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;
    const decode = /* @__PURE__ */ __name2((b64) => JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))
    )), "decode");
    const header = decode(parts[0]);
    const payload = decode(parts[1]);
    const now = Math.floor(Date.now() / 1e3);
    if (payload.exp < now) return null;
    if (payload.aud !== PROJECT_ID12) return null;
    if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID12}`) return null;
    if (!payload.sub) return null;
    const keys = await getFirebasePublicKeys4();
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const cryptoKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const sig = Uint8Array.from(atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, sig, new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!valid) return null;
    return { localId: payload.sub, email: payload.email, displayName: payload.name };
  } catch {
    return null;
  }
}
__name(verifyFirebaseToken8, "verifyFirebaseToken8");
__name2(verifyFirebaseToken8, "verifyFirebaseToken");
async function onRequestPost12(context) {
  const { request, env } = context;
  const authHeader = request.headers.get("Authorization") || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) return json13({ error: "\uC778\uC99D \uD544\uC694" }, 401);
  const user = await verifyFirebaseToken8(idToken);
  if (!user) return json13({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uD1A0\uD070" }, 401);
  let body;
  try {
    body = await request.json();
  } catch {
    return json13({ error: "\uC694\uCCAD \uD30C\uC2F1 \uC2E4\uD328" }, 400);
  }
  const { action, postId, post } = body;
  if (!action || !postId) return json13({ error: "\uD544\uC218 \uD30C\uB77C\uBBF8\uD130 \uB204\uB77D" }, 400);
  const appId = env.ALGOLIA_APP_ID;
  const adminKey = env.ALGOLIA_ADMIN_KEY;
  if (!appId || !adminKey) return json13({ error: "Algolia \uD658\uACBD \uBCC0\uC218 \uC5C6\uC74C" }, 500);
  const algoliaBase = `https://${appId}.algolia.net/1/indexes/${ALGOLIA_INDEX2}`;
  const headers = {
    "X-Algolia-Application-Id": appId,
    "X-Algolia-API-Key": adminKey,
    "Content-Type": "application/json"
  };
  if (action === "remove") {
    if (post?.uid && post.uid !== user.localId) return json13({ error: "\uAD8C\uD55C \uC5C6\uC74C" }, 403);
    const algoliaDelete = fetch(`${algoliaBase}/${postId}`, { method: "DELETE", headers });
    const postLikesCleanup = env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY ? getServiceAccountToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY, env.GWATOP_CACHE).then((token) => deletePostLikes(postId, token)).catch(() => {
    }) : Promise.resolve();
    const [algoliaRes] = await Promise.all([algoliaDelete, postLikesCleanup]);
    if (!algoliaRes.ok && algoliaRes.status !== 404) {
      return json13({ error: `Algolia \uC0AD\uC81C \uC2E4\uD328: ${algoliaRes.status}` }, 500);
    }
    return json13({ success: true });
  }
  if (action === "add") {
    if (!post) return json13({ error: "post \uB370\uC774\uD130 \uD544\uC694" }, 400);
    if (post.uid !== user.localId) return json13({ error: "\uAD8C\uD55C \uC5C6\uC74C" }, 403);
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
      imageUrl: post.imageUrl || "",
      imageUrls: Array.isArray(post.imageUrls) ? post.imageUrls : [],
      category: post.category || ""
    };
    const res = await fetch(`${algoliaBase}/${postId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(record)
    });
    if (!res.ok) {
      return json13({ error: `Algolia \uC778\uB371\uC2F1 \uC2E4\uD328: ${res.status}` }, 500);
    }
    return json13({ success: true });
  }
  return json13({ error: "\uC54C \uC218 \uC5C6\uB294 action" }, 400);
}
__name(onRequestPost12, "onRequestPost12");
__name2(onRequestPost12, "onRequestPost");
function json13(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS13 });
}
__name(json13, "json13");
__name2(json13, "json");
var PROJECT_ID13 = "gwatop-8edaf";
var FIREBASE_WEB_API_KEY5 = "AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ";
var FIRESTORE_BASE9 = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID13}/databases/(default)/documents`;
var DOC_BASE8 = `projects/${PROJECT_ID13}/databases/(default)/documents`;
var _cachedToken9 = null;
var _tokenExpiry9 = 0;
var CORS14 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json"
};
async function onRequestOptions15() {
  return new Response(null, { status: 204, headers: CORS14 });
}
__name(onRequestOptions15, "onRequestOptions15");
__name2(onRequestOptions15, "onRequestOptions");
async function verifyFirebaseToken9(idToken) {
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
__name(verifyFirebaseToken9, "verifyFirebaseToken9");
__name2(verifyFirebaseToken9, "verifyFirebaseToken");
async function getFirebaseAccessToken12(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1e3);
  if (_cachedToken9 && _tokenExpiry9 - now > 300) return _cachedToken9;
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
  _cachedToken9 = tokenData.access_token;
  _tokenExpiry9 = now + 3600;
  return _cachedToken9;
}
__name(getFirebaseAccessToken12, "getFirebaseAccessToken12");
__name2(getFirebaseAccessToken12, "getFirebaseAccessToken");
async function getDocument2(path, accessToken) {
  const res = await fetch(`${FIRESTORE_BASE9}/${path}`, { headers: { "Authorization": `Bearer ${accessToken}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`\uBB38\uC11C \uC77D\uAE30 \uC2E4\uD328 (${res.status})`);
  return res.json();
}
__name(getDocument2, "getDocument2");
__name2(getDocument2, "getDocument");
async function commitWrites2(writes, accessToken) {
  const res = await fetch(`${FIRESTORE_BASE9}:commit`, {
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
async function onRequestPost13(context) {
  const { request, env } = context;
  const authHeader = request.headers.get("Authorization") || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) return json14({ error: "\uC778\uC99D \uD544\uC694" }, 401);
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return json14({ error: "Firebase \uC11C\uBE44\uC2A4 \uACC4\uC815 \uD658\uACBD \uBCC0\uC218 \uC5C6\uC74C" }, 500);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json14({ error: "\uC694\uCCAD \uD30C\uC2F1 \uC2E4\uD328" }, 400);
  }
  const { postId, commentId } = body;
  if (!postId || !commentId) return json14({ error: "\uD544\uC218 \uD30C\uB77C\uBBF8\uD130 \uB204\uB77D" }, 400);
  let user, accessToken;
  try {
    [user, accessToken] = await Promise.all([
      verifyFirebaseToken9(idToken),
      getFirebaseAccessToken12(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY)
    ]);
  } catch {
    return json14({ error: "\uC11C\uBC84 \uC778\uC99D \uC2E4\uD328" }, 500);
  }
  if (!user) return json14({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uD1A0\uD070" }, 401);
  const uid = user.localId;
  try {
    const commentDoc = await getDocument2(`community_posts/${postId}/comments/${commentId}`, accessToken);
    if (!commentDoc) return json14({ error: "\uB313\uAE00\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }, 404);
    if (commentDoc.fields?.deleted?.booleanValue) return json14({ error: "\uC0AD\uC81C\uB41C \uB313\uAE00\uC785\uB2C8\uB2E4." }, 400);
    const likedBy = (commentDoc.fields?.likedBy?.arrayValue?.values || []).map((v2) => v2.stringValue);
    const wasLiked = likedBy.includes(uid);
    const currentLikes = parseInt(commentDoc.fields?.likes?.integerValue || "0");
    const newLikes = wasLiked ? Math.max(0, currentLikes - 1) : currentLikes + 1;
    const newLikedBy = wasLiked ? likedBy.filter((id) => id !== uid) : [...likedBy, uid];
    await commitWrites2([{
      update: {
        name: `${DOC_BASE8}/community_posts/${postId}/comments/${commentId}`,
        fields: {
          likes: { integerValue: String(newLikes) },
          likedBy: { arrayValue: { values: newLikedBy.map((id) => ({ stringValue: id })) } }
        }
      },
      updateMask: { fieldPaths: ["likes", "likedBy"] }
    }], accessToken);
    return json14({ liked: !wasLiked, likes: newLikes });
  } catch (e) {
    return json14({ error: e.message || "\uCC98\uB9AC \uC911 \uC624\uB958 \uBC1C\uC0DD" }, 500);
  }
}
__name(onRequestPost13, "onRequestPost13");
__name2(onRequestPost13, "onRequestPost");
function json14(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS14 });
}
__name(json14, "json14");
__name2(json14, "json");
var PROJECT_ID14 = "gwatop-8edaf";
var FIREBASE_WEB_API_KEY6 = "AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ";
var FIRESTORE_BASE10 = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID14}/databases/(default)/documents`;
var DOC_BASE9 = `projects/${PROJECT_ID14}/databases/(default)/documents`;
var _cachedToken10 = null;
var _tokenExpiry10 = 0;
var _rateLimitMap = /* @__PURE__ */ new Map();
var RATE_LIMIT = 30;
var RATE_WINDOW = 60 * 1e3;
function isRateLimited(uid) {
  const now = Date.now();
  const entry = _rateLimitMap.get(uid);
  if (!entry || now - entry.start > RATE_WINDOW) {
    _rateLimitMap.set(uid, { count: 1, start: now });
    if (_rateLimitMap.size > 1e4) {
      for (const [k, v2] of _rateLimitMap) {
        if (now - v2.start > RATE_WINDOW) _rateLimitMap.delete(k);
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
var CORS15 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json"
};
async function onRequestOptions16() {
  return new Response(null, { status: 204, headers: CORS15 });
}
__name(onRequestOptions16, "onRequestOptions16");
__name2(onRequestOptions16, "onRequestOptions");
async function verifyFirebaseToken10(idToken) {
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
__name(verifyFirebaseToken10, "verifyFirebaseToken10");
__name2(verifyFirebaseToken10, "verifyFirebaseToken");
async function getFirebaseAccessToken13(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1e3);
  if (_cachedToken10 && _tokenExpiry10 - now > 300) return _cachedToken10;
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
  _cachedToken10 = tokenData.access_token;
  _tokenExpiry10 = now + 3600;
  return _cachedToken10;
}
__name(getFirebaseAccessToken13, "getFirebaseAccessToken13");
__name2(getFirebaseAccessToken13, "getFirebaseAccessToken");
async function getDocument3(path, accessToken) {
  const res = await fetch(`${FIRESTORE_BASE10}/${path}`, {
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
  const res = await fetch(`${FIRESTORE_BASE10}:commit`, {
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
async function onRequestPost14(context) {
  const { request, env } = context;
  const authHeader = request.headers.get("Authorization") || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) return json15({ error: "\uC778\uC99D \uD1A0\uD070 \uC5C6\uC74C" }, 401);
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return json15({ error: "Firebase \uC11C\uBE44\uC2A4 \uACC4\uC815 \uD658\uACBD \uBCC0\uC218\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." }, 500);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json15({ error: "\uC694\uCCAD \uD30C\uC2F1 \uC2E4\uD328" }, 400);
  }
  const { postId } = body;
  if (!postId || typeof postId !== "string" || postId.length > 100) {
    return json15({ error: "postId \uD615\uC2DD \uC624\uB958" }, 400);
  }
  let user, accessToken;
  try {
    [user, accessToken] = await Promise.all([
      verifyFirebaseToken10(idToken),
      getFirebaseAccessToken13(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY)
    ]);
  } catch (e) {
    return json15({ error: "\uC11C\uBC84 \uC778\uC99D \uC2E4\uD328" }, 500);
  }
  if (!user) return json15({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uD1A0\uD070" }, 401);
  const uid = user.localId;
  if (isRateLimited(uid)) {
    return json15({ error: "\uC694\uCCAD\uC774 \uB108\uBB34 \uB9CE\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694." }, 429);
  }
  try {
    const [postDoc, likeDoc] = await Promise.all([
      getDocument3(`community_posts/${postId}`, accessToken),
      getDocument3(`post_likes/${postId}_${uid}`, accessToken)
    ]);
    if (!postDoc) return json15({ error: "\uAC8C\uC2DC\uBB3C\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }, 404);
    const authorUid = postDoc.fields?.uid?.stringValue;
    if (!authorUid) return json15({ error: "\uAC8C\uC2DC\uBB3C \uB370\uC774\uD130 \uC624\uB958" }, 500);
    if (authorUid === uid) return json15({ error: "\uC790\uAE30 \uAE00\uC5D0\uB294 \uC88B\uC544\uC694\uB97C \uB204\uB97C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." }, 400);
    const currentLikes = parseInt(postDoc.fields?.likes?.integerValue || "0");
    const wasLiked = likeDoc !== null;
    const newLikes = wasLiked ? Math.max(0, currentLikes - 1) : currentLikes + 1;
    const writes = [];
    if (wasLiked) {
      writes.push({
        delete: `${DOC_BASE9}/post_likes/${postId}_${uid}`,
        currentDocument: { exists: true }
      });
      writes.push({
        transform: {
          document: `${DOC_BASE9}/community_posts/${postId}`,
          fieldTransforms: [{ fieldPath: "likes", increment: { integerValue: "-1" } }]
        }
      });
      if (currentLikes <= 5) {
        writes.push({
          transform: {
            document: `${DOC_BASE9}/users/${authorUid}`,
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
          name: `${DOC_BASE9}/post_likes/${postId}_${uid}`,
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
          document: `${DOC_BASE9}/community_posts/${postId}`,
          fieldTransforms: [{ fieldPath: "likes", increment: { integerValue: "1" } }]
        }
      });
      if (currentLikes < 5) {
        writes.push({
          transform: {
            document: `${DOC_BASE9}/users/${authorUid}`,
            fieldTransforms: [
              { fieldPath: "credits", increment: { integerValue: "1" } },
              { fieldPath: "referralCredits", increment: { integerValue: "1" } }
            ]
          }
        });
      }
    }
    await commitWrites3(writes, accessToken);
    return json15({ liked: !wasLiked, likes: newLikes });
  } catch (e) {
    console.error("like-post error:", e);
    return json15({ error: e.message || "\uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4." }, 500);
  }
}
__name(onRequestPost14, "onRequestPost14");
__name2(onRequestPost14, "onRequestPost");
function json15(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS15 });
}
__name(json15, "json15");
__name2(json15, "json");
var PROJECT_ID15 = "gwatop-8edaf";
var FIRESTORE_BASE11 = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID15}/databases/(default)/documents`;
var ADMIN_EMAIL3 = "hjh2640730@gmail.com";
var _cachedToken11 = null;
var _tokenExpiry11 = 0;
var _publicKeys5 = null;
var _publicKeysExpiry5 = 0;
async function getFirebasePublicKeys5() {
  const now = Date.now();
  if (_publicKeys5 && _publicKeysExpiry5 > now) return _publicKeys5;
  const res = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
  if (!res.ok) throw new Error("\uACF5\uAC1C\uD0A4 \uC870\uD68C \uC2E4\uD328");
  const data = await res.json();
  const maxAgeMatch = (res.headers.get("Cache-Control") || "").match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1]) * 1e3 : 36e5;
  _publicKeys5 = data.keys;
  _publicKeysExpiry5 = now + Math.min(maxAge, 36e5);
  return _publicKeys5;
}
__name(getFirebasePublicKeys5, "getFirebasePublicKeys5");
__name2(getFirebasePublicKeys5, "getFirebasePublicKeys");
async function verifyFirebaseToken11(idToken) {
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;
    const decode = /* @__PURE__ */ __name2((b64) => JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))
    )), "decode");
    const header = decode(parts[0]);
    const payload = decode(parts[1]);
    const now = Math.floor(Date.now() / 1e3);
    if (payload.exp < now) return null;
    if (payload.aud !== PROJECT_ID15) return null;
    if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID15}`) return null;
    if (!payload.sub) return null;
    const keys = await getFirebasePublicKeys5();
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const cryptoKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const sig = Uint8Array.from(atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, sig, new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!valid) return null;
    return { localId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}
__name(verifyFirebaseToken11, "verifyFirebaseToken11");
__name2(verifyFirebaseToken11, "verifyFirebaseToken");
async function getFirebaseAccessToken14(clientEmail, privateKey, kv) {
  const now = Math.floor(Date.now() / 1e3);
  if (kv) {
    const cached = await kv.get("firebase_admin_token", "json");
    if (cached && cached.expiry - now > 300) return cached.token;
  } else if (_cachedToken11 && _tokenExpiry11 - now > 300) return _cachedToken11;
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
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("\uD1A0\uD070 \uBC1C\uAE09 \uC2E4\uD328");
  _cachedToken11 = tokenData.access_token;
  _tokenExpiry11 = now + 3600;
  if (kv) await kv.put("firebase_admin_token", JSON.stringify({ token: tokenData.access_token, expiry: now + 3600 }), { expirationTtl: 3500 });
  return _cachedToken11;
}
__name(getFirebaseAccessToken14, "getFirebaseAccessToken14");
__name2(getFirebaseAccessToken14, "getFirebaseAccessToken");
async function queryCount2(accessToken, filters) {
  const query = { from: [{ collectionId: filters.collection }], limit: filters.limit || 500 };
  if (filters.where) query.where = filters.where;
  const res = await fetch(`${FIRESTORE_BASE11}:runQuery`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: query })
  });
  if (!res.ok) return 0;
  const docs = await res.json();
  return docs.filter((d) => d.document).length;
}
__name(queryCount2, "queryCount2");
__name2(queryCount2, "queryCount");
var CORS16 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json"
};
async function onRequestOptions17() {
  return new Response(null, { status: 204, headers: CORS16 });
}
__name(onRequestOptions17, "onRequestOptions17");
__name2(onRequestOptions17, "onRequestOptions");
async function onRequestGet5(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const idToken = url.searchParams.get("token") || (request.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (!idToken) return json16({ error: "\uC778\uC99D \uD544\uC694" }, 401);
  const user = await verifyFirebaseToken11(idToken);
  if (!user || user.email !== ADMIN_EMAIL3) return json16({ error: "\uAD8C\uD55C \uC5C6\uC74C" }, 403);
  let accessToken;
  try {
    accessToken = await getFirebaseAccessToken14(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY, env.GWATOP_CACHE);
  } catch {
    return json16({ error: "\uC11C\uBC84 \uC778\uC99D \uC2E4\uD328" }, 500);
  }
  const todayKST = new Intl.DateTimeFormat("sv", { timeZone: "Asia/Seoul" }).format(/* @__PURE__ */ new Date());
  const todayStart = `${todayKST}T00:00:00+09:00`;
  const todayStartISO = new Date(todayStart).toISOString();
  const [activeGames, waitingRooms, todayGames, todayUsers, totalPosts, todayQuizzes] = await Promise.all([
    // 진행 중 게임
    queryCount2(accessToken, {
      collection: "games",
      where: {
        compositeFilter: {
          op: "AND",
          filters: [
            { fieldFilter: { field: { fieldPath: "status" }, op: "NOT_EQUAL", value: { stringValue: "waiting" } } },
            { fieldFilter: { field: { fieldPath: "status" }, op: "NOT_EQUAL", value: { stringValue: "finished" } } },
            { fieldFilter: { field: { fieldPath: "status" }, op: "NOT_EQUAL", value: { stringValue: "cancelled" } } }
          ]
        }
      },
      limit: 500
    }),
    // 대기 중 방
    queryCount2(accessToken, {
      collection: "games",
      where: { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "waiting" } } },
      limit: 200
    }),
    // 오늘 생성된 게임
    queryCount2(accessToken, {
      collection: "games",
      where: { fieldFilter: { field: { fieldPath: "createdAt" }, op: "GREATER_THAN_OR_EQUAL", value: { stringValue: todayStart } } },
      limit: 500
    }),
    // 오늘 가입 유저
    queryCount2(accessToken, {
      collection: "users",
      where: { fieldFilter: { field: { fieldPath: "createdAt" }, op: "GREATER_THAN_OR_EQUAL", value: { stringValue: todayStartISO } } },
      limit: 500
    }),
    // 전체 게시글 수 (Algolia 레코드 한도)
    queryCount2(accessToken, { collection: "community_posts", where: null, limit: 500 }),
    // 오늘 퀴즈 생성 수 (Gemini 사용량 지표)
    queryCount2(accessToken, {
      collection: "quizzes",
      where: { fieldFilter: { field: { fieldPath: "createdAt" }, op: "GREATER_THAN_OR_EQUAL", value: { stringValue: todayStartISO } } },
      limit: 500
    })
  ]);
  const estimatedLobbyUsers = Math.max(waitingRooms * 2, activeGames);
  const estimatedDailyReads = estimatedLobbyUsers * 144;
  const estimatedDailyWrites = todayGames * 8;
  const estimatedDailyKvReads = estimatedLobbyUsers * 144;
  const warnings = [];
  if (activeGames > 300) {
    warnings.push({ level: "critical", message: `\uB3D9\uC2DC \uAC8C\uC784 ${activeGames}\uD310`, action: "Firestore \uAD6C\uC870 \uC7AC\uC124\uACC4 \uD544\uC694. \uAC1C\uBC1C\uC790\uC5D0\uAC8C \uBB38\uC758\uD558\uC138\uC694." });
  } else if (activeGames > 100) {
    warnings.push({ level: "warning", message: `\uB3D9\uC2DC \uAC8C\uC784 ${activeGames}\uD310`, action: "\uBAA8\uB2C8\uD130\uB9C1\uC744 \uC720\uC9C0\uD558\uC138\uC694. 300\uD310 \uCD08\uACFC \uC2DC \uC7AC\uC124\uACC4\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." });
  }
  if (waitingRooms > 30) {
    warnings.push({ level: "warning", message: `\uB300\uAE30\uBC29 ${waitingRooms}\uAC1C \uB204\uC801`, action: "cron-job.org\uC5D0\uC11C cleanup \uC2E4\uD589 \uC8FC\uAE30\uB97C 5\uBD84\uC73C\uB85C \uB2E8\uCD95\uD558\uC138\uC694." });
  }
  if (estimatedDailyReads > 4e4) {
    warnings.push({ level: "critical", message: `Firestore \uC77D\uAE30 ~${estimatedDailyReads.toLocaleString()}\uD68C (\uD55C\uB3C4 80% \uCD08\uACFC)`, action: "Firebase \uCF58\uC194\uC5D0\uC11C Blaze \uD50C\uB79C \uD655\uC778. \uB610\uB294 \uD3F4\uB9C1 \uAC04\uACA9\uC744 30\uCD08\uB85C \uB298\uB9AC\uC138\uC694." });
  } else if (estimatedDailyReads > 3e4) {
    warnings.push({ level: "warning", message: `Firestore \uC77D\uAE30 ~${estimatedDailyReads.toLocaleString()}\uD68C (\uD55C\uB3C4 60% \uCD08\uACFC)`, action: "Firebase \uCF58\uC194 \u2192 \uC0AC\uC6A9\uB7C9 \uD0ED\uC5D0\uC11C \uC2E4\uC81C \uC77D\uAE30 \uC218\uB97C \uD655\uC778\uD558\uC138\uC694." });
  }
  if (estimatedDailyWrites > 16e3) {
    warnings.push({ level: "critical", message: `Firestore \uC4F0\uAE30 ~${estimatedDailyWrites.toLocaleString()}\uD68C (\uD55C\uB3C4 80% \uCD08\uACFC)`, action: "Firebase \uCF58\uC194\uC5D0\uC11C Blaze \uD50C\uB79C \uD655\uC778. \uCD08\uACFC\uBD84\uC740 \uC790\uB3D9 \uACFC\uAE08\uB429\uB2C8\uB2E4." });
  } else if (estimatedDailyWrites > 12e3) {
    warnings.push({ level: "warning", message: `Firestore \uC4F0\uAE30 ~${estimatedDailyWrites.toLocaleString()}\uD68C (\uD55C\uB3C4 60% \uCD08\uACFC)`, action: "Firebase \uCF58\uC194 \u2192 \uC0AC\uC6A9\uB7C9 \uD0ED\uC5D0\uC11C \uC2E4\uC81C \uC4F0\uAE30 \uC218\uB97C \uD655\uC778\uD558\uC138\uC694." });
  }
  if (totalPosts > 9e3) {
    warnings.push({ level: "critical", message: `\uAC8C\uC2DC\uAE00 ${totalPosts}\uAC1C (Algolia \uD55C\uB3C4 90% \uCD08\uACFC)`, action: "\uC989\uC2DC Algolia \u2192 Firestore \uAC80\uC0C9\uC73C\uB85C \uAD50\uCCB4\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4. \uAC1C\uBC1C\uC790\uC5D0\uAC8C \uBB38\uC758\uD558\uC138\uC694." });
  } else if (totalPosts > 7e3) {
    warnings.push({ level: "warning", message: `\uAC8C\uC2DC\uAE00 ${totalPosts}\uAC1C (Algolia \uD55C\uB3C4 70% \uCD08\uACFC)`, action: "Algolia \uB300\uC2DC\uBCF4\uB4DC\uC5D0\uC11C \uB808\uCF54\uB4DC \uC218\uB97C \uD655\uC778\uD558\uACE0 \uAD50\uCCB4 \uC2DC\uC810\uC744 \uC900\uBE44\uD558\uC138\uC694." });
  }
  if (todayQuizzes > 300) {
    warnings.push({ level: "warning", message: `\uC624\uB298 \uD034\uC988 \uC0DD\uC131 ${todayQuizzes}\uAC1C (Gemini \uC0AC\uC6A9\uB7C9 \uB192\uC74C)`, action: "Google AI Studio\uC5D0\uC11C \uD560\uB2F9\uB7C9 \uD604\uD669\uC744 \uD655\uC778\uD558\uC138\uC694." });
  }
  if (estimatedDailyKvReads > 8e4) {
    warnings.push({ level: "critical", message: `KV \uC77D\uAE30 ~${estimatedDailyKvReads.toLocaleString()}\uD68C (\uD55C\uB3C4 80% \uCD08\uACFC)`, action: "Cloudflare \uB300\uC2DC\uBCF4\uB4DC\uC5D0\uC11C Workers Paid \uD50C\uB79C($5/\uC6D4)\uC73C\uB85C \uC5C5\uADF8\uB808\uC774\uB4DC\uD558\uC138\uC694." });
  } else if (estimatedDailyKvReads > 6e4) {
    warnings.push({ level: "warning", message: `KV \uC77D\uAE30 ~${estimatedDailyKvReads.toLocaleString()}\uD68C (\uD55C\uB3C4 60% \uCD08\uACFC)`, action: "Cloudflare \uB300\uC2DC\uBCF4\uB4DC\uC5D0\uC11C Workers Paid \uD50C\uB79C \uC5C5\uADF8\uB808\uC774\uB4DC\uB97C \uC900\uBE44\uD558\uC138\uC694." });
  }
  return json16({
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    activeGames,
    waitingRooms,
    todayGames,
    todayUsers,
    totalPosts,
    todayQuizzes,
    estimatedDailyReads,
    estimatedDailyWrites,
    estimatedDailyKvReads,
    warnings
  });
}
__name(onRequestGet5, "onRequestGet5");
__name2(onRequestGet5, "onRequestGet");
function json16(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS16 });
}
__name(json16, "json16");
__name2(json16, "json");
var ADMIN_EMAIL4 = "hjh2640730@gmail.com";
var FIREBASE_WEB_API_KEY7 = "AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ";
var PROJECT_ID16 = "gwatop-8edaf";
var CORS17 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};
async function onRequestOptions18() {
  return new Response(null, { status: 204, headers: CORS17 });
}
__name(onRequestOptions18, "onRequestOptions18");
__name2(onRequestOptions18, "onRequestOptions");
async function onRequestGet6(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const queryUid = url.searchParams.get("uid");
  const all = url.searchParams.get("all") === "1";
  if (!token) return json17({ error: "\uC778\uC99D \uD544\uC694" }, 401);
  const [user, accessToken] = await Promise.all([
    verifyFirebaseToken12(token),
    getFirebaseAccessToken15(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY)
  ]).catch(() => [null, null]);
  if (!user) return json17({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uD1A0\uD070" }, 401);
  const isAdmin = user.email === ADMIN_EMAIL4;
  if ((queryUid || all) && !isAdmin) {
    return json17({ error: "\uAD00\uB9AC\uC790 \uAD8C\uD55C \uD544\uC694" }, 403);
  }
  const targetUid = isAdmin && queryUid ? queryUid : all && isAdmin ? null : user.localId;
  const payments = await getPayments(targetUid, accessToken);
  return json17({ payments });
}
__name(onRequestGet6, "onRequestGet6");
__name2(onRequestGet6, "onRequestGet");
async function getPayments(uid, accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID16}/databases/(default)/documents:runQuery`;
  const structuredQuery = {
    from: [{ collectionId: "payments" }],
    orderBy: [{ field: { fieldPath: "processedAt" }, direction: "DESCENDING" }],
    limit: 100
  };
  if (uid) {
    structuredQuery.where = {
      fieldFilter: {
        field: { fieldPath: "uid" },
        op: "EQUAL",
        value: { stringValue: uid }
      }
    };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery })
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.filter((r) => r.document).map((r) => {
    const f = r.document.fields || {};
    return {
      orderId: f.orderId?.stringValue || r.document.name.split("/").pop(),
      uid: f.uid?.stringValue || "",
      credits: parseInt(f.credits?.integerValue || 0),
      amount: parseInt(f.amount?.integerValue || 0),
      processedAt: parseInt(f.processedAt?.integerValue || 0)
    };
  });
}
__name(getPayments, "getPayments");
__name2(getPayments, "getPayments");
async function verifyFirebaseToken12(idToken) {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY7}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
    );
    if (!res.ok) return null;
    return (await res.json()).users?.[0] || null;
  } catch {
    return null;
  }
}
__name(verifyFirebaseToken12, "verifyFirebaseToken12");
__name2(verifyFirebaseToken12, "verifyFirebaseToken");
async function getFirebaseAccessToken15(clientEmail, privateKey) {
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
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput));
  const sigEncoded = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const jwt = `${signingInput}.${sigEncoded}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("\uD1A0\uD070 \uBC1C\uAE09 \uC2E4\uD328");
  return tokenData.access_token;
}
__name(getFirebaseAccessToken15, "getFirebaseAccessToken15");
__name2(getFirebaseAccessToken15, "getFirebaseAccessToken");
function json17(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS17 });
}
__name(json17, "json17");
__name2(json17, "json");
var PROJECT_ID17 = "gwatop-8edaf";
var ADMIN_EMAIL5 = "hjh2640730@gmail.com";
var FIREBASE_WEB_API_KEY8 = "AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ";
var FIRESTORE_BASE12 = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID17}/databases/(default)/documents`;
var ALGOLIA_INDEX3 = "posts";
var CORS18 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};
async function onRequestOptions19() {
  return new Response(null, { status: 204, headers: CORS18 });
}
__name(onRequestOptions19, "onRequestOptions19");
__name2(onRequestOptions19, "onRequestOptions");
async function verifyFirebaseToken13(idToken) {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY8}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.users?.[0] || null;
  } catch {
    return null;
  }
}
__name(verifyFirebaseToken13, "verifyFirebaseToken13");
__name2(verifyFirebaseToken13, "verifyFirebaseToken");
async function getFirebaseAccessToken16(clientEmail, privateKey) {
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
__name(getFirebaseAccessToken16, "getFirebaseAccessToken16");
__name2(getFirebaseAccessToken16, "getFirebaseAccessToken");
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
async function onRequestPost15(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json18({ error: "\uC694\uCCAD \uD30C\uC2F1 \uC2E4\uD328" }, 400);
  }
  const user = await verifyFirebaseToken13(body.token || "");
  if (!user || user.email !== ADMIN_EMAIL5) {
    return json18({ error: "\uAD00\uB9AC\uC790 \uAD8C\uD55C \uC5C6\uC74C" }, 403);
  }
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return json18({ error: "Firebase \uC11C\uBE44\uC2A4 \uACC4\uC815 \uD658\uACBD \uBCC0\uC218 \uC5C6\uC74C" }, 500);
  }
  if (!env.ALGOLIA_APP_ID || !env.ALGOLIA_ADMIN_KEY) {
    return json18({ error: "Algolia \uD658\uACBD \uBCC0\uC218 \uC5C6\uC74C" }, 500);
  }
  const accessToken = await getFirebaseAccessToken16(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
  const algoliaBase = `https://${env.ALGOLIA_APP_ID}.algolia.net/1/indexes/${ALGOLIA_INDEX3}`;
  const algoliaHeaders = {
    "X-Algolia-Application-Id": env.ALGOLIA_APP_ID,
    "X-Algolia-API-Key": env.ALGOLIA_ADMIN_KEY,
    "Content-Type": "application/json"
  };
  let pageToken = null;
  let totalIndexed = 0;
  do {
    const url = `${FIRESTORE_BASE12}/community_posts?pageSize=100${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${accessToken}` } });
    if (!res.ok) return json18({ error: `Firestore \uC77D\uAE30 \uC2E4\uD328: ${res.status}` }, 500);
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
      return json18({ error: `Algolia \uBC30\uCE58 \uC2E4\uD328: ${batchRes.status}` }, 500);
    }
    totalIndexed += docs.length;
  } while (pageToken);
  return json18({ success: true, totalIndexed });
}
__name(onRequestPost15, "onRequestPost15");
__name2(onRequestPost15, "onRequestPost");
function json18(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS18 });
}
__name(json18, "json18");
__name2(json18, "json");
var ADMIN_EMAIL6 = "hjh2640730@gmail.com";
var FIREBASE_WEB_API_KEY9 = "AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ";
var PROJECT_ID18 = "gwatop-8edaf";
var BASE2 = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID18}/databases/(default)/documents`;
var CORS19 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};
async function onRequestOptions20() {
  return new Response(null, { status: 204, headers: CORS19 });
}
__name(onRequestOptions20, "onRequestOptions20");
__name2(onRequestOptions20, "onRequestOptions");
async function onRequestPost16(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json19({ error: "parse error" }, 400);
  }
  const { token, target, title, body: msgBody, rewardType, rewardAmount } = body;
  if (!token) return json19({ error: "\uC778\uC99D \uD544\uC694" }, 401);
  const user = await verifyFirebaseToken14(token);
  if (!user || user.email !== ADMIN_EMAIL6) return json19({ error: "\uAD00\uB9AC\uC790 \uAD8C\uD55C \uD544\uC694" }, 403);
  if (!title?.trim() || !msgBody?.trim()) return json19({ error: "\uC81C\uBAA9\uACFC \uB0B4\uC6A9 \uD544\uC694" }, 400);
  if (!target) return json19({ error: "target \uD544\uC694" }, 400);
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return json19({ error: "\uC11C\uBC84 \uD658\uACBD \uBCC0\uC218 \uC5C6\uC74C" }, 500);
  const accessToken = await getFirebaseAccessToken17(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY);
  const reward = rewardType === "freePoints" ? Math.max(0, parseInt(rewardAmount) || 0) : 0;
  const fields = {
    title: { stringValue: title.trim().slice(0, 100) },
    body: { stringValue: msgBody.trim().slice(0, 2e3) },
    rewardType: { stringValue: reward > 0 ? "freePoints" : "none" },
    rewardAmount: { integerValue: String(reward) },
    createdAt: { timestampValue: (/* @__PURE__ */ new Date()).toISOString() }
  };
  if (target === "all") {
    const res = await fetch(`${BASE2}/global_messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields })
    });
    if (!res.ok) return json19({ error: "\uC804\uC1A1 \uC2E4\uD328" }, 500);
    return json19({ success: true, type: "global" });
  } else {
    const inboxFields = { ...fields, claimed: { booleanValue: false }, read: { booleanValue: false } };
    const res = await fetch(`${BASE2}/users/${target}/inbox`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: inboxFields })
    });
    if (!res.ok) return json19({ error: "\uC804\uC1A1 \uC2E4\uD328" }, 500);
    return json19({ success: true, type: "inbox" });
  }
}
__name(onRequestPost16, "onRequestPost16");
__name2(onRequestPost16, "onRequestPost");
async function verifyFirebaseToken14(idToken) {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY9}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
    );
    if (!res.ok) return null;
    return (await res.json()).users?.[0] || null;
  } catch {
    return null;
  }
}
__name(verifyFirebaseToken14, "verifyFirebaseToken14");
__name2(verifyFirebaseToken14, "verifyFirebaseToken");
async function getFirebaseAccessToken17(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1e3);
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
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("\uD1A0\uD070 \uBC1C\uAE09 \uC2E4\uD328");
  return tokenData.access_token;
}
__name(getFirebaseAccessToken17, "getFirebaseAccessToken17");
__name2(getFirebaseAccessToken17, "getFirebaseAccessToken");
function json19(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS19 });
}
__name(json19, "json19");
__name2(json19, "json");
var PROJECT_ID19 = "gwatop-8edaf";
var FIREBASE_WEB_API_KEY10 = "AIzaSyAsxkIpwlBa0rD6FyzsrB0sdlovQoCPtcQ";
var FIRESTORE_BASE13 = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID19}/databases/(default)/documents`;
var DOC_BASE10 = `projects/${PROJECT_ID19}/databases/(default)/documents`;
var _cachedToken12 = null;
var _tokenExpiry12 = 0;
var CORS20 = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json"
};
async function onRequestOptions21() {
  return new Response(null, { status: 204, headers: CORS20 });
}
__name(onRequestOptions21, "onRequestOptions21");
__name2(onRequestOptions21, "onRequestOptions");
async function verifyFirebaseToken15(idToken) {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY10}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
    );
    if (!res.ok) return null;
    return (await res.json()).users?.[0] || null;
  } catch {
    return null;
  }
}
__name(verifyFirebaseToken15, "verifyFirebaseToken15");
__name2(verifyFirebaseToken15, "verifyFirebaseToken");
async function getFirebaseAccessToken18(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1e3);
  if (_cachedToken12 && _tokenExpiry12 - now > 300) return _cachedToken12;
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iss: clientEmail, sub: clientEmail, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600, scope: "https://www.googleapis.com/auth/datastore" };
  const encode = /* @__PURE__ */ __name2((obj) => btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""), "encode");
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const pem = privateKey.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\\n/g, "").replace(/\r/g, "").replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", keyData.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput));
  const sigEncoded = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const jwt = `${signingInput}.${sigEncoded}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("\uD1A0\uD070 \uBC1C\uAE09 \uC2E4\uD328");
  _cachedToken12 = tokenData.access_token;
  _tokenExpiry12 = now + 3600;
  return _cachedToken12;
}
__name(getFirebaseAccessToken18, "getFirebaseAccessToken18");
__name2(getFirebaseAccessToken18, "getFirebaseAccessToken");
async function onRequestPost17(context) {
  const { request, env } = context;
  const idToken = (request.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (!idToken) return json20({ error: "\uC778\uC99D \uD544\uC694" }, 401);
  let body;
  try {
    body = await request.json();
  } catch {
    return json20({ error: "\uC694\uCCAD \uD30C\uC2F1 \uC2E4\uD328" }, 400);
  }
  const { postId, optionIndex } = body;
  if (!postId || optionIndex === void 0) return json20({ error: "\uD544\uC218 \uD30C\uB77C\uBBF8\uD130 \uB204\uB77D" }, 400);
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return json20({ error: "\uC11C\uBC84 \uD658\uACBD \uBCC0\uC218 \uC5C6\uC74C" }, 500);
  let user, accessToken;
  try {
    [user, accessToken] = await Promise.all([
      verifyFirebaseToken15(idToken),
      getFirebaseAccessToken18(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY)
    ]);
  } catch {
    return json20({ error: "\uC11C\uBC84 \uC778\uC99D \uC2E4\uD328" }, 500);
  }
  if (!user) return json20({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uD1A0\uD070" }, 401);
  const uid = user.localId;
  const postRes = await fetch(`${FIRESTORE_BASE13}/community_posts/${postId}`, {
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  if (!postRes.ok) return json20({ error: "\uAC8C\uC2DC\uAE00 \uC5C6\uC74C" }, 404);
  const postDoc = await postRes.json();
  const pollOptionsRaw = postDoc.fields?.pollOptions?.arrayValue?.values || [];
  if (!pollOptionsRaw.length) return json20({ error: "\uD22C\uD45C\uAC00 \uC5C6\uB294 \uAC8C\uC2DC\uAE00" }, 400);
  if (optionIndex < 0 || optionIndex >= pollOptionsRaw.length) return json20({ error: "\uC798\uBABB\uB41C \uC635\uC158" }, 400);
  const pollVotersRaw = postDoc.fields?.pollVoters?.mapValue?.fields || {};
  const prevVote = pollVotersRaw[uid] !== void 0 ? parseInt(pollVotersRaw[uid].integerValue ?? pollVotersRaw[uid].stringValue ?? "-1") : -1;
  const isCancelling = prevVote === optionIndex;
  const currentVotes = pollOptionsRaw.map((v2) => ({
    text: v2.mapValue?.fields?.text?.stringValue || "",
    votes: parseInt(v2.mapValue?.fields?.votes?.integerValue || "0")
  }));
  if (isCancelling) {
    currentVotes[optionIndex].votes = Math.max(0, currentVotes[optionIndex].votes - 1);
  } else {
    if (prevVote >= 0 && prevVote < currentVotes.length) {
      currentVotes[prevVote].votes = Math.max(0, currentVotes[prevVote].votes - 1);
    }
    currentVotes[optionIndex].votes += 1;
  }
  const newPollVoters = { ...pollVotersRaw };
  if (isCancelling) {
    delete newPollVoters[uid];
  } else {
    newPollVoters[uid] = { integerValue: String(optionIndex) };
  }
  const commitRes = await fetch(`${FIRESTORE_BASE13}:commit`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      writes: [{
        update: {
          name: `${DOC_BASE10}/community_posts/${postId}`,
          fields: {
            pollOptions: {
              arrayValue: {
                values: currentVotes.map((opt) => ({
                  mapValue: {
                    fields: {
                      text: { stringValue: opt.text },
                      votes: { integerValue: String(opt.votes) }
                    }
                  }
                }))
              }
            },
            pollVoters: { mapValue: { fields: newPollVoters } }
          }
        },
        updateMask: { fieldPaths: ["pollOptions", "pollVoters"] }
      }]
    })
  });
  if (!commitRes.ok) return json20({ error: "\uD22C\uD45C \uCC98\uB9AC \uC2E4\uD328" }, 500);
  return json20({
    success: true,
    voted: !isCancelling,
    votedOption: isCancelling ? -1 : optionIndex,
    votes: currentVotes.map((v2) => v2.votes)
  });
}
__name(onRequestPost17, "onRequestPost17");
__name2(onRequestPost17, "onRequestPost");
function json20(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS20 });
}
__name(json20, "json20");
__name2(json20, "json");
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
    routePath: "/api/alert",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/alert",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions2]
  },
  {
    routePath: "/api/attendance",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions3]
  },
  {
    routePath: "/api/attendance",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/auth-social",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions4]
  },
  {
    routePath: "/api/auth-social",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/api/claim-reward",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions5]
  },
  {
    routePath: "/api/claim-reward",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost4]
  },
  {
    routePath: "/api/cleanup-games",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/api/cleanup-games",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions6]
  },
  {
    routePath: "/api/comment",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions7]
  },
  {
    routePath: "/api/comment",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost5]
  },
  {
    routePath: "/api/confirm-payment",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions8]
  },
  {
    routePath: "/api/confirm-payment",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost6]
  },
  {
    routePath: "/api/delete-account",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions9]
  },
  {
    routePath: "/api/delete-account",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost7]
  },
  {
    routePath: "/api/edit-post",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions10]
  },
  {
    routePath: "/api/edit-post",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost8]
  },
  {
    routePath: "/api/game-rps",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions11]
  },
  {
    routePath: "/api/game-rps",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost9]
  },
  {
    routePath: "/api/generate-quiz",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet4]
  },
  {
    routePath: "/api/generate-quiz",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions12]
  },
  {
    routePath: "/api/generate-quiz",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost10]
  },
  {
    routePath: "/api/grade-short",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions13]
  },
  {
    routePath: "/api/grade-short",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost11]
  },
  {
    routePath: "/api/index-post",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions14]
  },
  {
    routePath: "/api/index-post",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost12]
  },
  {
    routePath: "/api/like-comment",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions15]
  },
  {
    routePath: "/api/like-comment",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost13]
  },
  {
    routePath: "/api/like-post",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions16]
  },
  {
    routePath: "/api/like-post",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost14]
  },
  {
    routePath: "/api/monitor",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet5]
  },
  {
    routePath: "/api/monitor",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions17]
  },
  {
    routePath: "/api/payment-history",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet6]
  },
  {
    routePath: "/api/payment-history",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions18]
  },
  {
    routePath: "/api/reindex-posts",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions19]
  },
  {
    routePath: "/api/reindex-posts",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost15]
  },
  {
    routePath: "/api/send-message",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions20]
  },
  {
    routePath: "/api/send-message",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost16]
  },
  {
    routePath: "/api/vote",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions21]
  },
  {
    routePath: "/api/vote",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost17]
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

// .wrangler/tmp/bundle-11A9Hz/middleware-insertion-facade.js
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

// .wrangler/tmp/bundle-11A9Hz/middleware-loader.entry.ts
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
//# sourceMappingURL=functionsWorker-0.9526881933305174.js.map
