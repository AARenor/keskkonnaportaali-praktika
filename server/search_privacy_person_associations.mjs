import {
  PERSON_CONTEXT_STOPWORD_PATTERN,
} from "./search_query_terms.mjs";
import {
  ECOLOGICAL_MODIFIER_PATTERN,
  ENGLISH_PRIVATE_ASSET_SOURCE,
} from "./search_privacy_patterns.mjs";
import {
  ESTONIAN_FOREST_NOUN_PATTERN,
  ESTONIAN_PRIVATE_FOREST_NOUN_PATTERN,
  ESTONIAN_WELL_NOUN_PATTERN,
} from "./search_privacy_protected_area.mjs";
import {
  isEcologicalCommonNamePair,
  isSuspiciousIdentityFragment,
} from "./search_privacy_identity.mjs";

export function classifyPrivacyPersonAssociations(
  textWithoutKnownOrganizations,
  rawIdentityFragments,
  hasPrivateAssetReference,
  hasExplicitCapitalizedPersonName,
  hasKnownPublicOrganization,
  englishRoleNounSource,
) {
  const hasInitialAndSurnamePersonName = /(?<!\p{L})\p{Lu}\.\s*\p{Lu}[\p{Ll}'’-]{1,39}(?!\p{L})/u.test(textWithoutKnownOrganizations);
  const leadingLowercaseNameMatch = textWithoutKnownOrganizations.match(/^\s*(\p{Ll}[\p{Ll}'’-]{1,39})\s+(\p{Ll}[\p{Ll}'’-]{1,39})\s+/u);
  const hasLeadingLowercaseNamedRole = Boolean(leadingLowercaseNameMatch)
    && isSuspiciousIdentityFragment(leadingLowercaseNameMatch[1])
    && isSuspiciousIdentityFragment(leadingLowercaseNameMatch[2])
    && /\b(?:own\w*|manag\w*|administ\w*|operat\w*|supervis\w*|control\w*|hold\w*|possess\w*|us(?:e|es|ed|ing)|occup\w*|leas\w*|rent\w*|maintain\w*|halda\w*|käita\w*|valda\w*|hoolda\w*|juhi\w*)\b/iu.test(textWithoutKnownOrganizations);
  const hasRecordedLowercaseNamedRole = new RegExp(
    String.raw`\b(?:environmental\s+records?|registry\s+(?:notes|records?)?|according\s+to\s+(?:the\s+)?(?:records?|registry|filing))\b[\s\S]{0,45}\b\p{Ll}[\p{Ll}'’-]{1,39}\s+\p{Ll}[\p{Ll}'’-]{1,39}\b[\s\S]{0,30}\b(?:as\s+(?:a\s+)?${englishRoleNounSource}|is\s+(?:the\s+)?${englishRoleNounSource}|(?:is\s+)?entrusted\s+with)\b`,
    "iu",
  ).test(textWithoutKnownOrganizations);
  const trailingLowercaseNamedRoleMatch = textWithoutKnownOrganizations.match(new RegExp(
    String.raw`\b(?:custodian|caretaker|manager|operator|steward)\s+for\b[\s\S]{0,85}\b${ENGLISH_PRIVATE_ASSET_SOURCE}\b[\s\S]{0,45}\bis\s+(\p{Ll}[\p{Ll}'’-]{1,39})\s+(\p{Ll}[\p{Ll}'’-]{1,39})(?:[.?!]|$)`,
    "u",
  ));
  const hasTrailingLowercaseNamedRole = Boolean(trailingLowercaseNamedRoleMatch)
    && isSuspiciousIdentityFragment(trailingLowercaseNamedRoleMatch[1])
    && isSuspiciousIdentityFragment(trailingLowercaseNamedRoleMatch[2]);
  const isRoleLinkedPrivateAsset = (word) => /^(?:katastri\w*|(?:naaber|naabri|metsa|era|rendi)?kinnist\w*|maa(?:u|ü)ksus\w*|maat(?:ü|u)kk\w*|metsaeraldis\w*|metsamaa\w*|metsat(?:ü|u)kk\w*|puistu\w*|puurkaev\w*|erakaev\w*|eramaa\w*|eratalu\w*|rendikinnist\w*|property|properties|parcel|parcels|plot|plots|lot|lots|estate|estates|land|lands|house|houses|home|homes|farm|farms|well|wells|borehole|boreholes|building|buildings|dwelling|dwellings|forest|forests|woodland|woodlands)$/iu.test(word)
    || ESTONIAN_PRIVATE_FOREST_NOUN_PATTERN.test(word);
  const isPrivateAssetQualifier = (word) => /^(?:era\w*|isiklik\w*|naabri\w*|perekonna\w*|private\w*|family|household|personal)$/iu.test(word);
  const isPrivateAssetQualifierModifier = (word) => /^(?:existing|local|old|registered|vana|kaitstav\w*)$/iu.test(word);
  const isRoleLinkedPrivateAssetAt = (assetIndex) => {
    const word = rawIdentityFragments[assetIndex] || "";
    const qualifierWindow = rawIdentityFragments.slice(Math.max(0, assetIndex - 3), assetIndex);
    const qualifierIndex = qualifierWindow.findLastIndex(isPrivateAssetQualifier);
    const qualifierSuffix = qualifierIndex >= 0 ? qualifierWindow.slice(qualifierIndex) : [];
    const hasBoundedPrivateQualifier = qualifierSuffix.length > 0
      && qualifierSuffix.slice(1).every(isPrivateAssetQualifierModifier);
    return isRoleLinkedPrivateAsset(word)
      // Canonical punctuation splitting turns compounds into tokens. Bind a
      // bare forest/well noun only to a nearby private qualifier followed by
      // at most two reviewed modifiers, never to arbitrary intervening text.
      || ((ESTONIAN_FOREST_NOUN_PATTERN.test(word) || ESTONIAN_WELL_NOUN_PATTERN.test(word))
        && hasBoundedPrivateQualifier);
  };
  const isRoleLinkedPublicAsset = (word) => /^(?:(?:riigi|rahvus|munitsipaal)mets\w*)$/iu.test(word);
  const isPublicAssetQualifier = (word) => /^(?:public\w*|government\w*|municipal\w*|national|federal|state|county|city|publicly|avalik\w*|riigi\w*|munitsipaal\w*|omavalitsus\w*|linna\w*|valla\w*)$/iu.test(word);
  const isRoleLinkedPublicAssetAt = (assetIndex) => {
    const word = rawIdentityFragments[assetIndex] || "";
    return isRoleLinkedPublicAsset(word)
      || (ESTONIAN_FOREST_NOUN_PATTERN.test(word)
        && isPublicAssetQualifier(rawIdentityFragments[assetIndex - 1] || ""));
  };
  const roleAssetIsPublic = (assetIndex) => {
    if (isRoleLinkedPublicAssetAt(assetIndex)) return true;
    const preceding = rawIdentityFragments.slice(Math.max(0, assetIndex - 3), assetIndex);
    const precedingStartIndex = Math.max(0, assetIndex - 3);
    const barrierIndex = preceding.findLastIndex((word, wordIndex) => (
      isRoleLinkedPrivateAssetAt(precedingStartIndex + wordIndex)
      || isRoleLinkedPublicAssetAt(precedingStartIndex + wordIndex)
      || /^(?:and|ja|ning|plus)$/iu.test(word)
    ));
    return preceding.slice(barrierIndex + 1).some(isPublicAssetQualifier);
  };
  const isAgentivePrivateAssetRoleLink = (word) => /^(?:hallan\w*|hallat\w*|halda\w*|haldaja\w*|haldur\w*|hooldat\w*|hoolda\w*|majandat\w*|majanda\w*|käitat\w*|kaitat\w*|käita\w*|kaita\w*|kasutat\w*|kasuta\w*|omanik\w*|omab|omavad|valda\w*|valitset\w*|valitse\w*|vastut\w*|kontrollit\w*|kontrolli\w*|rendilev[õo]t\w*|rendit\w*|rendi\w*|juhi(?:b|vad|s|sid|nud|tav|tud|ma|mine|mise|jana|jaks)\w*|korralda\w*|opereeri\w*|administrator|caretaker|custodian|holders?|landholder|landlord|manager|operator|owner|stewards?|tenant|trustee|owned|owns?|managed|manages?|managing|maintained|maintains?|maintaining|administered|administers?|administering|operated|operates?|operating|supervised|supervises?|supervising|overseen|oversees?|controlled|controls?|controlling|held|holds?|holding|possessed|possesses?|possessing|used|uses?|using|occupied|occupies|occupying|leased|leases?|leasing|rented|rents?|renting|cared)$/iu.test(word);
  const isNominalPrivateAssetRoleLink = (word) => /^(?:care|custody|custodianship|management|administration|operation|supervision|oversight|stewardship|haldamis\w*|haldus\w*|juhtimis\w*|korraldamis\w*)$/iu.test(word);
  const isPrivateAssetRoleLink = (word) => isAgentivePrivateAssetRoleLink(word)
    || isNominalPrivateAssetRoleLink(word);
  const isPrivateAssetRoleBridge = (word) => /^(?:a|an|and|as|behalf|by|eest|fall|falls|fell|fallen|for|in|lie|lies|lay|lain|of|on|over|plus|remain|remains|remained|rest|rests|rested|resting|s|that|the|under|with|who|whose|is|are|was|were|be|been|being|ja|keda|mida|mille|ning|on|oli|olev\w*|poolt|volita\w*)$/iu.test(word)
    || /^[\p{L}-]{2,30}(?:ly|lt|sti)$/iu.test(word);
  const isRoleLinkedOrganizationMarker = (word) => /^(?:agenc(?:y|ies)|associations?|authorit(?:y|ies)|board|business(?:es)?|collectives?|commission|committees?|community|communities|company|contractors?|cooperatives?|corporation|council|department\w*|federations?|foundation|groups?|inc|institutes?|institution\w*|llc|ltd|nonprofit|office\w*|organi[sz]ation\w*|panels?|plc|service\w*|societ(?:y|ies)|team\w*|trust|universit(?:y|ies)|volunteers?|aktsiaselts\w*|amet\w*|agentuur\w*|asutus\w*|büroo\w*|buroo\w*|institutsioon\w*|meeskond\w*|mittetulundusühing\w*|mittetulundusuhing\w*|nõukogu\w*|noukogu\w*|osakond\w*|osaühing\w*|osauhing\w*|selts\w*|sihtasutus\w*|teenistus\w*|tulundusühistu\w*|tulundusuhistu\w*|ühing\w*|uhing\w*)$/iu.test(word);
  const isGenericRoleModifier = (word) => /^(?:active\w*|adaptive|agenc(?:y|ies)|appl(?:y|ies|ied|icable)|associations?|authorit(?:y|ies)|based|binds?|business(?:es)?|can|city|community|communities|comply\w*|contractors?|could|county|department\w*|did|do|does|district\w*|dut(?:y|ies)|ecological\w*|ecosystem|environmental\w*|extensive\w*|family|federal|follow\w*|govern\w*|government\w*|groups?|guidance|harvest|high|how|impact|institution\w*|intensity|intensive\w*|individuals?|local|long|low|may|multi|municipal\w*|monitoring|must|national|natural\w*|neighborhood|obey\w*|office\w*|organi[sz]ation\w*|people|persons?|policy|private|public|purpose|requirement\w*|resident\w*|rights?|rural|rules?|scale|selective|service\w*|short|should|small|state|sustainab\w*|team\w*|term|title|unit\w*|volunteer\w*|what|which|who|whose|would|aktiiv\w*|amet\w*|asutus\w*|avalik\w*|era|ekstensiiv\w*|institutsioon\w*|intensiiv\w*|jätkusuut\w*|jatkusuut\w*|järgi\w*|jargi\w*|kas|kehti\w*|keda|kelle|kellele|kes|kuidas|kohustus\w*|linna\w*|looduslähed\w*|looduslahed\w*|meeskond\w*|millin\w*|mis|munitsipaal\w*|nõu[ed]\w*|nou[ed]\w*|oigus\w*|omavalitsus\w*|organisatsioon\w*|peab|perekonna\w*|pikaajali\w*|reegl\w*|riigi\w*|teenus\w*|tohib|täit\w*|tait\w*|valla\w*|vana|vastutus\w*|võib|voib|võiks|voiks|uus|õigus\w*|üksus\w*|uksus\w*)$/iu.test(word);
  const isRoleLinkedNameFragment = (word) => (isSuspiciousIdentityFragment(word)
      || ECOLOGICAL_MODIFIER_PATTERN.test(word)
      || (PERSON_CONTEXT_STOPWORD_PATTERN.test(word) && !isPrivateAssetRoleBridge(word)))
    && !isGenericRoleModifier(word)
    && !isPrivateAssetRoleLink(word)
    && !isRoleLinkedPrivateAsset(word);
  // Lowercase, uppercase and punctuation-separated names cannot be inferred
  // safely across arbitrary prose. A two-token pair is nevertheless a
  // private identity when a bounded management/ownership relation attaches
  // it to a concrete environmental asset. Tokenizing first makes the same
  // fail-closed decision for `jaan tamm`, `JAAN_TAMM` and `john/smith` while
  // leaving generic phrases such as "long-term managed woodland" public.
  const hasRoleLinkedNamedPrivateAssetAssociation = rawIdentityFragments.some((first, index) => {
    const second = rawIdentityFragments[index + 1];
    if (!second
      || !isRoleLinkedNameFragment(first)
      || !isRoleLinkedNameFragment(second)
      || isEcologicalCommonNamePair(first, second)) return false;

    // Institutional proper names and plural actor groups are not people.
    // Include the token immediately after a two-word candidate so the
    // designator in "North District Team" is part of the decision.
    if (rawIdentityFragments.slice(Math.max(0, index - 1), index + 5)
      .some(isRoleLinkedOrganizationMarker)) return false;

    const trailingStartIndex = index + 2;
    const trailing = rawIdentityFragments.slice(trailingStartIndex, index + 11);
    const trailingRoleIndexes = trailing.flatMap((word, wordIndex) => {
      if (isAgentivePrivateAssetRoleLink(word)) return [wordIndex];
      if (isNominalPrivateAssetRoleLink(word)
        && trailing.slice(0, wordIndex).some((candidate) => candidate === "s")) return [wordIndex];
      return [];
    });
    const relationFiller = (word, absoluteIndex) => isPrivateAssetRoleBridge(word)
      || isGenericRoleModifier(word)
      || isPrivateAssetQualifier(word)
      || isPrivateAssetQualifierModifier(word)
      || isRoleLinkedPrivateAssetAt(absoluteIndex)
      || isRoleLinkedPublicAssetAt(absoluteIndex);
    const trailingRangeIsRelationFiller = (start, end) => trailing.slice(start, end)
      .every((word, offset) => relationFiller(word, trailingStartIndex + start + offset));
    for (const trailingRoleIndex of trailingRoleIndexes) {
      const trailingAssetIndexes = trailing.flatMap((_word, wordIndex) => (
        wordIndex > trailingRoleIndex
          && isRoleLinkedPrivateAssetAt(trailingStartIndex + wordIndex) ? [wordIndex] : []
      ));
      for (const trailingAssetIndex of trailingAssetIndexes) {
        if (!roleAssetIsPublic(index + 2 + trailingAssetIndex)
          && trailing.slice(0, trailingRoleIndex).every((word) => (
            isPrivateAssetRoleBridge(word) || isGenericRoleModifier(word)
          ))
          && trailingRangeIsRelationFiller(trailingRoleIndex + 1, trailingAssetIndex)) return true;
      }
    }

    const trailingAssetIndexes = trailing.flatMap((_word, wordIndex) => (
      isRoleLinkedPrivateAssetAt(trailingStartIndex + wordIndex) ? [wordIndex] : []
    ));
    for (const trailingAssetIndex of trailingAssetIndexes) {
      const roleAfterAssetIndexes = trailing.flatMap((word, wordIndex) => (
        wordIndex > trailingAssetIndex && isAgentivePrivateAssetRoleLink(word) ? [wordIndex] : []
      ));
      for (const roleAfterAssetIndex of roleAfterAssetIndexes) {
        if (!roleAssetIsPublic(index + 2 + trailingAssetIndex)
          && trailing.slice(0, trailingAssetIndex).every((word) => (
            isPrivateAssetRoleBridge(word) || isGenericRoleModifier(word)
          ))
          && trailingRangeIsRelationFiller(trailingAssetIndex + 1, roleAfterAssetIndex)) return true;
      }
    }

    const leading = rawIdentityFragments.slice(Math.max(0, index - 7), index);
    const leadingRoleIndex = leading.findLastIndex(isAgentivePrivateAssetRoleLink);
    const leadingBridges = leading.slice(leadingRoleIndex + 1);
    const leadingStartIndex = Math.max(0, index - 7);
    const leadingAssetIndex = leading.findLastIndex((_word, wordIndex) => (
      wordIndex < leadingRoleIndex
        && isRoleLinkedPrivateAssetAt(leadingStartIndex + wordIndex)
    ));
    const isStrongAgentBridgeSequence = (bridgeWords) => bridgeWords.every(isPrivateAssetRoleBridge)
      || (bridgeWords.length >= 2
        && /^(?:by|poolt)$/iu.test(bridgeWords.at(-1))
        && bridgeWords.slice(0, -1).length <= 3
        && bridgeWords.slice(0, -1).every((word) => /^[\p{L}-]{2,30}$/iu.test(word)
          && !isPrivateAssetRoleLink(word)
          && !isRoleLinkedOrganizationMarker(word)
          && !isRoleLinkedPrivateAsset(word)));
    if (leadingRoleIndex >= 0
      && isStrongAgentBridgeSequence(leadingBridges)
      && leadingAssetIndex >= 0
      && !roleAssetIsPublic(leadingStartIndex + leadingAssetIndex)
      && leading.slice(leadingAssetIndex + 1, leadingRoleIndex).every((word) => (
        isPrivateAssetRoleBridge(word) || isGenericRoleModifier(word)
      ))) return true;

    // Nominal roles can appear on either side of the asset, provided the
    // strong "of/by <name>" syntax remains contiguous and bounded.
    const leadingNominalRoleIndexes = leading.flatMap((word, wordIndex) => (
      isNominalPrivateAssetRoleLink(word) ? [wordIndex] : []
    ));
    const leadingAssetIndexes = leading.flatMap((_word, wordIndex) => (
      isRoleLinkedPrivateAssetAt(leadingStartIndex + wordIndex) ? [wordIndex] : []
    ));
    for (const nominalRoleIndex of leadingNominalRoleIndexes) {
      for (const assetIndex of leadingAssetIndexes) {
        const lower = Math.min(nominalRoleIndex, assetIndex);
        const upper = Math.max(nominalRoleIndex, assetIndex);
        if (!roleAssetIsPublic(leadingStartIndex + assetIndex)
          && leading.slice(lower + 1, upper).every((word) => (
            isPrivateAssetRoleBridge(word) || isGenericRoleModifier(word)
          ))
          && isStrongAgentBridgeSequence(leading.slice(upper + 1))) return true;
      }
      for (const trailingAssetIndex of trailingAssetIndexes) {
        if (!roleAssetIsPublic(trailingStartIndex + trailingAssetIndex)
          && isStrongAgentBridgeSequence(leading.slice(nominalRoleIndex + 1))
          && trailingRangeIsRelationFiller(0, trailingAssetIndex)) return true;
      }
    }

    // Possessive nominal syntax places the role after the name while the
    // asset precedes it: "woodland under John Smith's management". This is
    // a strong relation only when every intervening token is a bounded
    // grammatical bridge and the asset is not publicly qualified.
    const nominalLeadingAssetIndex = leading.findLastIndex((_word, wordIndex) => (
      isRoleLinkedPrivateAssetAt(leadingStartIndex + wordIndex)
    ));
    const trailingNominalRoleIndex = trailing.findIndex(isNominalPrivateAssetRoleLink);
    return nominalLeadingAssetIndex >= 0
      && trailingNominalRoleIndex >= 0
      && !roleAssetIsPublic(leadingStartIndex + nominalLeadingAssetIndex)
      && leading.slice(nominalLeadingAssetIndex + 1).every(isPrivateAssetRoleBridge)
      && trailing.slice(0, trailingNominalRoleIndex).every(isPrivateAssetRoleBridge);
  });
  // Some genuine names collide with ordinary environmental vocabulary or
  // modal words (for example “Forest Green”, “Jaan Mets” and “May Brown”).
  // Accept them only inside strong, bounded subject/by/of/with role grammars;
  // arbitrary two-word prose remains insufficient to infer a person.
  const isStrongGrammarPersonToken = (word) => /^[\p{L}][\p{L}'’-]{1,39}$/u.test(word)
    && !isPrivateAssetRoleLink(word)
    && !isRoleLinkedOrganizationMarker(word)
    && !/^(?:a|an|the|this|that|these|those|private|public|government|municipal|national|state|county|city|federal|person|persons|people|individual|individuals|someone|whoever|term)$/iu.test(word);
  const strongGrammarPairIsOrganization = (index) => rawIdentityFragments
    .slice(Math.max(0, index - 1), index + 5)
    .some(isRoleLinkedOrganizationMarker);
  const strongGrammarPairIsGenericDescriptor = (first, second) => (
    (isGenericRoleModifier(first) && isGenericRoleModifier(second))
    // Punctuation tokenization must not reinterpret the ordinary compound
    // qualifier in "era-mets" as a two-token person's name.
    || (isPrivateAssetQualifier(first)
      && (isPrivateAssetQualifierModifier(second)
        || ESTONIAN_FOREST_NOUN_PATTERN.test(second)
        || ESTONIAN_WELL_NOUN_PATTERN.test(second)))
  );
  const strongNamedSubjectPairIndexes = rawIdentityFragments.flatMap((first, index) => {
    const second = rawIdentityFragments[index + 1];
    if (!second
      || !isStrongGrammarPersonToken(first)
      || !isStrongGrammarPersonToken(second)
      || strongGrammarPairIsGenericDescriptor(first, second)
      || strongGrammarPairIsOrganization(index)) return [];
    const hasStrongQuestionPrefix = (
      rawIdentityFragments[index - 2] === "how"
      && rawIdentityFragments[index - 1] === "does"
    ) || (
      rawIdentityFragments[index - 1] === "kuidas"
      && !/^m[õo]jutab$/iu.test(first)
    ) || (
      rawIdentityFragments[index - 2] === "kuidas"
      && /^m[õo]jutab$/iu.test(rawIdentityFragments[index - 1] || "")
    ) || (
      rawIdentityFragments[index - 4] === "what"
      && /^(?:duties|obligations|requirements|rules)$/iu.test(rawIdentityFragments[index - 3] || "")
      && /^(?:apply|applicable|bind)$/iu.test(rawIdentityFragments[index - 2] || "")
      && rawIdentityFragments[index - 1] === "to"
    );
    const directPrivateAsset = rawIdentityFragments
      .slice(index + 2, Math.min(rawIdentityFragments.length, index + 7))
      .some((_word, offset) => {
        const assetIndex = index + 2 + offset;
        return isRoleLinkedPrivateAssetAt(assetIndex) && !roleAssetIsPublic(assetIndex);
      });
    const estonianImpactPrefix = rawIdentityFragments[index - 2] === "kuidas"
      && /^m[õo]jutab$/iu.test(rawIdentityFragments[index - 1] || "");
    return hasStrongQuestionPrefix
      && (isAgentivePrivateAssetRoleLink(rawIdentityFragments[index + 2] || "")
        || (estonianImpactPrefix && directPrivateAsset)) ? [index] : [];
  });
  const hasStrongGrammarNamedPrivateAssetAssociation = rawIdentityFragments.some((first, index) => {
    const second = rawIdentityFragments[index + 1];
    if (!second
      || !isStrongGrammarPersonToken(first)
      || !isStrongGrammarPersonToken(second)
      || strongGrammarPairIsGenericDescriptor(first, second)
      || strongGrammarPairIsOrganization(index)) return false;

    const privateAssetInRange = (start, end) => rawIdentityFragments
      .slice(start, end)
      .some((_word, offset) => {
        const assetIndex = start + offset;
        return isRoleLinkedPrivateAssetAt(assetIndex) && !roleAssetIsPublic(assetIndex);
      });
    if (strongNamedSubjectPairIndexes.includes(index)
      && privateAssetInRange(index + 2, Math.min(rawIdentityFragments.length, index + 11))) return true;

    const connector = rawIdentityFragments[index - 1] || "";
    const leadingStart = Math.max(0, index - 8);
    const leading = rawIdentityFragments.slice(leadingStart, index - 1);
    const leadingRoleIndex = leading.findLastIndex(isPrivateAssetRoleLink);
    const leadingPrivateAssetIndex = leading.findLastIndex((_word, wordIndex) => {
      const absoluteIndex = leadingStart + wordIndex;
      return isRoleLinkedPrivateAssetAt(absoluteIndex) && !roleAssetIsPublic(absoluteIndex);
    });
    if (/^(?:by|of)$/iu.test(connector)
      && leadingRoleIndex >= 0
      && (
        leadingPrivateAssetIndex >= 0
        || privateAssetInRange(index + 2, Math.min(rawIdentityFragments.length, index + 9))
      )) return true;

    const trailingRoleIndex = rawIdentityFragments
      .slice(index + 2, index + 6)
      .findIndex(isPrivateAssetRoleLink);
    return connector === "with"
      && leadingPrivateAssetIndex >= 0
      && trailingRoleIndex >= 0
      && rawIdentityFragments.slice(index + 2, index + 2 + trailingRoleIndex)
        .every(isPrivateAssetRoleBridge);
  });
  const lowercaseNamedPrivateAssetMatches = [...textWithoutKnownOrganizations.matchAll(
    /(?<!\p{L})(\p{Ll}[\p{Ll}'’-]{1,39})(?:\s+|[._/:·—-]\s*)(\p{Ll}[\p{Ll}'’-]{1,39})\s+(?=(?:katastri\w*|(?:naaber|naabri|metsa|era|rendi)?kinnist\w*|maa(?:u|ü)ksus\w*|maat(?:ü|u)kk\w*|metsaeraldis\w*|metsamaa\w*|puurkaev\w*|erakaev\w*|eramaa\w*|eratalu\w*|rendikinnist\w*|property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling)(?!\p{L}))/gu,
  )];
  const hasLowercaseNamedPrivateAssetAssociation = hasPrivateAssetReference
    && lowercaseNamedPrivateAssetMatches.some(([, first, second]) => (
      isSuspiciousIdentityFragment(first)
      && isSuspiciousIdentityFragment(second)
      && !isEcologicalCommonNamePair(first, second)
    ));
  const potentialRoleLinkedNamePairIndexes = rawIdentityFragments.flatMap((first, index) => {
    const second = rawIdentityFragments[index + 1];
    return Boolean(second)
      && isRoleLinkedNameFragment(first)
      && isRoleLinkedNameFragment(second)
      && !isEcologicalCommonNamePair(first, second)
      && !rawIdentityFragments.slice(Math.max(0, index - 1), index + 5)
        .some(isRoleLinkedOrganizationMarker) ? [index] : [];
  });
  const hasPotentialNamedOwnPrivateAssetAssociation = rawIdentityFragments.some((word, assetIndex) => (
    /^(?:erakaev\w*|eratalu\w*|eramaa\w*|eramets\w*|maja\w*|kinnist\w*|puurkaev\w*)$/iu.test(word)
      && /^(?:oma|tema)$/iu.test(rawIdentityFragments[assetIndex - 1] || "")
      && potentialRoleLinkedNamePairIndexes.some((nameIndex) => nameIndex + 1 < assetIndex - 1)
  ));
  const hasStructuredNamedPerson = hasExplicitCapitalizedPersonName
    || hasInitialAndSurnamePersonName
    || (hasLeadingLowercaseNamedRole && !hasKnownPublicOrganization)
    || hasRecordedLowercaseNamedRole
    || hasTrailingLowercaseNamedRole
    || hasRoleLinkedNamedPrivateAssetAssociation
    || strongNamedSubjectPairIndexes.length > 0
    || hasStrongGrammarNamedPrivateAssetAssociation
    || hasLowercaseNamedPrivateAssetAssociation;
  return {
    hasPotentialNamedOwnPrivateAssetAssociation,
    hasRoleLinkedNamedPrivateAssetAssociation,
    hasStrongGrammarNamedPrivateAssetAssociation,
    hasStructuredNamedPerson,
  };
}
