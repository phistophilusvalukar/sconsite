import { describe, expect, it } from 'vitest';
import middleware from '../middleware';

describe('public resource routes', () => {
  it('keeps ticket logs public', () => {
    expect(middleware(new Request('https://example.test/ticket-log'))).toBeUndefined();
  });

  it('makes the rules document public', () => {
    expect(middleware(new Request('https://example.test/rules'))).toBeUndefined();
  });

  it('continues to protect registry routes', () => {
    const response = middleware(new Request('https://example.test/guilds'));
    expect(response?.status).toBe(401);
  });
});
