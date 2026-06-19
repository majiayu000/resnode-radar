export const state = {
  payload: null,
  products: [],
  activeCategory: "all",
  activeSort: "recommend",
  filters: {
    search: "",
    region: "all",
    provider: "all",
    ipType: "all",
    status: "all",
    price: "all"
  },
  selected: new Set(),
  expanded: new Set()
};
