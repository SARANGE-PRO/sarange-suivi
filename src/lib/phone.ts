/**
 * phone.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * FICHIER JUMEAU de devis-sarange/lib/phone.mjs (et de
 * site-sarange/src/lib/phone.js) : toute évolution de la mise en forme doit être
 * répercutée dans les trois dépôts, pour qu'un même numéro s'affiche à
 * l'identique du site au devis, puis au suivi de chantier.
 *
 * Mise en forme des numéros de téléphone : saisie, affichage, liens tel:.
 *
 * Règle de base : on sépare par groupes de 2 chiffres.
 *   0662689084      → 06 62 68 90 84
 *   +33662689084    → +33 6 62 68 90 84   (le +33 est CONSERVÉ, jamais converti)
 *   0033662689084   → +33 6 62 68 90 84   (le 00 international devient +)
 *
 * Numéros étrangers : l'indicatif est isolé selon la règle UIT-T E.164
 * (zones 1 et 7 = 1 chiffre, liste fermée d'indicatifs à 2 chiffres, tout le
 * reste = 3 chiffres), puis le numéro national est groupé selon l'usage du
 * pays quand on le connaît (COUNTRY_PATTERNS), sinon par paires.
 *
 * Prudence volontaire — la fonction rend la valeur TELLE QUELLE si :
 *   • elle contient une lettre (« 06 12 34 56 78 poste 2 », « sur RDV »…) ;
 *   • elle ne contient aucun chiffre.
 * Et une saisie contenant plusieurs numéros (« 06 … / 01 … ») est découpée sur
 * les séparateurs / , ; et retour à la ligne, chaque numéro étant mis en forme
 * séparément. On ne fusionne jamais deux numéros en un seul.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Indicatifs pays à 1 chiffre : zone 1 (Amérique du Nord) et zone 7 (Russie,
// Kazakhstan). Tous les autres valent 2 ou 3 chiffres.
const ONE_DIGIT_COUNTRY_CODES = new Set(["1", "7"]);

// Liste fermée des indicatifs à 2 chiffres (UIT-T E.164). Un indicatif commençant
// par 2-9 qui n'y figure pas compte donc 3 chiffres (212 Maroc, 352 Luxembourg…).
const TWO_DIGIT_COUNTRY_CODES = new Set([
  "20", "27",
  "30", "31", "32", "33", "34", "36", "39",
  "40", "41", "43", "44", "45", "46", "47", "48", "49",
  "51", "52", "53", "54", "55", "56", "57", "58",
  "60", "61", "62", "63", "64", "65", "66",
  "81", "82", "84", "86",
  "90", "91", "92", "93", "94", "95", "98"
]);

interface CountryPattern {
  /** Motif appliqué en permanence, y compris sur un numéro incomplet. */
  preferred: number[];
  /** Motif exact une fois le numéro complet, quand le pays en a plusieurs. */
  byLength?: Record<number, number[]>;
}

const COUNTRY_PATTERNS: Record<number, CountryPattern> = {
  1: { preferred: [3, 3, 4] }, // États-Unis / Canada : 212 555 1234
  7: { preferred: [3, 3, 2, 2] }, // Russie / Kazakhstan : 495 123 45 67
  31: { preferred: [1, 2, 2, 2, 2] }, // Pays-Bas : 6 12 34 56 78
  32: { preferred: [3, 2, 2, 2], byLength: { 8: [1, 3, 2, 2] } }, // Belgique : 475 12 34 56
  33: { preferred: [1, 2, 2, 2, 2] }, // France : 6 62 68 90 84
  34: { preferred: [3, 3, 3] }, // Espagne : 612 345 678
  39: { preferred: [3, 3, 3], byLength: { 10: [3, 3, 4] } }, // Italie : 333 123 4567
  41: { preferred: [2, 3, 2, 2] }, // Suisse : 79 123 45 67
  44: { preferred: [4, 3, 3] }, // Royaume-Uni : 7911 123 456
  212: { preferred: [1, 2, 2, 2, 2] }, // Maroc : 6 12 34 56 78
  213: { preferred: [1, 2, 2, 2, 2] }, // Algérie : 5 51 23 45 67
  216: { preferred: [2, 3, 3] }, // Tunisie : 20 123 456
  351: { preferred: [3, 3, 3] }, // Portugal : 912 345 678
  352: { preferred: [3, 3, 3] } // Luxembourg : 621 123 456
};

// Pays où le 0 de départ du numéro national se retire derrière l'indicatif :
// « +33 (0)6 62 … » = « +33 6 62 … ». L'Italie (+39) fait exception, son 0 est
// significatif (+39 06 … pour Rome).
const COUNTRY_CODES_KEEPING_TRUNK_ZERO = new Set(["39"]);

// Séparateurs qui trahissent DEUX numéros dans un même champ.
const MULTI_NUMBER_SPLIT = /([/,;\n]+)/;

// Au-delà, ce n'est plus un numéro : on arrête de mettre en forme.
const MAX_PHONE_DIGITS = 17;

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

/** Tous les chiffres, sans mise en forme. */
export const getPhoneDigits = (value: unknown): string => asString(value).replace(/\D/g, "");

interface SplitNumber {
  countryCode: string;
  national: string;
}

/**
 * Isole l'indicatif pays d'un numéro international (sans le +).
 * Renvoie null si les chiffres ne permettent pas de trancher.
 */
const splitCountryCode = (digits: string): SplitNumber | null => {
  if (!digits) return null;

  const first = digits.slice(0, 1);
  if (ONE_DIGIT_COUNTRY_CODES.has(first)) {
    return { countryCode: first, national: digits.slice(1) };
  }
  if (first === "0") return null; // aucun indicatif ne commence par 0

  const firstTwo = digits.slice(0, 2);
  if (TWO_DIGIT_COUNTRY_CODES.has(firstTwo)) {
    return { countryCode: firstTwo, national: digits.slice(2) };
  }

  // Indicatif à 3 chiffres : on attend d'en avoir 3 pour ne pas couper trop tôt.
  if (digits.length < 3) return { countryCode: digits, national: "" };
  return { countryCode: digits.slice(0, 3), national: digits.slice(3) };
};

/** Retire le 0 d'accès national conservé par habitude derrière l'indicatif. */
const stripTrunkZero = (national: string, countryCode: string): string =>
  COUNTRY_CODES_KEEPING_TRUNK_ZERO.has(countryCode) ? national : national.replace(/^0/, "");

/** Paires de chiffres ; longueur impaire → premier groupe de 3. */
const genericPattern = (length: number): number[] => {
  if (length <= 0) return [];
  const pattern: number[] = [];
  let remaining = length;
  if (remaining % 2 === 1) {
    pattern.push(3);
    remaining -= 3;
  }
  while (remaining > 0) {
    pattern.push(2);
    remaining -= 2;
  }
  return pattern.filter((size) => size > 0);
};

/** Applique un motif de découpage, en tolérant un numéro incomplet ou plus long. */
const applyPattern = (digits: string, pattern: number[]): string => {
  const groups: string[] = [];
  let index = 0;

  for (const size of pattern) {
    if (index >= digits.length) break;
    groups.push(digits.slice(index, index + size));
    index += size;
  }
  // Chiffres en trop (numéro plus long que le motif) : par paires.
  while (index < digits.length) {
    groups.push(digits.slice(index, index + 2));
    index += 2;
  }

  return groups.join(" ");
};

const groupNational = (digits: string, countryCode: string): string => {
  const rules = COUNTRY_PATTERNS[Number(countryCode)];
  const pattern =
    rules?.byLength?.[digits.length] ?? rules?.preferred ?? genericPattern(digits.length);

  return applyPattern(digits, pattern);
};

/**
 * Mise en forme d'UN numéro déjà réduit à ses caractères utiles.
 * `international` indique que la saisie commençait par + ou 00.
 */
const formatSingleNumber = (digits: string, international: boolean): string | null => {
  if (!digits) return international ? "+" : "";
  if (digits.length > MAX_PHONE_DIGITS) return null; // trop long : on ne touche pas

  // Numéro national (France) : paires — un motif vide fait tomber applyPattern
  // sur son découpage par paires.
  if (!international) return applyPattern(digits, []);

  const split = splitCountryCode(digits);
  if (!split) return null;

  const national = groupNational(
    stripTrunkZero(split.national, split.countryCode),
    split.countryCode
  );
  return `+${split.countryCode}${national ? ` ${national}` : ""}`;
};

/**
 * Mise en forme d'un numéro isolé (sans séparateur multi-numéros).
 * Renvoie null quand il vaut mieux ne rien changer.
 */
const formatPhonePart = (value: string): string | null => {
  const raw = asString(value).trim();
  if (!raw) return "";
  if (/[A-Za-z]/.test(raw)) return null; // « poste 2 », « sur RDV »… : intouchable

  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // + en tête, ou préfixe international 00 (0033… → +33…).
  if (raw.startsWith("+")) return formatSingleNumber(digits, true);
  if (digits.startsWith("00")) return formatSingleNumber(digits.slice(2), true);

  return formatSingleNumber(digits, false);
};

/**
 * Mise en forme d'un champ téléphone, multi-numéros compris.
 * Idempotente : re-formater une valeur déjà mise en forme ne la change pas.
 */
export const formatPhoneNumber = (value: unknown): string => {
  const raw = asString(value).trim();
  if (!raw) return "";

  const parts = raw.split(MULTI_NUMBER_SPLIT);
  if (parts.length === 1) return formatPhonePart(raw) ?? raw;

  return parts
    .map((part, index) => {
      if (index % 2 === 1) {
        const separator = part.trim();
        if (!separator) return part; // retour à la ligne : conservé tel quel
        // La virgule et le point-virgule collent au numéro précédent, la barre
        // oblique respire : « 06 62 68 90 84, 01 60 … » / « 06 … / 01 … ».
        return /^[,;]+$/.test(separator) ? `${separator} ` : ` ${separator} `;
      }
      const formatted = formatPhonePart(part);
      return formatted === null ? part.trim() : formatted;
    })
    .join("")
    .replace(/ {2,}/g, " ")
    .trim();
};

/**
 * Comparaison d'un terme de recherche avec un texte indexé, tolérante à la mise
 * en forme des numéros : « 06 62 68 90 84 » retrouve une fiche indexée
 * « 0662689084 » — et l'inverse — y compris pour les fiches enregistrées avant
 * la mise en forme automatique. Les recherches par nom ne changent pas.
 */
export const matchesSearchTerm = (haystack: unknown, term: unknown): boolean => {
  const text = asString(haystack);
  const needle = asString(term);
  if (!needle) return true;
  if (text.includes(needle)) return true;

  // Repli chiffres seuls, uniquement quand le terme ressemble à un numéro :
  // aucune lettre et au moins 4 chiffres.
  if (/[a-zA-Z]/.test(needle)) return false;
  const needleDigits = needle.replace(/\D/g, "");
  if (needleDigits.length < 4) return false;

  return text.replace(/\D/g, "").includes(needleDigits);
};

/**
 * Lien tel: — forme E.164 quand on peut (+33662689084), sinon les chiffres.
 * Sur un champ multi-numéros, on appelle le premier.
 */
export const getPhoneHref = (value: unknown): string => {
  const first = asString(value).split(MULTI_NUMBER_SPLIT)[0] ?? "";
  const raw = first.trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  if (raw.startsWith("+") || digits.startsWith("00")) {
    const split = splitCountryCode(digits.startsWith("00") ? digits.slice(2) : digits);
    if (!split) return `tel:${digits}`;
    return `tel:+${split.countryCode}${stripTrunkZero(split.national, split.countryCode)}`;
  }

  // Numéro national français : 0X XX XX XX XX → +33X…
  if (/^0[1-9]\d{8}$/.test(digits)) return `tel:+33${digits.slice(1)}`;
  return `tel:${digits}`;
};
