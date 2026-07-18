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

export class LocalJwtVerifier implements JwtVerifier {
  async verify(token: string): Promise<VerifiedIdentity> {
    if (!token.startsWith("local:")) throw new Error("Local token must use local:<player-id>");
    const userId=token.slice(6);
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(userId)) throw new Error("Invalid local player id");
    return {userId,expiresAt:Math.floor(Date.now()/1000)+3600,claims:{mode:"local"}};
  }
}

export async function createSupabaseJwtVerifier(url: string, audience = "authenticated"): Promise<JwtVerifier> {
  const { createRemoteJWKSet, jwtVerify } = await import("jose");
  const issuer=`${url.replace(/\/$/,"")}/auth/v1`;
  const jwks=createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  return new FunctionJwtVerifier(async token => {
    const {payload}=await jwtVerify(token,jwks,{issuer,audience});
    if (!payload.sub || !payload.exp) throw new Error("JWT is missing subject or expiry");
    return {userId:payload.sub,expiresAt:payload.exp,claims:{...payload}};
  });
}
