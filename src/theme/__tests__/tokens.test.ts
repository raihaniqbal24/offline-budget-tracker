import {
  categoryColorOf,
  contrastRatio,
  DARK,
  LIGHT,
  budgetColorOf,
  type ThemeColors,
} from "../tokens";

/** NFR-14: text and essential icons need 4.5:1 in both themes. */
const MIN = 4.5;

describe.each([
  ["light", LIGHT],
  ["dark", DARK],
])("%s theme contrast (NFR-14)", (_name, c: ThemeColors) => {
  it.each([
    "text",
    "textMuted",
    "primary",
    "expense",
    "income",
    "transfer",
    "alert",
  ] as const)("%s reads on both the background and cards", (token) => {
    expect(contrastRatio(c[token], c.background)).toBeGreaterThanOrEqual(MIN);
    expect(contrastRatio(c[token], c.surface)).toBeGreaterThanOrEqual(MIN);
  });

  it("keeps text on a primary button readable", () => {
    expect(contrastRatio(c.onPrimary, c.primary)).toBeGreaterThanOrEqual(MIN);
  });

  it("keeps the undo bar readable, including its action", () => {
    expect(
      contrastRatio(c.inverseText, c.inverseSurface),
    ).toBeGreaterThanOrEqual(MIN);
    expect(
      contrastRatio(c.inverseAccent, c.inverseSurface),
    ).toBeGreaterThanOrEqual(MIN);
  });

  it("keeps a cautionary note readable on its background", () => {
    expect(contrastRatio(c.text, c.warningSurface)).toBeGreaterThanOrEqual(MIN);
  });

  it("keeps the budget levels apart from each other (FR-15.5)", () => {
    const levels = [
      budgetColorOf(c, 50),
      budgetColorOf(c, 75),
      budgetColorOf(c, 90),
      budgetColorOf(c, 100),
    ];
    expect(new Set(levels).size).toBe(4);
  });
});

describe("category colours in dark (FR-15.5)", () => {
  const picked = [
    "#D9822B",
    "#C2457A",
    "#8E5BB5",
    "#2B7BB9",
    "#1F9BA8",
    "#2E9E6B",
    "#1B7F3B",
    "#B3261E",
    "#6B4F3A",
  ];

  it("leaves the user's colour alone in light", () => {
    for (const hex of picked) expect(categoryColorOf(hex, "light")).toBe(hex);
  });

  it("lightens it just enough to read on a dark card, keeping the hue", () => {
    for (const hex of picked) {
      const adjusted = categoryColorOf(hex, "dark");
      expect(contrastRatio(adjusted, DARK.surface)).toBeGreaterThanOrEqual(MIN);
      expect(adjusted).not.toBe(hex);
    }
  });

  it("tells two similar picks apart after adjusting", () => {
    expect(categoryColorOf("#1B7F3B", "dark")).not.toBe(
      categoryColorOf("#2B7BB9", "dark"),
    );
  });
});
