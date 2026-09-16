type WorkerService = {
  fetch(request: Request): Promise<Response>;
};

export interface Env {
  ASSETS: WorkerService;
  API: WorkerService;
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
