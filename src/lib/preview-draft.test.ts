import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PREVIEW_DRAFT_KEY, clearPreviewDraft, readPreviewDraft, writePreviewDraft } from "./preview-draft";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", {});
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

const put = (raw: string) => store.set(PREVIEW_DRAFT_KEY, raw);

describe("preview draft", () => {
  it("round-trips what /preview read", () => {
    writePreviewDraft({ url: "https://acme.com", ready: true, name: "Acme", identity: "clerk", projectType: "hybrid" });
    expect(readPreviewDraft()).toMatchObject({ url: "https://acme.com", ready: true, name: "Acme", identity: "clerk", projectType: "hybrid" });
  });

  it("keeps the address the hero stored before anything was read", () => {
    writePreviewDraft({ url: "acme.com" });
    expect(readPreviewDraft()).toMatchObject({ url: "acme.com", ready: false });
  });

  it("drops a payload that is missing, malformed or the wrong shape", () => {
    expect(readPreviewDraft()).toBeNull();
    for (const raw of ["", "{", "null", '"a string"', "[]", "[{}]", "42"]) {
      put(raw);
      expect(readPreviewDraft(), raw).toBeNull();
    }
  });

  it("drops a payload from another schema version or without a timestamp", () => {
    put(JSON.stringify({ v: 99, at: Date.now(), url: "https://acme.com" }));
    expect(readPreviewDraft()).toBeNull();
    put(JSON.stringify({ v: 1, url: "https://acme.com" }));
    expect(readPreviewDraft()).toBeNull();
    put(JSON.stringify({ v: 1, at: "yesterday", url: "https://acme.com" }));
    expect(readPreviewDraft()).toBeNull();
    put(JSON.stringify({ v: 1, at: Number.NaN, url: "https://acme.com" }));
    expect(readPreviewDraft()).toBeNull();
  });

  it("expires an hour after it was written", () => {
    const at = Date.now();
    put(JSON.stringify({ v: 1, at, url: "https://acme.com" }));
    expect(readPreviewDraft(at + 59 * 60_000)).not.toBeNull();
    expect(readPreviewDraft(at + 61 * 60_000)).toBeNull();
  });

  it("drops a draft with no address, and non-string fields inside a valid one", () => {
    put(JSON.stringify({ v: 1, at: Date.now(), name: "Acme" }));
    expect(readPreviewDraft()).toBeNull();
    put(JSON.stringify({ v: 1, at: Date.now(), url: "https://acme.com", name: { evil: true }, identity: 7, category: "", projectType: "spaceship" }));
    expect(readPreviewDraft()).toEqual({ url: "https://acme.com", ready: false, projectType: undefined });
  });

  it("clears itself", () => {
    writePreviewDraft({ url: "https://acme.com" });
    clearPreviewDraft();
    expect(readPreviewDraft()).toBeNull();
  });
});
