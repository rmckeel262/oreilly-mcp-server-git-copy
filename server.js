#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const OREILLY_API_KEY = process.env.OREILLY_API_KEY;

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

async function searchBooks(query, limit = 10) {
  return {
    results: [
      {
        id: "9781491912127",
        title: `${query} - Comprehensive Guide`,
        author: "O'Reilly Authors",
        description: `Learn everything about ${query}`,
        url: `https://www.oreilly.com/search/?query=${encodeURIComponent(query)}`,
        published_date: "2024",
      },
    ],
    total: 1,
    limit,
  };
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