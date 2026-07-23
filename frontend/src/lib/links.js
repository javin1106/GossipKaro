const NON_WHITESPACE_PATTERN = /\S+/gu;
const LEADING_PUNCTUATION_PATTERN = /^[([{<]+/;
const TRAILING_PUNCTUATION_PATTERN = /[.,!?;:)\]}>]+$/;
const PUBLIC_DOMAIN_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i;

const getSafeHref = (value) => {
  const hasProtocol = /^https?:\/\//i.test(value);
  const isProtocolRelative = value.startsWith("//");
  const usesLocalHost =
    /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:]+\])(?::|\/|$)/i.test(
      value,
    );
  const candidate = hasProtocol
    ? value
    : isProtocolRelative
      ? `https:${value}`
      : `${usesLocalHost ? "http" : "https"}://${value}`;

  try {
    const url = new URL(candidate);
    const isWebUrl = url.protocol === "http:" || url.protocol === "https:";
    const isBareUrlAllowed =
      hasProtocol ||
      isProtocolRelative ||
      url.hostname === "localhost" ||
      usesLocalHost ||
      PUBLIC_DOMAIN_PATTERN.test(url.hostname);

    return isWebUrl &&
      isBareUrlAllowed &&
      !url.username &&
      !url.password &&
      !value.includes("@")
      ? url.href
      : "";
  } catch {
    return "";
  }
};

export function tokenizeMessageLinks(text = "") {
  const tokens = [];
  let cursor = 0;
  const pushText = (value) => {
    if (!value) return;

    const previous = tokens.at(-1);
    if (previous?.type === "text") {
      previous.value += value;
    } else {
      tokens.push({ type: "text", value });
    }
  };

  for (const match of text.matchAll(NON_WHITESPACE_PATTERN)) {
    const rawText = match[0];
    const rawStart = match.index ?? 0;
    const leading = rawText.match(LEADING_PUNCTUATION_PATTERN)?.[0] || "";
    let linkText = rawText.slice(leading.length);
    const trailing = linkText.match(TRAILING_PUNCTUATION_PATTERN)?.[0] || "";

    if (trailing) {
      linkText = linkText.slice(0, -trailing.length);
    }

    const href = getSafeHref(linkText);
    if (!href) continue;
    const linkStart = rawStart + leading.length;

    if (linkStart > cursor) {
      pushText(text.slice(cursor, linkStart));
    }

    tokens.push({ type: "link", value: linkText, href });

    if (trailing) {
      pushText(trailing);
    }

    cursor = rawStart + rawText.length;
  }

  if (cursor < text.length) {
    pushText(text.slice(cursor));
  }

  return tokens.length > 0 ? tokens : [{ type: "text", value: text }];
}
