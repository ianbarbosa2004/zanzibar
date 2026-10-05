export function filterEntries(entries, {
  query = "",
  fields = [],
  filters = {},
} = {}) {
  const normalizedQuery = query.toLowerCase().trim();
  return entries.filter((entry) => {
    const searchable = fields.map((field) => entry[field] || "").join(" ").toLowerCase();
    const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
    const matchesFilters = Object.entries(filters).every(([field, value]) => !value || value === "all" || entry[field] === value);
    return matchesQuery && matchesFilters;
  });
}

export function sortByDateDescending(entries) {
  return [...entries].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function paginate(entries, page = 1, pageSize = 5) {
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  return {
    items: entries.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    page: currentPage,
    totalPages,
  };
}
