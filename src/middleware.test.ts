import { describe, expect, it } from 'vitest';
import middleware from '../middleware';

describe('public resource routes', () => {
  it('keeps ticket logs public', () => {
    expect(middleware(new Request('https://example.test/ticket-log'))).toBeUndefined();
  });

  it('makes the rules document public', () => {
    expect(middleware(new Request('https://example.test/rules'))).toBeUndefined();
  });

  it('makes explicitly shared character pages public', () => {
    expect(middleware(new Request('https://example.test/public/characters/11111111-1111-4111-8111-111111111111'))).toBeUndefined();
  });

  it('keeps normal character profile routes protected', () => {
    const response = middleware(new Request('https://example.test/characters/11111111-1111-4111-8111-111111111111'));
    expect(response?.status).toBe(401);
  });

  it('continues to protect registry routes', () => {
    const response = middleware(new Request('https://example.test/guilds'));
    expect(response?.status).toBe(401);
  });
});
