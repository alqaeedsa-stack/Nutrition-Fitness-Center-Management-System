import api from '../apps/api/src/index';

type AssetsBinding = {
  fetch(request: Request): Promise<Response>;
};

type DatabaseBinding = {
  connectionString: string;
};

export interface Env {
  ASSETS: AssetsBinding;
  ENVIRONMENT: string;
  API_VERSION: string;
  HYPERDRIVE?: DatabaseBinding;
  DATABASE_URL?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return api.fetch(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
