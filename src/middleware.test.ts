import { describe, expect, it } from 'vitest';
import middleware from '../middleware';

describe('public resource routes', () => {
  it.each(['/arcade', '/arcade/'])('allows %s without the admin password', pathname => {
    expect(middleware(new Request(`https://example.test${pathname}`))).toBeUndefined();
  });
  it('does not expose similarly named arcade paths', () => {
    expect(middleware(new Request('https://example.test/arcade-admin'))?.status).toBe(401);
  });
  it.each(['/westmarch', '/westmarch/schedule', '/westmarch/controls', '/westmarch/events/example'])(
    'lets %s reach the shared account gate without the site password', pathname => {
      expect(middleware(new Request(`https://example.test${pathname}`))).toBeUndefined();
    }
  );
  it('does not expose similarly named Westmarch paths', () => {
    expect(middleware(new Request('https://example.test/westmarch-private'))?.status).toBe(401);
  });
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

  it.each(['/multiplayer', '/multiplayer/', '/multiplayer/matches/11111111-1111-4111-8111-111111111111'])(
    'allows multiplayer route %s without the site password', (pathname) => {
      expect(middleware(new Request(`https://example.test${pathname}`))).toBeUndefined();
    }
  );

  it.each(['/ancient-terminal', '/ancient-terminal/', '/ancient-terminal/phase/phase_2a'])(
    'allows Ancient Terminal route %s without the site password', (pathname) => {
      expect(middleware(new Request(`https://example.test${pathname}`))).toBeUndefined();
    }
  );

  it('keeps similarly named routes behind the site password', () => {
    expect(middleware(new Request('https://example.test/multiplayer-admin'))?.status).toBe(401);
    expect(middleware(new Request('https://example.test/ancient-terminal-admin'))?.status).toBe(401);
    expect(middleware(new Request('https://example.test/escape-rooms-admin'))?.status).toBe(401);
  });

  it.each(['/escape-rooms', '/escape-rooms/', '/escape-rooms/11111111-1111-4111-8111-111111111111'])(
    'lets escape room route %s reach the Discord session gate without the site password', (pathname) => {
      expect(middleware(new Request(`https://example.test${pathname}`))).toBeUndefined();
    }
  );
});
