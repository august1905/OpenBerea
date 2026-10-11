import { afterEach, describe, expect, it, vi } from 'vitest';

import { DataError, loadData } from './fetch';

const respond = (body: string, status: number, type: string) => new Response(body, { status, headers: { 'Content-Type': type } });

describe('loadData', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads JSON data files', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond('{"v":[1]}', 200, 'application/json')));
    await expect(loadData('test/ok.json')).resolves.toEqual({ v: [1] });
  });

  it('reports a missing file as a 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond('Not found', 404, 'text/plain')));
    const error = await loadData('test/missing-404.json').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect((error as DataError).status).toBe(404);
  });

  it("treats the app's page in place of a data file (how the host answers a missing file) as a 404", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond('<!DOCTYPE html><html></html>', 200, 'text/html')));
    const error = await loadData('test/missing-spa.json').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect((error as DataError).status).toBe(404);
  });

  it('forgets a failed load, so a retry fetches again', async () => {
    const fetchMock = vi.fn(async () => respond('<!DOCTYPE html>', 200, 'text/html'));
    vi.stubGlobal('fetch', fetchMock);
    await loadData('test/retry.json').catch(() => {});
    await loadData('test/retry.json').catch(() => {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
