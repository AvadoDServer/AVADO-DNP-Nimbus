import { Application, Context, Router, send, Status } from 'https://deno.land/x/oak/mod.ts';

const app = new Application();
const router = new Router();

const port = 80;
// const root = '../wizard/build'
const root = '/usr/local/wizard'

// Serve static files and index.html for SPA
app.use(async (ctx: Context, next) => {
    const path = ctx.request.url.pathname;
    const isStaticFile = path.startsWith('/static/') || path.endsWith('.css') || path.endsWith('.js');

    try {
        if (isStaticFile) {
            // Serve static files like CSS, JS, and images from the 'static' directory
            await send(ctx, path, { root });
        } else {
            // Serve index.html for all other routes to support React Router
            await send(ctx, '/index.html', { root });
        }
    } catch (error) {
        await next();
    }
});

// Custom route for '/index.html' to set no-cache headers
router.get('/index.html', async (context) => {
    await send(context, 'index.html', {
        root,
    });
    context.response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
});

// Error page handling
app.use(async (ctx, next) => {
    try {
        await next();
        if (ctx.response.status === Status.NotFound) {
            ctx.response.body = '404 Not Found';
        }
    } catch (err) {
        ctx.response.status = err.status || Status.InternalServerError;
        ctx.response.body = 'Internal Server Error'
    }
});

app.use(router.routes());
app.use(router.allowedMethods());

console.log(`Wizard running on http://localhost:${port}`);
await app.listen({ port });