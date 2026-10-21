import { beforeEach, describe, expect, it } from "vitest";
import {
  archiveCatalogItem,
  createCatalogItem,
  getCatalogItem,
  listCatalogItems,
  restoreCatalogItem,
  updateCatalogItem,
} from "@/features/catalog/queries";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createTestUser, resetDb } from "./helpers";

const item = (overrides: Record<string, unknown> = {}) => ({
  name: "Desain logo",
  unit: "proyek",
  unitPriceMinor: 1500000,
  currency: "IDR",
  ...overrides,
});

describe("catalog", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("stores an item and reads the price back as a number", async () => {
    const u = await createTestUser();
    const created = await createCatalogItem(u.id, item({ name: "  Desain logo  ", description: "" }));
    expect(created).toMatchObject({
      name: "Desain logo",
      description: null,
      unit: "proyek",
      currency: "IDR",
      archivedAt: null,
    });
    expect(typeof created.unitPriceMinor).toBe("number");

    const read = await getCatalogItem(u.id, created.id);
    expect(read.unitPriceMinor).toBe(1500000);
    expect(typeof read.unitPriceMinor).toBe("number");
  });

  it("allows a free item and a unit-less item", async () => {
    const u = await createTestUser();
    const created = await createCatalogItem(u.id, { name: "Konsultasi", unitPriceMinor: 0, currency: "USD" });
    expect(created).toMatchObject({ unit: null, unitPriceMinor: 0, currency: "USD" });
  });

  it("rejects invalid input", async () => {
    const u = await createTestUser();
    await expect(createCatalogItem(u.id, item({ unitPriceMinor: -1 }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createCatalogItem(u.id, item({ unitPriceMinor: 1.5 }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createCatalogItem(u.id, item({ unitPriceMinor: "abc" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createCatalogItem(u.id, item({ currency: "XYZ" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createCatalogItem(u.id, item({ name: " " }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createCatalogItem(u.id, item({ name: "x".repeat(201) }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createCatalogItem(u.id, item({ description: "x".repeat(2001) }))).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(createCatalogItem(u.id, item({ unit: "x".repeat(31) }))).rejects.toBeInstanceOf(ValidationError);
    expect(await listCatalogItems(u.id, { includeArchived: true })).toEqual([]);
  });

  it("searches name and description, ordered by name", async () => {
    const u = await createTestUser();
    await createCatalogItem(u.id, item({ name: "Desain logo" }));
    await createCatalogItem(u.id, item({ name: "Cetak", description: "Cetak LOGO di kaos" }));
    await createCatalogItem(u.id, item({ name: "Hosting" }));

    expect((await listCatalogItems(u.id, { search: "logo" })).map((i) => i.name)).toEqual(["Cetak", "Desain logo"]);
    expect((await listCatalogItems(u.id)).map((i) => i.name)).toEqual(["Cetak", "Desain logo", "Hosting"]);
    expect(await listCatalogItems(u.id, { search: "%" })).toEqual([]);
  });

  it("hides archived items unless asked, and restores them", async () => {
    const u = await createTestUser();
    const a = await createCatalogItem(u.id, item());
    await archiveCatalogItem(u.id, a.id);

    expect(await listCatalogItems(u.id)).toEqual([]);
    const all = await listCatalogItems(u.id, { includeArchived: true });
    expect(all).toHaveLength(1);
    expect(all[0].archivedAt).toBeInstanceOf(Date);

    await restoreCatalogItem(u.id, a.id);
    expect(await listCatalogItems(u.id)).toHaveLength(1);
  });

  it("updates an item", async () => {
    const u = await createTestUser();
    const a = await createCatalogItem(u.id, item());
    const updated = await updateCatalogItem(u.id, a.id, item({ unitPriceMinor: 2500000, unit: "" }));
    expect(updated).toMatchObject({ unitPriceMinor: 2500000, unit: null });
    await expect(updateCatalogItem(u.id, a.id, item({ unitPriceMinor: -5 }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("never lets another user read or change an item", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const owned = await createCatalogItem(a.id, item());

    await expect(getCatalogItem(b.id, owned.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateCatalogItem(b.id, owned.id, item({ name: "Hacked" }))).rejects.toBeInstanceOf(NotFoundError);
    await expect(archiveCatalogItem(b.id, owned.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(restoreCatalogItem(b.id, owned.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getCatalogItem(a.id, "not-a-uuid")).rejects.toBeInstanceOf(NotFoundError);

    expect(await listCatalogItems(b.id, { includeArchived: true })).toEqual([]);
    const after = await getCatalogItem(a.id, owned.id);
    expect(after.name).toBe("Desain logo");
    expect(after.archivedAt).toBeNull();
  });
});
