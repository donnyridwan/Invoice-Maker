import { beforeEach, describe, expect, it } from "vitest";
import {
  archiveClient,
  createClient,
  getClient,
  listClients,
  restoreClient,
  updateClient,
} from "@/features/clients/queries";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createTestUser, resetDb } from "./helpers";

const client = (overrides: Record<string, unknown> = {}) => ({
  name: "PT Maju",
  defaultCurrency: "IDR",
  defaultLanguage: "id",
  ...overrides,
});

describe("clients", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("trims the name and stores optional fields as null when blank", async () => {
    const u = await createTestUser();
    const created = await createClient(u.id, client({ name: "  PT Maju  ", company: "", email: " ", country: "id" }));
    expect(created).toMatchObject({
      name: "PT Maju",
      company: null,
      email: null,
      country: "ID",
      defaultCurrency: "IDR",
      defaultLanguage: "id",
      archivedAt: null,
    });
  });

  it("rejects invalid input", async () => {
    const u = await createTestUser();
    await expect(createClient(u.id, client({ email: "bukan-email" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createClient(u.id, client({ name: "x".repeat(201) }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createClient(u.id, client({ name: "   " }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createClient(u.id, client({ country: "IDN" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createClient(u.id, client({ defaultCurrency: "XYZ" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createClient(u.id, client({ defaultLanguage: "fr" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createClient(u.id, client({ phone: "1".repeat(31) }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createClient(u.id, client({ address: "x".repeat(2001) }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createClient(u.id, client({ notes: "x".repeat(2001) }))).rejects.toBeInstanceOf(ValidationError);
    expect(await listClients(u.id, { includeArchived: true })).toEqual([]);
  });

  it("searches name, company and email case-insensitively, ordered by name", async () => {
    const u = await createTestUser();
    await createClient(u.id, client({ name: "PT Maju" }));
    await createClient(u.id, client({ name: "Budi", company: "Maju Jaya Studio" }));
    await createClient(u.id, client({ name: "Citra", email: "citra@MAJU.example" }));
    await createClient(u.id, client({ name: "Acme Inc" }));

    const found = await listClients(u.id, { search: "maju" });
    expect(found.map((c) => c.name)).toEqual(["Budi", "Citra", "PT Maju"]);
    expect((await listClients(u.id, { search: "acme" })).map((c) => c.name)).toEqual(["Acme Inc"]);
    expect((await listClients(u.id, { search: "  " })).map((c) => c.name)).toEqual([
      "Acme Inc",
      "Budi",
      "Citra",
      "PT Maju",
    ]);
    // LIKE wildcards in the search are literals, not patterns.
    expect(await listClients(u.id, { search: "%" })).toEqual([]);
    expect(await listClients(u.id, { search: "_" })).toEqual([]);
  });

  it("hides archived clients unless asked, and restores them", async () => {
    const u = await createTestUser();
    const a = await createClient(u.id, client());
    await archiveClient(u.id, a.id);

    expect(await listClients(u.id)).toEqual([]);
    expect(await listClients(u.id, { search: "maju" })).toEqual([]);
    const all = await listClients(u.id, { includeArchived: true });
    expect(all).toHaveLength(1);
    expect(all[0].archivedAt).toBeInstanceOf(Date);

    await restoreClient(u.id, a.id);
    expect(await listClients(u.id)).toHaveLength(1);
    expect((await getClient(u.id, a.id)).archivedAt).toBeNull();
  });

  it("updates a client and can clear optional fields", async () => {
    const u = await createTestUser();
    const a = await createClient(u.id, client({ email: "a@b.co", company: "X" }));
    const updated = await updateClient(u.id, a.id, client({ name: "PT Maju Jaya", email: "", defaultCurrency: "USD" }));
    expect(updated).toMatchObject({ name: "PT Maju Jaya", email: null, company: null, defaultCurrency: "USD" });
    await expect(updateClient(u.id, a.id, client({ name: "" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("never lets another user read or change a client", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const owned = await createClient(a.id, client());

    await expect(getClient(b.id, owned.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateClient(b.id, owned.id, client({ name: "Hacked" }))).rejects.toBeInstanceOf(NotFoundError);
    await expect(archiveClient(b.id, owned.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(restoreClient(b.id, owned.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getClient(a.id, "not-a-uuid")).rejects.toBeInstanceOf(NotFoundError);

    expect(await listClients(b.id, { includeArchived: true, search: "maju" })).toEqual([]);
    const after = await getClient(a.id, owned.id);
    expect(after.name).toBe("PT Maju");
    expect(after.archivedAt).toBeNull();
  });
});
