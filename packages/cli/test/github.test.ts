import { describe, expect, it } from "vitest";
import { validateGitRemoteUrl } from "../src/github.js";

describe("validateGitRemoteUrl", () => {
  it.each([
    "https://github.com/example/api.git",
    "https://gitlab.example/team/api",
    "https://github.com/api.git",
    "ssh://git@github.com/example/api.git",
    "GIT@github.com:example/api.git",
  ])("accepts supported remote %s", (url) => {
    expect(validateGitRemoteUrl(url)).toEqual({ ok: true });
  });

  it.each([
    "http://github.com/example/api.git",
    "git://github.com/example/api.git",
    "file:///tmp/api.git",
    "https://user:password@github.com/example/api.git",
    "https://github.com/example/api.git?token=secret",
    "https://github.com/example/api.git#main",
    "ssh://git:password@github.com/example/api.git",
    "https://github.com/",
    "https://github.com/example/api.git\n--upload-pack=echo",
  ])("rejects unsupported or unsafe remote %s", (url) => {
    expect(validateGitRemoteUrl(url).ok).toBe(false);
  });
});
