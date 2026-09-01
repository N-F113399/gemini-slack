import { SearchService } from "./searchService.js";
import { createConfiguredSearchProviders } from "./searchProviderFactory.js";

export function createConfiguredSearchService() {
  const providers = createConfiguredSearchProviders();
  if (providers.length === 0) return null;
  return new SearchService({ providers });
}
