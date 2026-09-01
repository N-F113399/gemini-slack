export class SearchProvider {
  constructor({ name, capabilities = {} } = {}) {
    if (!name) throw new TypeError("Search provider name is required");
    this.name = name;
    this.capabilities = Object.freeze({ ...capabilities });
  }

  async search(_query) {
    throw new Error(`${this.name} provider must implement search()`);
  }
}
