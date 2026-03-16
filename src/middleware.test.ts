import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock jose before anything imports middleware
vi.mock('jose', () => ({
  jwtVerify: vi.fn(),
}));

import { jwtVerify } from 'jose';

// Dynamically import middleware after env is set
let middleware: (request: NextRequest) => Promise<import('next/server').NextResponse>;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-key';
  const mod = await import('./middleware');
  middleware = mod.middleware;
});

describe('middleware auth bypass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows /_next paths without auth', async () => {
    const request = new NextRequest('http://localhost/_next/static/chunk.js');
    const response = await middleware(request);
    expect(response.status).not.toBe(307);
  });

  it('allows /favicon paths without auth', async () => {
    const request = new NextRequest('http://localhost/favicon.ico');
    const response = await middleware(request);
    expect(response.status).not.toBe(307);
  });

  it('allows /login without auth', async () => {
    const request = new NextRequest('http://localhost/login');
    const response = await middleware(request);
    expect(response.status).not.toBe(307);
  });

  it('BLOCKS /api/quotes/test.json without auth (dot bypass attempt)', async () => {
    const request = new NextRequest('http://localhost/api/quotes/test.json');
    const response = await middleware(request);
    // Should redirect to login (307) because this is an API path, NOT a static file
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login');
  });

  it('BLOCKS /api/products/export.csv without auth (dot bypass attempt)', async () => {
    const request = new NextRequest('http://localhost/api/products/export.csv');
    const response = await middleware(request);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login');
  });

  it('BLOCKS /orders/test.html without auth (dot bypass attempt)', async () => {
    const request = new NextRequest('http://localhost/orders/test.html');
    const response = await middleware(request);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login');
  });

  it('redirects unauthenticated requests to /login', async () => {
    const request = new NextRequest('http://localhost/api/quotes');
    const response = await middleware(request);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login');
  });

  it('allows authenticated requests with valid token', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { userId: 'user1', username: 'test', roleId: 'role1' },
      protectedHeader: { alg: 'HS256' },
    } as never);

    const request = new NextRequest('http://localhost/api/quotes');
    request.cookies.set('bts-auth-token', 'valid-token');
    const response = await middleware(request);
    // Should pass through (200 next())
    expect(response.status).not.toBe(307);
  });
});
