import { resolveTheme } from "../ThemeProvider";

describe("theme resolution (FR-15.1, FR-15.2)", () => {
  it("follows the phone while set to System", () => {
    expect(resolveTheme("system", "dark")).toBe("dark");
    expect(resolveTheme("system", "light")).toBe("light");
  });

  it("falls back to light when the phone says nothing", () => {
    expect(resolveTheme("system", null)).toBe("light");
    expect(resolveTheme("system", undefined)).toBe("light");
  });

  it("ignores the phone once a choice is made", () => {
    expect(resolveTheme("light", "dark")).toBe("light");
    expect(resolveTheme("dark", "light")).toBe("dark");
  });
});
