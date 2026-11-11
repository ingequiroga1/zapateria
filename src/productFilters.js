export const emptyFilters = () => ({
  query: "",
  supplier: "",
  kind: "",
  stock: "",
});
const normalized = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export function filterProducts(products, filters) {
  const terms = normalized(filters.query).split(/\s+/).filter(Boolean);
  return products.filter((p) => {
    const text = normalized([p.kind, p.name, p.color, p.size].join(" "));
    return (
      terms.every((term) => text.includes(term)) &&
      (!filters.supplier || p.supplier_ids?.includes(filters.supplier)) &&
      (!filters.kind || p.kind === filters.kind) &&
      (!filters.stock ||
        (filters.stock === "available"
          ? Number(p.stock) > 0
          : Number(p.stock) === 0))
    );
  });
}
export function removeDemoSupplier(state, id) {
  if (!state.suppliers.some((s) => s.id === id)) return state;
  if (state.entries.some((e) => e.supplier_id === id))
    throw Error(
      "No se puede eliminar: el proveedor tiene entradas registradas.",
    );
  if (state.products.some((p) => p.supplier_ids?.includes(id)))
    throw Error(
      "No se puede eliminar: el proveedor tiene productos asociados.",
    );
  return { ...state, suppliers: state.suppliers.filter((s) => s.id !== id) };
}
