export const PUBLIC_PATHS = ["/login"];

// Único ponto que decide se um caminho é acessível sem sessão autenticada.
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname.startsWith(path));
}
