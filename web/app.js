const searchForm = document.getElementById("searchForm");
const queryInput = document.getElementById("query");
const limitSelect = document.getElementById("limit");
const statusText = document.getElementById("status");
const resultsContainer = document.getElementById("results");
const learningListContainer = document.getElementById("learningList");
const savedCount = document.getElementById("savedCount");
const clearListButton = document.getElementById("clearListButton");
const resultCardTemplate = document.getElementById("resultCardTemplate");
const savedItemTemplate = document.getElementById("savedItemTemplate");
const quickTags = [...document.querySelectorAll(".tag")];

const STORAGE_KEY = "oreilly-learning-list";
let learningList = loadLearningList();
let currentResults = [];

function loadLearningList() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistLearningList() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(learningList));
}

function setStatus(message) {
  statusText.textContent = message;
}

function stripHtmlTags(input) {
  if (!input) {
    return "";
  }
  return String(input).replace(/<[^>]*>/g, "").trim();
}

function formatPublishedDate(rawDate) {
  if (!rawDate) {
    return "Date unavailable";
  }
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) {
    return String(rawDate);
  }
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function inLearningList(bookId) {
  return learningList.some((book) => book.id === bookId);
}

function toggleLearningListItem(book) {
  if (inLearningList(book.id)) {
    learningList = learningList.filter((item) => item.id !== book.id);
  } else {
    learningList = [book, ...learningList];
  }
  persistLearningList();
  renderLearningList();
  renderResults(currentResults);
}

function removeLearningListItem(bookId) {
  learningList = learningList.filter((book) => book.id !== bookId);
  persistLearningList();
  renderLearningList();
  renderResults(currentResults);
}

function renderLearningList() {
  learningListContainer.innerHTML = "";
  savedCount.textContent = String(learningList.length);

  if (learningList.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No books saved yet. Add books from search results to build your plan.";
    learningListContainer.append(empty);
    return;
  }

  for (const book of learningList) {
    const node = savedItemTemplate.content.cloneNode(true);
    node.querySelector(".saved-title").textContent = book.title;
    node.querySelector(".saved-meta").textContent =
      `${book.author || "Unknown author"} • ${formatPublishedDate(book.published_date)}`;
    const link = node.querySelector(".saved-link");
    link.href = book.url;
    const removeButton = node.querySelector(".remove-button");
    removeButton.addEventListener("click", () => removeLearningListItem(book.id));
    learningListContainer.append(node);
  }
}

function renderResults(results) {
  resultsContainer.innerHTML = "";
  if (!results.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No results found. Try a broader search term.";
    resultsContainer.append(empty);
    return;
  }

  for (const book of results) {
    const node = resultCardTemplate.content.cloneNode(true);
    node.querySelector(".card-title").textContent = book.title;
    node.querySelector(".meta").textContent =
      `${book.author || "Unknown author"} • ${formatPublishedDate(book.published_date)}`;
    node.querySelector(".description").textContent =
      stripHtmlTags(book.description).slice(0, 220) || "No description available.";

    const bookLink = node.querySelector(".book-link");
    bookLink.href = book.url;

    const saveButton = node.querySelector(".save-button");
    const saved = inLearningList(book.id);
    saveButton.textContent = saved ? "Saved" : "Add to list";
    saveButton.classList.toggle("active", saved);
    saveButton.addEventListener("click", () => toggleLearningListItem(book));
    resultsContainer.append(node);
  }
}

async function searchBooks(query, limit) {
  const params = new URLSearchParams({
    query,
    limit: String(limit),
  });

  const response = await fetch(`/api/search-books?${params.toString()}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to search books.");
  }
  return payload;
}

async function handleSearch(event) {
  event.preventDefault();
  const query = queryInput.value.trim();
  if (!query) {
    return;
  }

  const limit = Number(limitSelect.value);
  setStatus("Searching O'Reilly catalog...");
  resultsContainer.innerHTML = "";

  try {
    const data = await searchBooks(query, limit);
    currentResults = data.results ?? [];
    renderResults(currentResults);
    setStatus(`Showing ${currentResults.length} of ${data.total} results for "${query}".`);
  } catch (error) {
    setStatus(`Error: ${error.message}`);
    currentResults = [];
    renderResults([]);
  }
}

searchForm.addEventListener("submit", handleSearch);

quickTags.forEach((tag) => {
  tag.addEventListener("click", () => {
    queryInput.value = tag.dataset.query ?? "";
    searchForm.requestSubmit();
  });
});

clearListButton.addEventListener("click", () => {
  learningList = [];
  persistLearningList();
  renderLearningList();
  renderResults(currentResults);
});

renderLearningList();
