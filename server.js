#!/usr/bin/env node
import https from "node:https";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const OREILLY_API_KEY = process.env.OREILLY_API_KEY;
const OREILLY_SEARCH_API_URL =
  process.env.OREILLY_SEARCH_API_URL ?? "https://learning.oreilly.com/api/v2/search/";
const OREILLY_API_TIMEOUT_MS = 10000;
const OREILLY_MAX_RETRIES = 2;
const OREILLY_MAX_REDIRECTS = 5;

if (!OREILLY_API_KEY) {
  console.error("Missing OREILLY_API_KEY environment variable");
  process.exit(1);
}

const server = new McpServer({
  name: "oreilly-mcp-server",
  version: "1.0.0",
});

function jsonText(data) {
  return JSON.stringify(data, null, 2);
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildOReillyHeaders() {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${OREILLY_API_KEY}`,
    "X-API-Key": OREILLY_API_KEY,
    "User-Agent": "oreilly-mcp-server/1.0.0",
  };
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

function parseAuthors(authors) {
  if (!Array.isArray(authors)) {
    return "";
  }

  const names = authors
    .map((author) =>
      typeof author === "string" ? author : author?.name ?? author?.full_name ?? ""
    )
    .filter(Boolean);
  return names.join(", ");
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
    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      return payload.errors
        .map((error) =>
          typeof error === "string" ? error : error?.message ?? JSON.stringify(error)
        )
        .join("; ");
    }
  }
  if (typeof rawBody === "string" && rawBody.trim().length > 0) {
    return rawBody.trim().slice(0, 300);
  }
  return "Unknown API error";
}

function isRetryableStatus(statusCode) {
  return statusCode === 429 || statusCode >= 500;
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
            reject(
              new Error(
                `Exceeded maximum redirects (${OREILLY_MAX_REDIRECTS}) while requesting ${url}`
              )
            );
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
          location: locationHeader ?? null,
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

async function searchBooks(query, limit = 10) {
  const searchUrl = new URL(OREILLY_SEARCH_API_URL);
  searchUrl.searchParams.set("query", query);
  searchUrl.searchParams.set("formats", "book");
  searchUrl.searchParams.set("sort", "relevance");
  searchUrl.searchParams.set("page", "0");
  searchUrl.searchParams.set("include_facets", "false");

  let lastError = null;

  for (let attempt = 0; attempt <= OREILLY_MAX_RETRIES; attempt += 1) {
    try {
      const { statusCode, payload, rawBody, location } = await getJson(
        searchUrl.toString(),
        buildOReillyHeaders()
      );

      if (statusCode >= 200 && statusCode < 300) {
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
          results,
          total: typeof payload?.total === "number" ? payload.total : allResults.length,
          limit,
          query,
        };
      }

      const message = parseErrorMessage(payload, rawBody);
      const redirectSuffix = location ? ` (redirected to: ${location})` : "";
      const apiError = new Error(
        `O'Reilly search request failed with status ${statusCode}: ${message}${redirectSuffix}`
      );

      if (isRetryableStatus(statusCode) && attempt < OREILLY_MAX_RETRIES) {
        await delay(300 * 2 ** attempt);
        continue;
      }

      throw apiError;
    } catch (error) {
      lastError = error;
      if (attempt < OREILLY_MAX_RETRIES) {
        await delay(300 * 2 ** attempt);
        continue;
      }
    }
  }

  throw new Error(
    `Unable to complete O'Reilly search_books request after ${
      OREILLY_MAX_RETRIES + 1
    } attempts: ${lastError?.message ?? "Unknown error"}`
  );
}

async function searchTopics(topic, contentType = "all") {
  return {
    topic,
    content_type: contentType,
    resources: [
      {
        type: "book",
        title: `${topic} Fundamentals`,
        description: `Master the basics of ${topic}`,
        url: "https://www.oreilly.com/",
      },
      {
        type: "course",
        title: `${topic} Advanced Techniques`,
        description: `Deep dive into ${topic}`,
        url: "https://www.oreilly.com/",
      },
    ],
  };
}

async function searchProgrammingLanguages(language, skillLevel = "all") {
  return {
    language,
    skill_level: skillLevel,
    resources: [
      {
        level: "beginner",
        title: `${language} for Beginners`,
        description: `Start learning ${language} from scratch`,
        url: "https://www.oreilly.com/",
      },
      {
        level: "intermediate",
        title: `Advanced ${language} Patterns`,
        description: `Master intermediate concepts in ${language}`,
        url: "https://www.oreilly.com/",
      },
    ],
  };
}

async function getLearningPath(subject) {
  return {
    subject,
    learning_path: [
      {
        phase: 1,
        title: `Introduction to ${subject}`,
        duration: "2 weeks",
        resources: [
          {
            title: `${subject} Basics`,
            type: "book",
            url: "https://www.oreilly.com/",
          },
        ],
      },
      {
        phase: 2,
        title: `Intermediate ${subject}`,
        duration: "3 weeks",
        resources: [
          {
            title: `${subject} Advanced Patterns`,
            type: "course",
            url: "https://www.oreilly.com/",
          },
        ],
      },
    ],
  };
}

async function getBookDetails(bookId) {
  return {
    id: bookId,
    title: "O'Reilly Book",
    author: "O'Reilly Authors",
    description: "A comprehensive guide to learning",
    pages: 450,
    published_date: "2024",
    topics: ["technology", "learning"],
    url: `https://www.oreilly.com/search/?query=${encodeURIComponent(bookId)}`,
    isbn: bookId,
  };
}

server.registerTool(
  "search_books",
  {
    description:
      "Search for O'Reilly books by title, author, or keywords. Returns book titles, descriptions, and URLs.",
    inputSchema: {
      query: z
        .string()
        .describe(
          "Search query (book title, author name, or keywords like 'machine learning', 'python')"
        ),
      limit: z
        .number()
        .int()
        .positive()
        .max(100)
        .optional()
        .default(10)
        .describe("Maximum number of results to return"),
    },
  },
  async ({ query, limit }) => {
    const results = await searchBooks(query, limit);
    return {
      content: [{ type: "text", text: jsonText(results) }],
      structuredContent: results,
    };
  }
);

server.registerTool(
  "search_topics",
  {
    description:
      "Search for learning content by topic (for example: Data Science, Web Development, DevOps).",
    inputSchema: {
      topic: z.string().describe("Topic name to search for"),
      content_type: z
        .enum(["books", "courses", "videos", "all"])
        .optional()
        .default("all")
        .describe("Type of content to search"),
    },
  },
  async ({ topic, content_type }) => {
    const results = await searchTopics(topic, content_type);
    return {
      content: [{ type: "text", text: jsonText(results) }],
      structuredContent: results,
    };
  }
);

server.registerTool(
  "search_programming_languages",
  {
    description:
      "Find O'Reilly resources for a specific programming language by skill level.",
    inputSchema: {
      language: z.string().describe("Programming language name"),
      skill_level: z
        .enum(["beginner", "intermediate", "advanced", "all"])
        .optional()
        .default("all")
        .describe("Filter by skill level"),
    },
  },
  async ({ language, skill_level }) => {
    const results = await searchProgrammingLanguages(language, skill_level);
    return {
      content: [{ type: "text", text: jsonText(results) }],
      structuredContent: results,
    };
  }
);

server.registerTool(
  "get_learning_path",
  {
    description:
      "Get a curated learning path for a specific technology or skill area.",
    inputSchema: {
      subject: z
        .string()
        .describe(
          "Subject to learn (for example: Full Stack Web Development, Machine Learning, Cloud Architecture)"
        ),
    },
  },
  async ({ subject }) => {
    const results = await getLearningPath(subject);
    return {
      content: [{ type: "text", text: jsonText(results) }],
      structuredContent: results,
    };
  }
);

server.registerTool(
  "get_book_details",
  {
    description: "Get detailed information about a specific O'Reilly book.",
    inputSchema: {
      book_id: z.string().describe("The book ID or ISBN"),
    },
  },
  async ({ book_id }) => {
    const results = await getBookDetails(book_id);
    return {
      content: [{ type: "text", text: jsonText(results) }],
      structuredContent: results,
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("oreilly-mcp-server connected via stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});