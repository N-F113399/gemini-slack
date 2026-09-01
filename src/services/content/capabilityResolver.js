export class CapabilityResolver {
  resolve(_content, _context = {}) {
    throw new Error("CapabilityResolver.resolve() must be implemented by a concrete resolver");
  }
}
