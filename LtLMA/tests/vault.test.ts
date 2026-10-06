import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VaultPage from "../src/routes/vault/+page.svelte";

const api = vi.hoisted(() => ({
  createBackup: vi.fn(),
  exportLicensesCsv: vi.fn(),
  exportLicensesJson: vi.fn(),
  importLicenses: vi.fn(),
  listBackups: vi.fn(),
  getCloudBackupSettings: vi.fn(),
}));
vi.mock("$lib/api", () => api);

beforeEach(() => {
  vi.clearAllMocks();
  api.listBackups.mockResolvedValue([]);
  api.getCloudBackupSettings.mockResolvedValue(null);
});

afterEach(() => cleanup());

describe("Perpetua vault tools page", () => {
  it("creates a backup from the page", async () => {
    api.createBackup.mockResolvedValue({
      file_name: "perpetua-backup-20260514-040000.db",
      created_at: "2026-05-14T04:00:00Z",
      size_bytes: 2048,
    });
    render(VaultPage);
    await fireEvent.click(screen.getByRole("button", { name: "Create backup" }));
    await waitFor(() => {
      expect(screen.getByText("Created perpetua-backup-20260514-040000.db.")).toBeTruthy();
    });
  });

  it("renders export, import, and backup sections", async () => {
    api.exportLicensesCsv.mockResolvedValue({
      filename: "perpetua-licenses.csv",
      content: "product_name,license_key\nSuite,AAAA-BBBB",
    });
    api.exportLicensesJson.mockResolvedValue({
      filename: "perpetua-licenses.json",
      content: '{"licenses":[]}',
    });
    api.listBackups.mockResolvedValue([{
      file_name: "perpetua-backup-20260514-040000.db",
      created_at: "2026-05-14T04:00:00Z",
      size_bytes: 2048,
    }]);
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    document.createElement = ((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === "a") element.click = clickSpy;
      return element;
    }) as typeof document.createElement;
    URL.createObjectURL = vi.fn().mockReturnValue("blob:mock");
    URL.revokeObjectURL = vi.fn();

    try {
      render(VaultPage);
      expect(screen.getByText("Move, restore, and safeguard your local license vault.")).toBeTruthy();
      expect(screen.getByText("Local backups")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Export JSON snapshot" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Export CSV" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Create backup" })).toBeTruthy();
      await fireEvent.click(screen.getByRole("button", { name: "Export JSON snapshot" }));
      await waitFor(() => {
        expect(screen.getByText("Downloaded perpetua-licenses.json.")).toBeTruthy();
      });
      expect(clickSpy).toHaveBeenCalled();
    } finally {
      document.createElement = originalCreateElement;
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
    }
  });
});
