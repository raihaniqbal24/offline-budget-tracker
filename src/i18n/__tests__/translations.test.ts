import en from "../en.json";
import id from "../id.json";
import { SEED_V1 } from "../../db/migrations/001_initial";

type Tree = { [key: string]: string | Tree };

function keys(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === "string" ? [prefix + k] : keys(v, `${prefix}${k}.`),
  );
}

function lookup(tree: Tree, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((node, k) => (node as Tree | undefined)?.[k], tree);
}

describe("translations (NFR-10)", () => {
  it("English and Indonesian have the same keys", () => {
    expect(keys(id as Tree).sort()).toEqual(keys(en as Tree).sort());
  });

  it("has no empty strings", () => {
    for (const tree of [en, id] as Tree[]) {
      for (const k of keys(tree))
        expect(String(lookup(tree, k)).trim()).not.toBe("");
    }
  });

  it("covers every seeded category name", () => {
    const seededKeys = SEED_V1.match(/'category\.[a-zA-Z.]+'/g)!.map((s) =>
      s.slice(1, -1),
    );
    expect(seededKeys.length).toBe(10);
    for (const k of seededKeys) {
      expect(typeof lookup(en as Tree, k)).toBe("string");
      expect(typeof lookup(id as Tree, k)).toBe("string");
    }
  });
});
