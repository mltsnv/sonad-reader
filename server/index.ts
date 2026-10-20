export interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

interface Env {
  AI?: AiBinding;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const DEFAULT_CF_MODEL = '@cf/google/gemma-4-26b-a4b-it';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: corsHeaders });
}

function extractTextFromCfResponse(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const obj = raw as Record<string, unknown>;
  if (typeof obj.response === 'string') return obj.response;
  const choices = obj.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown>;
    const msg = first.message as Record<string, unknown> | undefined;
    if (msg && typeof msg.content === 'string') return msg.content;
  }
  return JSON.stringify(raw);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      if (url.pathname === '/api/ai' && request.method === 'POST') {
        if (!env.AI) {
          return jsonResponse(
            { error: 'Cloudflare Workers AI binding (env.AI) не подключён.' },
            503,
          );
        }

        try {
          const body = (await request.json()) as {
            systemPrompt?: string;
            userPrompt?: string;
            model?: string;
          };

          const systemPrompt = (body.systemPrompt ?? '').trim();
          const userPrompt = (body.userPrompt ?? '').trim();
          const model =
            body.model && body.model.startsWith('@cf/')
              ? body.model
              : DEFAULT_CF_MODEL;

          if (!userPrompt) {
            return jsonResponse({ error: 'Пустой запрос к AI.' }, 400);
          }

          const raw = await env.AI.run(model, {
            messages: [
              {
                role: 'system',
                content: `${systemPrompt}\nReturn ONLY valid JSON without markdown fences or extra commentary.`,
              },
              { role: 'user', content: userPrompt },
            ],
            max_tokens: 3072,
            temperature: 0.65,
            chat_template_kwargs: { enable_thinking: false },
          });

          const text = extractTextFromCfResponse(raw);
          return jsonResponse({ text, model });
        } catch (err: unknown) {
          return jsonResponse(
            {
              error:
                err instanceof Error
                  ? err.message
                  : 'Ошибка выполнения запроса к Cloudflare Workers AI.',
            },
            500,
          );
        }
      }

      return jsonResponse({ error: 'Not found' }, 404);
    }

    const assetRes = await env.ASSETS.fetch(request);
    const headers = new Headers(assetRes.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    return new Response(assetRes.body, {
      status: assetRes.status,
      statusText: assetRes.statusText,
      headers,
    });
  },
};
