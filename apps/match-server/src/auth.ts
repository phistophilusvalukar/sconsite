export interface VerifiedIdentity { readonly userId: string; readonly expiresAt: number; readonly claims: Readonly<Record<string, unknown>> }
export interface JwtVerifier { verify(accessToken: string): Promise<VerifiedIdentity> }

/** Adapter seam for Supabase/JWKS verification. Production adapters must verify signature, issuer, audience and expiry. */
export class FunctionJwtVerifier implements JwtVerifier {
  constructor(private readonly verifyFn: (token: string) => Promise<VerifiedIdentity>) {}
  verify(token: string): Promise<VerifiedIdentity> {
    if (!token || token.length > 8192) return Promise.reject(new Error("Invalid access token"));
    return this.verifyFn(token);
  }
}
