import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.doUnmock("$lib/api");
});

describe("Perpetua vault tools page", () => {
  it(
    "creates a backup from the page",
    async () => {
    vi.doMock("$lib/api", () => ({
      createBackup: vi.fn().mockResolvedValue({
        file_name: "perpetua-backup-20260514-040000.db",
        created_at: "2026-05-14T04:00:00Z",
        size_bytes: 2048,
      }),
      exportLicensesCsv: vi.fn(),
      exportLicensesJson: vi.fn(),
      importLicenses: vi.fn(),
      listBackups: vi.fn().mockResolvedValue([]),
    }));

    const { default: VaultPage } =
      await import("../src/routes/vault/+page.svelte");
    render(VaultPage);

    await fireEvent.click(
      screen.getByRole("button", { name: "Create backup" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Created perpetua-backup-20260514-040000.db."),
      ).toBeTruthy();
    });
  },
    10000,
  );

  it("renders export, import, and backup sections", async () => {
    vi.doMock("$lib/api", () => ({
      createBackup: vi.fn(),
      exportLicensesCsv: vi.fn().mockResolvedValue({
        filename: "perpetua-licenses.csv",
        content: "product_name,license_key\nSuite,AAAA-BBBB",
      }),
      exportLicensesJson: vi.fn().mockResolvedValue({
        filename: "perpetua-licenses.json",
        content: '{"licenses":[]}',
      }),
      importLicenses: vi.fn(),
      listBackups: vi.fn().mockResolvedValue([
        {
          file_name: "perpetua-backup-20260514-040000.db",
          created_at: "2026-05-14T04:00:00Z",
          size_bytes: 2048,
        },
      ]),
    }));

    const { default: VaultPage } =
      await import("../src/routes/vault/+page.svelte");
    const clickSpy = vi.fn();
    const createObjectUrl = vi.fn().mockReturnValue("blob:mock");
    const revokeObjectUrl = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;

    document.createElement = ((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === "a") {
        element.click = clickSpy;
      }
      return element;
    }) as typeof document.createElement;
    URL.createObjectURL = createObjectUrl;
    URL.revokeObjectURL = revokeObjectUrl;

    render(VaultPage);

    expect(
      screen.getByText(
        "Move, restore, and safeguard your local license vault.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Local backups")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Export JSON snapshot" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create backup" })).toBeTruthy();

    await fireEvent.click(
      screen.getByRole("button", { name: "Export JSON snapshot" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Downloaded perpetua-licenses.json."),
      ).toBeTruthy();
    });
    expect(clickSpy).toHaveBeenCalled();

    document.createElement = originalCreateElement;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });
});
