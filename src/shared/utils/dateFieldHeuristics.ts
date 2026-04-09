const DATE_INPUT_TYPES = new Set([
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
]);

const MONTH_NAMES = new Set([
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec",
]);

const DATE_WORDS = new Set([
  "date",
  "dob",
  "birthdate",
  "birthday",
  "bday",
]);

const DATE_PART_WORDS = new Set([
  "day",
  "month",
  "year",
]);

const DATE_CONTEXT_WORDS = new Set([
  "available",
  "availability",
  "birth",
  "complete",
  "completed",
  "completion",
  "degree",
  "end",
  "expiration",
  "expire",
  "expires",
  "expiry",
  "from",
  "grad",
  "graduate",
  "graduated",
  "graduation",
  "issued",
  "start",
  "to",
]);

const DATE_FORMAT_WORDS = new Set([
  "dd",
  "mm",
  "yy",
  "yyyy",
]);

export function isDateLikeInputType(type: string | null | undefined): boolean {
  return DATE_INPUT_TYPES.has(type?.toLowerCase().trim() ?? "");
}

export function isDateLikeText(value: string | null | undefined): boolean {
  const normalized = normalizeSignal(value);

  if (!normalized) {
    return false;
  }

  const tokens = normalized.split(" ").filter(Boolean);

  if (tokens.some((token) => DATE_WORDS.has(token))) {
    return true;
  }

  if (tokens.some((token) => DATE_FORMAT_WORDS.has(token))) {
    return true;
  }

  const hasDatePart = tokens.some((token) => DATE_PART_WORDS.has(token));

  if (!hasDatePart) {
    return false;
  }

  return tokens.length <= 2 || tokens.some((token) => DATE_CONTEXT_WORDS.has(token));
}

export function hasMonthOptionList(optionTexts: string[] | undefined): boolean {
  if (!optionTexts || optionTexts.length < 3) {
    return false;
  }

  const monthCount = optionTexts
    .map((option) => normalizeSignal(option))
    .filter((option): option is string => Boolean(option))
    .filter((option) =>
      option.split(" ").some((token) => MONTH_NAMES.has(token)),
    )
    .length;

  return monthCount >= 3;
}

export function hasDateLikeSignal(
  values: Array<string | null | undefined>,
  optionTexts?: string[],
): boolean {
  return values.some((value) => isDateLikeText(value)) || hasMonthOptionList(optionTexts);
}

function normalizeSignal(value: string | null | undefined): string | undefined {
  const normalized = value
    ?.normalize("NFKD")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized ? normalized : undefined;
}
