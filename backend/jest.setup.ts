import crypto from 'crypto';

// Mock jose module to avoid ESM import issues in jest
jest.mock('jose', () => {
  const sign = jest.fn(async (payload: any, secret: Uint8Array) => {
    // Create a simple base64url-encoded JWT
    const secretStr = new TextDecoder().decode(secret);
    const header = JSON.stringify({ alg: 'HS256', typ: 'JWT' });
    const headerB64 = Buffer.from(header).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const bodyB64 = Buffer.from(JSON.stringify(payload)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const message = `${headerB64}.${bodyB64}`;
    const signature = crypto.createHmac('sha256', secretStr).update(message).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return `${message}.${signature}`;
  });

  const verify = jest.fn(async (token: string, secret: Uint8Array) => {
    try {
      const [headerB64, bodyB64, signatureB64] = token.split('.');
      if (!headerB64 || !bodyB64 || !signatureB64) throw new Error('Invalid token format');

      const secretStr = new TextDecoder().decode(secret);
      const message = `${headerB64}.${bodyB64}`;
      const expectedSignature = crypto.createHmac('sha256', secretStr).update(message).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

      if (signatureB64 !== expectedSignature) throw new Error('Invalid signature');

      const payload = JSON.parse(Buffer.from(bodyB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
      return { payload };
    } catch (err) {
      throw err;
    }
  });

  class SignJWT {
    private payload: Record<string, any> = {};
    private protectedHeader: Record<string, any> = {};
    private claims: Record<string, any> = {};

    constructor(payload: Record<string, any>) {
      this.payload = payload;
    }

    setProtectedHeader(header: Record<string, any>) {
      this.protectedHeader = header;
      return this;
    }

    setSubject(sub: string) {
      this.claims.sub = sub;
      return this;
    }

    setIssuedAt() {
      this.claims.iat = Math.floor(Date.now() / 1000);
      return this;
    }

    setExpirationTime(exp: string) {
      this.claims.exp = exp;
      return this;
    }

    async sign(secret: Uint8Array) {
      const finalPayload = { ...this.payload, ...this.claims };
      return sign(finalPayload, secret);
    }
  }

  const jwtVerify = verify;

  return { SignJWT, jwtVerify };
});
