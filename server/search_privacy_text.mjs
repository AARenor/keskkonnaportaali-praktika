import { removeFirstReviewedMunicipalityOrganizationName } from "./municipalities.mjs";
import {
  PUBLIC_ORGANIZATION_EXACT_NAME_PATTERNS,
  removeFirstPublicOrganizationName,
} from "./search_privacy_patterns.mjs";
import { normalize } from "./search_query_terms.mjs";

export function removeKnownPublicOrganizationName(text) {
  const withoutReviewedMunicipality = removeFirstReviewedMunicipalityOrganizationName(text);
  const withoutExactKnownOrganizations = PUBLIC_ORGANIZATION_EXACT_NAME_PATTERNS.reduce(
    (remaining, pattern) => remaining.replace(pattern, " "),
    withoutReviewedMunicipality,
  );
  const hasExactKnownOrganization = normalize(withoutExactKnownOrganizations) !== normalize(text);
  return hasExactKnownOrganization
    ? withoutExactKnownOrganizations
    : removeFirstPublicOrganizationName(text);
}
