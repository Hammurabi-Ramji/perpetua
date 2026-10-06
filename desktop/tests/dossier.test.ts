import { describe, it, expect } from "vitest";

import { buildDossier } from "$lib/dossier";
import type { License } from "$lib/types";

function sample(overrides: Partial<License> = {}): License {
  return {
    id: 1,
    user_id: 1,
    product_name: "Rytr AI",
    license_key: "KEY-123",
    purchase_date: "2026-01-01",
    expiry_date: null,
    status: "active",
    source_site: "appsumo",
    product_url: "https://rytr.me",
    redemption_url: null,
    download_url: null,
    notes: "AI writing assistant",
    action_required: false,
    action_description: null,
    action_deadline: null,
    keepalive_days: 90,
    last_active: "2026-06-01",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildDossier", () => {
  it("produces all four sections and a slugged filename", () => {
    const { filename, content } = buildDossier(sample());
    expect(filename).toBe("rytr-ai-dossier.md");
    expect(content).toContain("# Rytr AI — license dossier");
    expect(content).toContain("## 1. Identification");
    expect(content).toContain("## 2. Categorization");
    expect(content).toContain("## 3. Features & functionality");
    expect(content).toContain("## 4. Best use cases");
  });

  it("fills identification and maintenance from the record", () => {
    const { content } = buildDossier(sample());
    expect(content).toContain("Marketplace / source: AppSumo");
    expect(content).toContain("Log in at least every 90 days");
    expect(content).toContain("AI writing assistant");
  });

  it("degrades gracefully when fields are missing", () => {
    const { content } = buildDossier(
      sample({
        source_site: null,
        keepalive_days: null,
        notes: null,
        purchase_date: null,
      }),
    );
    expect(content).toContain("Marketplace / source: Not recorded");
    expect(content).toContain("Login cadence: Not tracked");
  });
});
