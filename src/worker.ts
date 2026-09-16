export interface Env {
  ASSETS: Fetcher;
  API: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return env.API.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
