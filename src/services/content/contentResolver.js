export class ContentResolver {
  async resolve(_input) {
    throw new Error("ContentResolver.resolve() must be implemented by a concrete resolver");
  }
}
