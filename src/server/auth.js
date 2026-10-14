import { createHash, randomBytes } from "node:crypto";
import { adminEmail, basePath, cookieSecure, googleClientId, googleClientSecret, googleRedirectUri, sessionSecret } from "./config.js";

const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const inactivityTimeoutMs = 15 * 60 * 1000;
const digest = (value) => createHash("sha256").update(`${sessionSecret}:${value}`).digest("hex");
const normalizedEmail = (email) => String(email || "").trim().toLowerCase();
const secureCookie = process.env.NODE_ENV === "production" || cookieSecure;
const cookieValue = (request, name) => String(request.headers.cookie || "").split(";").map((part) => part.trim().split("=")).find(([key]) => key === name)?.[1] || "";
const assertConfigured = () => {
  if (!googleClientId || !googleClientSecret || !googleRedirectUri || !sessionSecret) throw new Error("OAuth do Google não configurado. Defina GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI e CLAREZA_SESSION_SECRET.");
};

async function exchangeCode(code) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: googleClientId, client_secret: googleClientSecret, redirect_uri: googleRedirectUri, grant_type: "authorization_code" }),
  });
  if (!response.ok) throw new Error("O Google recusou o código de autorização.");
  return response.json();
}

async function readGoogleUser(accessToken) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error("Não foi possível validar a identidade Google.");
  const user = await response.json();
  const email = normalizedEmail(user.email);
  if (!user.email_verified || !email) throw new Error("A conta Google precisa ter e-mail verificado.");
  return { email, name: String(user.name || email), givenName: String(user.given_name || ""), familyName: String(user.family_name || ""), googleSub: String(user.sub || ""), picture: String(user.picture || "") };
}

export function createAuth({ findUser, saveUser, listUsers, saveSession, findSession, touchSession, deleteSession, logger = console }) {
  return {
    begin(request, response) {
      assertConfigured();
      const state = randomBytes(32).toString("base64url");
      response.writeHead(302, {
        Location: `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: googleClientId, redirect_uri: googleRedirectUri, response_type: "code", scope: "openid email profile", state, prompt: "select_account" })}`,
        "Set-Cookie": `clareza_oauth_state=${state}; Max-Age=600; Path=${basePath}; HttpOnly; SameSite=Lax${secureCookie ? "; Secure" : ""}`,
      });
      response.end();
    },
    async callback(request, response) {
      const url = new URL(request.url || "/", "http://localhost");
      const state = url.searchParams.get("state") || "";
      if (!state || cookieValue(request, "clareza_oauth_state") !== state) throw new Error("Estado OAuth inválido ou expirado.");
      const token = await exchangeCode(url.searchParams.get("code") || "");
      const googleUser = await readGoogleUser(token.access_token);
      const existing = await findUser(googleUser.email);
      const user = await saveUser({ ...googleUser, authorized: googleUser.email === adminEmail || Boolean(existing?.authorized), role: googleUser.email === adminEmail ? "admin" : existing?.role || "user" });
      if (!user.authorized) {
        response.writeHead(302, { Location: `${basePath}/?auth=unauthorized`, "Set-Cookie": `clareza_oauth_state=; Max-Age=0; Path=${basePath}; HttpOnly; SameSite=Lax${secureCookie ? "; Secure" : ""}` });
        return response.end();
      }
      const sessionToken = randomBytes(32).toString("base64url");
      await saveSession({ tokenHash: digest(sessionToken), userId: user.id, expiresAt: new Date(Date.now() + sessionLifetimeMs), lastActivityAt: new Date() });
      response.writeHead(302, {
        Location: `${basePath}/`,
        "Set-Cookie": [
          `clareza_session=${sessionToken}; Max-Age=${sessionLifetimeMs / 1000}; Path=${basePath}; HttpOnly; SameSite=Lax${secureCookie ? "; Secure" : ""}`,
          `clareza_oauth_state=; Max-Age=0; Path=${basePath}; HttpOnly; SameSite=Lax${secureCookie ? "; Secure" : ""}`,
        ],
      });
      response.end();
    },
    async current(request) {
      const token = cookieValue(request, "clareza_session");
      if (!token) return null;
      const session = await findSession(digest(token));
      const now = Date.now();
      const lastActivity = session?.lastActivityAt ? new Date(session.lastActivityAt).getTime() : 0;
      return session?.authorized && session.expiresAt && new Date(session.expiresAt).getTime() > now && now - lastActivity <= inactivityTimeoutMs ? session : null;
    },
    async heartbeat(request) {
      const token = cookieValue(request, "clareza_session");
      if (!token) return null;
      const session = await findSession(digest(token));
      const now = Date.now();
      if (!session?.authorized || !session.expiresAt || new Date(session.expiresAt).getTime() <= now || now - new Date(session.lastActivityAt || 0).getTime() > inactivityTimeoutMs) return null;
      await touchSession(digest(token), new Date());
      return { ...session, lastActivityAt: new Date() };
    },
    async logout(request, response) {
      const token = cookieValue(request, "clareza_session");
      if (token) await deleteSession(digest(token));
      response.writeHead(204, { "Set-Cookie": `clareza_session=; Max-Age=0; Path=${basePath}; HttpOnly; SameSite=Lax${secureCookie ? "; Secure" : ""}` });
      response.end();
    },
    users: listUsers,
    async authorize(email, authorized) {
      const normalized = normalizedEmail(email);
      const user = await findUser(normalized);
      if (!user) throw new Error("Usuário não encontrado. Ele precisa entrar com Google uma vez antes da autorização.");
      return saveUser({ ...user, authorized: normalized === adminEmail || Boolean(authorized), role: normalized === adminEmail ? "admin" : user.role });
    },
    adminEmail,
    inactivityTimeoutMs,
    logger,
  };
}
