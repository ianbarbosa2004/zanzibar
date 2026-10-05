export const registryDefinitions = {
  type: { property: "expenseType", label: "tipo de despesa", collection: "expenseTypes" },
  taker: { property: "taker", label: "tomador", collection: "takers" },
  location: { property: "location", label: "local", collection: "locations" },
  creditor: { property: "creditor", label: "credor", collection: "creditors" },
  paymentMethod: { property: "paymentMethod", label: "forma de pagamento", collection: "paymentMethods" },
  incomeSource: { property: "source", label: "fonte de receita", collection: "incomeSources" },
};

export function registryDefinition(kind) {
  return registryDefinitions[kind];
}

export function hasRegistryName(items, value, exceptIndex = -1) {
  return items.some((item, index) => index !== exceptIndex && item.toLowerCase() === value.toLowerCase());
}

export function renameRegistry(kind, current, value, state) {
  const definition = registryDefinition(kind);
  if (!definition) throw new Error(`Cadastro desconhecido: ${kind}`);
  const collection = [...state[definition.collection]];
  const index = collection.indexOf(current);
  if (index < 0) throw new Error("Cadastro não encontrado.");
  collection[index] = value;
  const entriesKey = kind === "incomeSource" ? "incomes" : "transactions";
  const entries = state[entriesKey].map((item) => item[definition.property] === current
    ? { ...item, [definition.property]: value }
    : item);
  return { ...state, [definition.collection]: collection, [entriesKey]: entries };
}

export function canDeleteRegistry(kind, current, state) {
  const definition = registryDefinition(kind);
  if (!definition) return false;
  const entries = kind === "incomeSource" ? state.incomes : state.transactions;
  return !entries.some((item) => item[definition.property] === current);
}
