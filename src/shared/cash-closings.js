export function cashClosingMatchesExistingRow(item, row) {
  const identifiers = [item?.id, item?.clientId].filter((value) => value !== undefined && value !== null && String(value) !== "");
  return identifiers.some((identifier) => {
    const value = String(identifier);
    if (Number.isInteger(identifier) || /^\d+$/.test(value)) return Number(row.id) === Number(value);
    return String(row.clientId || "") === value;
  });
}
