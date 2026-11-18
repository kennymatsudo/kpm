import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { diffTrees, headTree, snapshotRoot } from "./gitSnapshot";
import { parseUnifiedDiff } from "../../../shared/unifiedDiff";

const dirs: string[] = [];
function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kpm-snap-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function initRepo(): string {
  const dir = tempDir();
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir });
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "T");
  fs.writeFileSync(path.join(dir, "a.txt"), "one\n");
  fs.writeFileSync(path.join(dir, ".gitignore"), "ignored.txt\n");
  git("add", ".");
  git("commit", "-qm", "init");
  return dir;
}

describe("snapshotRoot in a git repo", () => {
  it("captures modified and untracked files, skips ignored ones, and leaves the index alone", async () => {
    const repo = initRepo();
    const options = { shadowDir: tempDir(), timeoutMs: 10_000 };
    const before = await snapshotRoot(repo, options);
    expect(before.store).toBe("repo");

    fs.writeFileSync(path.join(repo, "a.txt"), "two\n");
    fs.writeFileSync(path.join(repo, "new.md"), "# hi\n");
    fs.writeFileSync(path.join(repo, "ignored.txt"), "x\n");
    const after = await snapshotRoot(repo, options);

    const files = parseUnifiedDiff(await diffTrees(before, before.tree, after.tree, options), repo);
    expect(files.map((f) => [f.path, f.status]).sort()).toEqual([
      ["a.txt", "modified"],
      ["new.md", "added"],
    ]);
    expect(execFileSync("git", ["status", "--porcelain"], { cwd: repo }).toString()).toContain("?? new.md");
    expect(
      execFileSync("git", ["diff", "--cached", "--name-only"], {
        cwd: repo,
      }).toString(),
    ).toBe("");
  });

  it("diffs HEAD against a snapshot", async () => {
    const repo = initRepo();
    const options = { shadowDir: tempDir(), timeoutMs: 10_000 };
    fs.writeFileSync(path.join(repo, "a.txt"), "changed\n");
    const now = await snapshotRoot(repo, options);
    const head = await headTree(repo, options);
    const files = parseUnifiedDiff(await diffTrees(now, head!, now.tree, options), repo);
    expect(files.map((f) => f.path)).toEqual(["a.txt"]);
  });
});

describe("snapshotRoot outside git", () => {
  it("uses a shadow store and adds nothing to the folder", async () => {
    const folder = tempDir();
    const options = { shadowDir: tempDir(), timeoutMs: 10_000 };
    fs.writeFileSync(path.join(folder, "doc.md"), "a\n");
    const before = await snapshotRoot(folder, options);
    expect(before.store).toBe("shadow");
    fs.writeFileSync(path.join(folder, "doc.md"), "b\n");
    const after = await snapshotRoot(folder, options);
    const files = parseUnifiedDiff(await diffTrees(before, before.tree, after.tree, options), folder);
    expect(files.map((f) => f.path)).toEqual(["doc.md"]);
    expect(fs.readdirSync(folder)).toEqual(["doc.md"]);
  });
});
