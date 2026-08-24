const AON_HOST = "2e.aonsrd.com";
const creaturePathPattern = /^\/creatures\/([0-9]+)-([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/i;

export type AonCreatureUrl = {
  externalId: number;
  slug: string;
  canonicalUrl: string;
};

export class AonUrlError extends Error {
  readonly code = "INVALID_AON_CREATURE_URL";

  constructor(message: string) {
    super(message);
    this.name = "AonUrlError";
  }
}

function getAuthority(input: string): string {
  const match = input.match(/^[a-z][a-z\d+.-]*:\/\/([^/]+)/i);
  return match?.[1] ?? "";
}

export function parseAonCreatureUrl(input: string): AonCreatureUrl {
  if (typeof input !== "string" || !input.trim()) {
    throw new AonUrlError("An Archives of Nethys creature URL is required.");
  }

  const value = input.trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AonUrlError("The Archives of Nethys URL is not valid.");
  }

  if (url.protocol !== "https:") {
    throw new AonUrlError("Archives of Nethys imports require HTTPS.");
  }

  if (url.hostname.toLowerCase() !== AON_HOST || url.username || url.password || getAuthority(value).toLowerCase() !== AON_HOST) {
    throw new AonUrlError("Only creature pages on 2e.aonsrd.com can be imported.");
  }

  const match = url.pathname.match(creaturePathPattern);
  if (!match) {
    throw new AonUrlError("The URL must point to a numeric Archives of Nethys creature page.");
  }

  const externalId = Number(match[1]);
  if (!Number.isSafeInteger(externalId) || externalId <= 0) {
    throw new AonUrlError("The creature URL contains an invalid numeric identifier.");
  }

  const slug = match[2].toLowerCase();
  return {
    externalId,
    slug,
    canonicalUrl: `https://${AON_HOST}/creatures/${externalId}-${slug}`,
  };
}

export function canonicalizeAonCreatureUrl(input: string): string {
  return parseAonCreatureUrl(input).canonicalUrl;
}

export function isAonCreatureUrl(input: string): boolean {
  try {
    parseAonCreatureUrl(input);
    return true;
  } catch {
    return false;
  }
}

export { AON_HOST };
