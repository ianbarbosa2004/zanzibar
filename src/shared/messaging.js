export function normalizeMessageFiles(files) {
  const values = Array.isArray(files) ? files : [];
  return values.filter((file) => file && file.id !== null && file.id !== undefined);
}
