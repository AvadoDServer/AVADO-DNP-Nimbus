import { Application, Context, send } from 'https://deno.land/x/oak/mod.ts';

// Serves the shared AVADO Client UI (a Vite build) on port 80.
//
// - Any file that exists under the web root is served with its content type
//   (hashed JS/CSS, fonts, images, client-config.json, ...).
// - Any other path falls back to index.html, so client-side routes load.
// - index.html and every other unhashed file are served no-cache, so an
//   updated package never keeps showing the previous UI.
// - /assets/* files are content-hashed by Vite and cached long-term.
//   A missing /assets/* file is a real 404, never index.html.
//
// Optional arguments, for local testing only: <root> <port>
const root = Deno.args[0] ?? '/usr/local/wizard';
const port = Number(Deno.args[1] ?? 80);

const NO_CACHE = 'no-cache, no-store, must-revalidate';
const IMMUTABLE = 'public, max-age=31536000, immutable';

// deno-lint-ignore no-explicit-any
const statusOf = (err: any): number => (typeof err?.status === 'number' ? err.status : 500);

async function sendIndex(ctx: Context) {
    await send(ctx, '/index.html', { root });
    ctx.response.headers.set('Cache-Control', NO_CACHE);
}

const app = new Application();

app.use(async (ctx: Context) => {
    const method = ctx.request.method;
    if (method !== 'GET' && method !== 'HEAD') {
        ctx.response.status = 405;
        ctx.response.headers.set('Allow', 'GET, HEAD');
        ctx.response.body = 'Method Not Allowed';
        return;
    }

    const path = ctx.request.url.pathname;
    try {
        if (path === '/' || path === '/index.html') {
            await sendIndex(ctx);
            return;
        }

        // send() resolves the path under root, refuses paths that escape it
        // and throws 404 for missing files and for directories.
        let served: string | undefined;
        try {
            served = await send(ctx, path, { root });
        } catch (err) {
            if (statusOf(err) !== 404) throw err;
        }

        if (served) {
            ctx.response.headers.set('Cache-Control', path.startsWith('/assets/') ? IMMUTABLE : NO_CACHE);
            return;
        }

        if (path.startsWith('/assets/')) {
            ctx.response.status = 404;
            ctx.response.body = '404 Not Found';
            return;
        }

        await sendIndex(ctx);
    } catch (err) {
        const status = statusOf(err);
        ctx.response.status = status;
        ctx.response.body = status === 404 ? '404 Not Found' : status >= 500 ? 'Internal Server Error' : `Request refused (${status})`;
    }
});

console.log(`Wizard running on http://localhost:${port}`);
await app.listen({ port });
