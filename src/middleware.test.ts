import { describe, expect, it } from 'vitest';
import middleware from '../middleware';

describe('public resource routes', () => {
  it('serves the homepage instead of redirecting it to the ticket archive', () => {
    expect(middleware(new Request('https://example.test/'))).toBeUndefined();
  });

  it('keeps ticket logs public', () => {
    expect(middleware(new Request('https://example.test/ticket-log'))).toBeUndefined();
  });

  it('makes the rules document public', () => {
    expect(middleware(new Request('https://example.test/rules'))).toBeUndefined();
  });

  it('makes explicitly shared character pages public', () => {
    expect(middleware(new Request('https://example.test/public/characters/11111111-1111-4111-8111-111111111111'))).toBeUndefined();
  });

  it('lets the password-only database admin screen reach its client-side gate', () => {
    expect(middleware(new Request('https://example.test/db-admin'))).toBeUndefined();
  });

  it.each([
    '/characters',
    '/characters/11111111-1111-4111-8111-111111111111',
    '/citizens',
    '/guilds',
    '/guilds/11111111-1111-4111-8111-111111111111'
  ])('lets member registry route %s reach the client-side session gate', (pathname) => {
    expect(middleware(new Request(`https://example.test${pathname}`))).toBeUndefined();
  });

  it('continues to protect unreleased routes', () => {
    const response = middleware(new Request('https://example.test/games'));
    expect(response?.status).toBe(401);
  });
});
