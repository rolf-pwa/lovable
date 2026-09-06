import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useCurrentEntityFromRoute } from "./useCurrentEntityFromRoute";

function renderAt(path: string) {
  return renderHook(() => useCurrentEntityFromRoute(), {
    wrapper: ({ children }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>,
  });
}

describe("useCurrentEntityFromRoute", () => {
  it("resolves a contact from /contacts/:id", () => {
    const { result } = renderAt("/contacts/abc-123");
    expect(result.current).toEqual({ type: "contact", id: "abc-123" });
  });

  it("resolves a contact from /contacts/:id/edit", () => {
    const { result } = renderAt("/contacts/abc-123/edit");
    expect(result.current).toEqual({ type: "contact", id: "abc-123" });
  });

  it("resolves a household from /households/:id", () => {
    const { result } = renderAt("/households/hh-456");
    expect(result.current).toEqual({ type: "household", id: "hh-456" });
  });

  it("resolves a family from /families/:id", () => {
    const { result } = renderAt("/families/fam-789");
    expect(result.current).toEqual({ type: "family", id: "fam-789" });
  });

  it("returns null for a page with no matching entity route", () => {
    const { result } = renderAt("/dashboard");
    expect(result.current).toBeNull();
  });

  it("returns null for a list route with no id segment", () => {
    const { result } = renderAt("/contacts");
    expect(result.current).toBeNull();
  });
});
