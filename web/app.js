const searchForm = document.getElementById("searchForm");
const queryInput = document.getElementById("query");
const limitSelect = document.getElementById("limit");
const statusText = document.getElementById("status");
const resultsContainer = document.getElementById("results");
const resultsFilterText = document.getElementById("resultsFilterText");
const resultsSavedFilter = document.getElementById("resultsSavedFilter");
const learningListContainer = document.getElementById("learningList");
const learningFilterText = document.getElementById("learningFilterText");
const learningStatusFilter = document.getElementById("learningStatusFilter");
const savedCount = document.getElementById("savedCount");
const toLearnCount = document.getElementById("toLearnCount");
const inProgressCount = document.getElementById("inProgressCount");
const completedCount = document.getElementById("completedCount");
const completionRate = document.getElementById("completionRate");
const clearListButton = document.getElementById("clearListButton");
const resultCardTemplate = document.getElementById("resultCardTemplate");
const savedItemTemplate = document.getElementById("savedItemTemplate");
const quickTags = [...document.querySelectorAll(".tag")];

const STORAGE_KEY = "oreilly-learning-list";
const DEFAULT_PROGRESS = "to_learn";
const PROGRESS_LABELS = {
  to_learn: "To Learn",
  in_progress: "In Progress",
  completed: "Completed",
};

let learningList = loadLearningList();
let currentResults = [];
let activeQuery = "";
let activeTotal = 0;

function hasProgressStatus(status) {
  return Object.prototype.hasOwnProperty.call(PROGRESS_LABELS, status);
}

function normalizeLearningBook(book) {
  const normalizedStatus = hasProgressStatus(book?.status) ? book.status : DEFAULT_PROGRESS;
  const fallbackId =
    book?.id ?? book?.isbn ?? book?.url ?? `${book?.title ?? "untitled"}-${book?.author ?? ""}`;

  return {
    id: String(fallbackId),
    title: String(book?.title ?? "Untitled"),
    author: String(book?.author ?? ""),
    description: String(book?.description ?? ""),
    url: String(book?.url ?? "#"),
    published_date: book?.published_date ?? null,
    status: normalizedStatus,
  };
}

function loadLearningList() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeLearningBook);
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

function getBookProgress(bookId) {
  const book = learningList.find((item) => item.id === bookId);
  return hasProgressStatus(book?.status) ? book.status : DEFAULT_PROGRESS;
}

function toggleLearningListItem(book) {
  if (inLearningList(book.id)) {
    learningList = learningList.filter((item) => item.id !== book.id);
  } else {
    learningList = [
      normalizeLearningBook({ ...book, status: DEFAULT_PROGRESS }),
      ...learningList,
    ];
  }
  persistLearningList();
  renderLearningList();
  renderResults(currentResults);
  updateSearchStatus();
}

function removeLearningListItem(bookId) {
  learningList = learningList.filter((book) => book.id !== bookId);
  persistLearningList();
  renderLearningList();
  renderResults(currentResults);
  updateSearchStatus();
}

function updateLearningProgress(bookId, progressStatus) {
  if (!hasProgressStatus(progressStatus)) {
    return;
  }
  learningList = learningList.map((book) =>
    book.id === bookId ? { ...book, status: progressStatus } : book
  );
  persistLearningList();
  renderLearningList();
  renderResults(currentResults);
}

function getProgressCounts() {
  return learningList.reduce(
    (counts, book) => {
      const status = hasProgressStatus(book.status) ? book.status : DEFAULT_PROGRESS;
      counts[status] += 1;
      return counts;
    },
    { to_learn: 0, in_progress: 0, completed: 0 }
  );
}

function renderProgressSummary() {
  const counts = getProgressCounts();
  const total = learningList.length;
  const completionPercent = total === 0 ? 0 : Math.round((counts.completed / total) * 100);

  savedCount.textContent = String(total);
  toLearnCount.textContent = String(counts.to_learn);
  inProgressCount.textContent = String(counts.in_progress);
  completedCount.textContent = String(counts.completed);
  completionRate.textContent = `${completionPercent}% completed`;
}

function getFilteredLearningList() {
  const textFilter = (learningFilterText?.value ?? "").trim().toLowerCase();
  const statusFilter = learningStatusFilter?.value ?? "all";

  return learningList.filter((book) => {
    const haystack = `${book.title} ${book.author}`.toLowerCase();
    const matchesText = textFilter.length === 0 || haystack.includes(textFilter);
    const matchesStatus = statusFilter === "all" || book.status === statusFilter;
    return matchesText && matchesStatus;
  });
}

function getFilteredResults(results) {
  const textFilter = (resultsFilterText?.value ?? "").trim().toLowerCase();
  const savedFilter = resultsSavedFilter?.value ?? "all";

  return results.filter((book) => {
    const haystack = `${book.title} ${book.author}`.toLowerCase();
    const matchesText = textFilter.length === 0 || haystack.includes(textFilter);
    const isSaved = inLearningList(book.id);
    const matchesSaved =
      savedFilter === "all" ||
      (savedFilter === "saved" && isSaved) ||
      (savedFilter === "unsaved" && !isSaved);
    return matchesText && matchesSaved;
  });
}

function updateSearchStatus() {
  if (!activeQuery) {
    setStatus("Search to begin your session.");
    return;
  }

  if (currentResults.length === 0) {
    setStatus(`No results found for "${activeQuery}".`);
    return;
  }

  const visibleCount = getFilteredResults(currentResults).length;
  setStatus(
    `Showing ${visibleCount} of ${currentResults.length} loaded results for "${activeQuery}" (API total ${activeTotal}).`
  );
}

function renderLearningList() {
  learningListContainer.innerHTML = "";
  renderProgressSummary();

  if (learningList.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No books saved yet. Add books from search results to build your plan.";
    learningListContainer.append(empty);
    return;
  }

  const filteredBooks = getFilteredLearningList();
  if (filteredBooks.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No saved books match the current filters.";
    learningListContainer.append(empty);
    return;
  }

  for (const book of filteredBooks) {
    const node = savedItemTemplate.content.cloneNode(true);
    const savedItem = node.querySelector(".saved-item");
    savedItem.dataset.status = book.status;

    node.querySelector(".saved-title").textContent = book.title;
    node.querySelector(".saved-meta").textContent =
      `${book.author || "Unknown author"} • ${formatPublishedDate(book.published_date)}`;

    const progressSelect = node.querySelector(".progress-select");
    progressSelect.value = book.status;
    progressSelect.addEventListener("change", (event) =>
      updateLearningProgress(book.id, event.target.value)
    );

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
    if (!activeQuery) {
      return;
    }
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No results found. Try a broader search term.";
    resultsContainer.append(empty);
    return;
  }

  const filteredResults = getFilteredResults(results);
  if (filteredResults.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No results match your current filters.";
    resultsContainer.append(empty);
    return;
  }

  for (const book of filteredResults) {
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
    const progressLabel = PROGRESS_LABELS[getBookProgress(book.id)];
    saveButton.textContent = saved ? `Saved • ${progressLabel}` : "Add to list";
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

  activeQuery = query;
  const limit = Number(limitSelect.value);
  setStatus("Searching O'Reilly catalog...");
  resultsContainer.innerHTML = "";

  try {
    const data = await searchBooks(query, limit);
    activeTotal = Number(data.total ?? 0);
    currentResults = data.results ?? [];
    renderResults(currentResults);
    updateSearchStatus();
  } catch (error) {
    setStatus(`Error: ${error.message}`);
    activeTotal = 0;
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

resultsFilterText.addEventListener("input", () => {
  renderResults(currentResults);
  updateSearchStatus();
});

resultsSavedFilter.addEventListener("change", () => {
  renderResults(currentResults);
  updateSearchStatus();
});

learningFilterText.addEventListener("input", () => {
  renderLearningList();
});

learningStatusFilter.addEventListener("change", () => {
  renderLearningList();
});

clearListButton.addEventListener("click", () => {
  learningList = [];
  persistLearningList();
  renderLearningList();
  renderResults(currentResults);
  updateSearchStatus();
});

renderLearningList();
updateSearchStatus();