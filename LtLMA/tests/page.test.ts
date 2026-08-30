import { render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/stores/auth", () => ({
  auth: {
    subscribe: (
      run: (value: { loading: boolean; error: string | null }) => void,
    ) => {
      run({ loading: false, error: null });
      return () => {};
    },
    login: vi.fn(),
    register: vi.fn(),
  },
}));

import LoginPage from "../src/routes/login/+page.svelte";

describe("Perpetua auth page", () => {
  it("renders the login shell", () => {
    render(LoginPage);

    expect(screen.getByText("Perpetua Desktop")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Sign in" }).length).toBe(2);
    expect(screen.getByRole("button", { name: "Create account" })).toBeTruthy();
  });
});
