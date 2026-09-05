import { describe, expect, it } from "vitest";
import { isValidBranchName } from "./check-branch-name.mjs";

describe("isValidBranchName", () => {
  it("allows main", () => {
    expect(isValidBranchName("main")).toBe(true);
  });

  it("allows conventional type/slug branches", () => {
    expect(isValidBranchName("feat/csv-import")).toBe(true);
    expect(isValidBranchName("fix/holdings-mismatch")).toBe(true);
    expect(isValidBranchName("chore/husky-hooks")).toBe(true);
    expect(isValidBranchName("hotfix/login")).toBe(true);
  });

  it("rejects unknown shapes", () => {
    expect(isValidBranchName("feature/csv-import")).toBe(false);
    expect(isValidBranchName("Feat/csv-import")).toBe(false);
    expect(isValidBranchName("feat/CSV-Import")).toBe(false);
    expect(isValidBranchName("feat/")).toBe(false);
    expect(isValidBranchName("csv-import")).toBe(false);
    expect(isValidBranchName("feat/csv import")).toBe(false);
  });
});
