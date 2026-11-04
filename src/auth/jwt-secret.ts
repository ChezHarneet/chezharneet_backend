export function getJwtSecret() {
  const secret = process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET or JWT_ACCESS_SECRET must be configured in production");
  }
  return secret ?? "development-jwt-secret";
}
