import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/lib/supabase/public-paths";

describe("isPublicPath", () => {
  it("trata /login como rota pública", () => {
    expect(isPublicPath("/login")).toBe(true);
  });

  it("trata subcaminhos de /login como públicos", () => {
    expect(isPublicPath("/login/reset")).toBe(true);
  });

  it("trata /dashboard como rota protegida", () => {
    expect(isPublicPath("/dashboard")).toBe(false);
  });

  it("trata /sem-acesso como rota não pública (exige sessão)", () => {
    expect(isPublicPath("/sem-acesso")).toBe(false);
  });

  it("trata a raiz como rota protegida", () => {
    expect(isPublicPath("/")).toBe(false);
  });
});
