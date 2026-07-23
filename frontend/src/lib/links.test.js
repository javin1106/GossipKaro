import assert from "node:assert/strict";
import test from "node:test";
import { tokenizeMessageLinks } from "./links.js";

test("tokenizes HTTP and www links while preserving surrounding text", () => {
  assert.deepEqual(
    tokenizeMessageLinks("Open https://example.com/docs or www.example.org."),
    [
      { type: "text", value: "Open " },
      {
        type: "link",
        value: "https://example.com/docs",
        href: "https://example.com/docs",
      },
      { type: "text", value: " or " },
      {
        type: "link",
        value: "www.example.org",
        href: "https://www.example.org/",
      },
      { type: "text", value: "." },
    ],
  );
});

test("leaves ordinary messages unchanged", () => {
  assert.deepEqual(tokenizeMessageLinks("No link in this message"), [
    { type: "text", value: "No link in this message" },
  ]);
});

test("does not link unsupported URL schemes", () => {
  assert.deepEqual(tokenizeMessageLinks("javascript:alert(1)"), [
    { type: "text", value: "javascript:alert(1)" },
  ]);
});

test("normalizes bare domains, subdomains, and URL paths", () => {
  assert.deepEqual(
    tokenizeMessageLinks(
      "Try google.com, chat.example.co.in/room?id=4#latest and //openai.com.",
    ),
    [
      { type: "text", value: "Try " },
      {
        type: "link",
        value: "google.com",
        href: "https://google.com/",
      },
      { type: "text", value: ", " },
      {
        type: "link",
        value: "chat.example.co.in/room?id=4#latest",
        href: "https://chat.example.co.in/room?id=4#latest",
      },
      { type: "text", value: " and " },
      {
        type: "link",
        value: "//openai.com",
        href: "https://openai.com/",
      },
      { type: "text", value: "." },
    ],
  );
});

test("supports local development and IP-address links", () => {
  assert.deepEqual(
    tokenizeMessageLinks("localhost:5173/chat 127.0.0.1:5000/health"),
    [
      {
        type: "link",
        value: "localhost:5173/chat",
        href: "http://localhost:5173/chat",
      },
      { type: "text", value: " " },
      {
        type: "link",
        value: "127.0.0.1:5000/health",
        href: "http://127.0.0.1:5000/health",
      },
    ],
  );
});

test("does not convert email addresses or ordinary words into links", () => {
  assert.deepEqual(
    tokenizeMessageLinks("Email person@example.com about version 1.2"),
    [{ type: "text", value: "Email person@example.com about version 1.2" }],
  );
});
