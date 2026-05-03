#!/usr/bin/env node
import http from "node:http";
import https from "node:https";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OREILLY_API_KEY = process.env.OREILLY_API_KEY;
const OREILLY_SEARCH_API_URL =
  process.env.OREILLY_SEARCH_API_URL ?? "https://learning.oreilly.com/api/v2/search/";
const OREILLY_API_TIMEOUT_MS = 10000;
const OREILLY_MAX_REDIRECTS = 5;
const PORT = Number(process.env.PORT ?? 4173);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.join(__dirname, "web");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

function parseErrorMessage(payload, rawBody) {
  if (typeof payload === "string" && payload.trim().length > 0) {
    return payload.trim();
  }
  if (payload && typeof payload === "object") {
    if (typeof payload.detail === "string" && payload.detail.trim().length > 0) {
      return payload.detail.trim();
    }
    if (typeof payload.message === "string" && payload.message.trim().length > 0) {
      return payload.message.trim();
    }
  }
  if (typeof rawBody === "string" && rawBody.trim().length > 0) {
    return rawBody.trim().slice(0, 300);
  }
  return "Unknown API error";
}

function isRedirectStatus(statusCode) {
  return [301, 302, 303, 307, 308].includes(statusCode);
}

function getJson(url, headers, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: "GET", headers }, (res) => {
      let rawBody = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        rawBody += chunk;
      });
      res.on("end", () => {
        const statusCode = res.statusCode ?? 0;
        const locationHeader = res.headers.location;
        if (isRedirectStatus(statusCode) && locationHeader) {
          if (redirectCount >= OREILLY_MAX_REDIRECTS) {
            reject(new Error(`Exceeded maximum redirects (${OREILLY_MAX_REDIRECTS})`));
            return;
          }

          const nextUrl = new URL(locationHeader, url).toString();
          getJson(nextUrl, headers, redirectCount + 1).then(resolve).catch(reject);
          return;
        }

        let payload = null;
        if (rawBody.length > 0) {
          try {
            payload = JSON.parse(rawBody);
          } catch {
            payload = null;
          }
        }
        resolve({
          statusCode,
          payload,
          rawBody,
        });
      });
    });

    req.setTimeout(OREILLY_API_TIMEOUT_MS, () => {
      req.destroy(new Error(`request timed out after ${OREILLY_API_TIMEOUT_MS}ms`));
    });
    req.on("error", reject);
    req.end();
  });
}

function parseAuthors(authors) {
  if (!Array.isArray(authors)) {
    return "";
  }
  return authors
    .map((author) =>
      typeof author === "string" ? author : author?.name ?? author?.full_name ?? ""
    )
    .filter(Boolean)
    .join(", ");
}

function toAbsoluteOReillyUrl(pathOrUrl) {
  if (!pathOrUrl) {
    return null;
  }
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  return `https://www.oreilly.com${pathOrUrl}`;
}

async function searchBooks(query, limit) {
  const searchUrl = new URL(OREILLY_SEARCH_API_URL);
  searchUrl.searchParams.set("query", query);
  searchUrl.searchParams.set("formats", "book");
  searchUrl.searchParams.set("sort", "relevance");
  searchUrl.searchParams.set("page", "0");
  searchUrl.searchParams.set("include_facets", "false");

  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${OREILLY_API_KEY}`,
    "X-API-Key": OREILLY_API_KEY,
    "User-Agent": "oreilly-learning-app/1.0.0",
  };

  const { statusCode, payload, rawBody } = await getJson(searchUrl.toString(), headers);

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(
      `O'Reilly search failed (${statusCode}): ${parseErrorMessage(payload, rawBody)}`
    );
  }

  const allResults = Array.isArray(payload?.results) ? payload.results : [];
  const results = allResults.slice(0, limit).map((book) => ({
    id: book.archive_id ?? book.isbn ?? book.id ?? "",
    title: book.title ?? "Untitled",
    author: parseAuthors(book.authors),
    description: book.description ?? "",
    url:
      toAbsoluteOReillyUrl(book.web_url) ??
      toAbsoluteOReillyUrl(book.url) ??
      `https://www.oreilly.com/search/?query=${encodeURIComponent(query)}`,
    published_date: book.issued ?? book.date_added ?? null,
  }));

  return {
    query,
    limit,
    total: typeof payload?.total === "number" ? payload.total : allResults.length,
    results,
  };
}

function getSafeFilePath(urlPath) {
  const pathname = urlPath === "/" ? "/index.html" : urlPath;
  const normalizedPath = path
    .normalize(pathname.replace(/^\/+/, ""))
    .replace(/^(\.\.(\/|\\|$))+/, "");
  return path.join(WEB_DIR, normalizedPath);
}

async function serveStaticFile(res, filePath) {
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch {
    sendText(res, 404, "Not Found");
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.method) {
    sendText(res, 400, "Bad Request");
    return;
  }

  const requestUrl = new URL(req.url, `http://localhost:${PORT}`);

  if (requestUrl.pathname === "/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  if (requestUrl.pathname === "/api/search-books" && req.method === "GET") {
    const query = requestUrl.searchParams.get("query")?.trim() ?? "";
    const limitRaw = Number(requestUrl.searchParams.get("limit") ?? 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 10;

    if (!query) {
      sendJson(res, 400, { error: "Query is required." });
      return;
    }

    if (!OREILLY_API_KEY) {
      sendJson(res, 500, {
        error: "Missing OREILLY_API_KEY environment variable.",
      });
      return;
    }

    try {
      const result = await searchBooks(query, limit);
      sendJson(res, 200, result);
      return;
    } catch (error) {
      sendJson(res, 502, { error: error.message });
      return;
    }
  }

  const filePath = getSafeFilePath(requestUrl.pathname);
  if (!filePath.startsWith(WEB_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  await serveStaticFile(res, filePath);
});

server.listen(PORT, () => {
  console.log(`O'Reilly Learning App running at http://localhost:${PORT}`);
});
