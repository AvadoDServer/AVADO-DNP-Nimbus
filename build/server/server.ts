import { Application, Router, Context } from "https://deno.land/x/oak/mod.ts";
import { Status } from "https://deno.land/x/oak_commons@0.5.0/status.ts";
import { oakCors } from "https://deno.land/x/cors/mod.ts";

import { server_config } from "./server_config.ts";
import { defaultsettings, read_settings, write_settings } from "./settings.ts";
import { SupervisorCtl } from "./supervisorctl.ts";

const router = new Router();

router.get('/ping', (context) => {
    context.response.body = 'pong';
});

router.get('/network', (context) => {
    context.response.body = server_config.network;
});

router.get('/name', (context) => {
    context.response.body = server_config.name;
});

router.get('/settings', async (context) => {
    try {
        context.response.type = "json";
        context.response.body = JSON.stringify(await read_settings());
    } catch (err) {
        console.error(`Error in settings file: ${err}`);
        context.response.type = "json";
        context.response.body = JSON.stringify(defaultsettings());
    }
});

router.post('/settings', async (context: Context) => {
    try {
        const json_text = await context.request.body.text();
        const json = JSON.parse(json_text);
        await write_settings(json)
        await restart()
        context.response.body = `Saved settings and restarted`
    } catch (err) {
        console.error(`Could not write settings file: ${err}`);
        context.response.status = Status.UnprocessableEntity
    }
});

router.get('/defaultsettings', (context) => {
    context.response.type = "json";
    context.response.body = defaultsettings();
});

const supervisorCtl = new SupervisorCtl(`localhost`, 5555, '/RPC2')
const restart = async () => {
    await Promise.all(server_config.supervisord_programs.map(name => supervisorCtl.callMethod('supervisor.stopProcess', [name, true])))
    await new Promise(f => setTimeout(f, 3000)); //wait 3 seconds
    await Promise.all(server_config.supervisord_programs.map(name => supervisorCtl.callMethod('supervisor.startProcess', [name, true])))
}

router.post('/service/restart', async (context: Context) => {
    try {
        await restart();
        context.response.body = "restarted";
    } catch (err) {
        console.error("Error restarting: ", err)
        context.response.body = "failed";
        context.response.status = Status.InternalServerError
    }
});

router.post('/service/stop', async (context: Context) => {
    const method = 'supervisor.stopProcess'

    try {
        await Promise.all(server_config.supervisord_programs.map(name => supervisorCtl.callMethod(method, [name, true])))
        context.response.body = "stopped";
    } catch (err) {
        console.error("Error restarting: ", err)
        context.response.body = "failed";
        context.response.status = Status.InternalServerError
    }
});

router.post('/service/start', async (context: Context) => {
    const method = 'supervisor.startProcess'
    try {
        await Promise.all(server_config.supervisord_programs.map(name => supervisorCtl.callMethod(method, [name, true])))
        context.response.body = "started";
    } catch (err) {
        console.error("Error restarting: ", err)
        context.response.body = "failed";
        context.response.status = Status.InternalServerError
    }
});

router.get('/service/status', async (context: Context) => {
    const method = 'supervisor.getAllProcessInfo'
    try {
        const value = await supervisorCtl.callMethod(method, [])
        context.response.type = "json";
        context.response.body = JSON.stringify(value);
    } catch (err) {
        console.error("Error getting status: ", err)
        context.response.body = "failed";
        context.response.status = Status.InternalServerError
    }
});

// checkpointz 
router.get("/:endpoint/checkpointz/v1/beacon/slots/:slot", async (context: any) => {
    const endpoint = context.params.endpoint;
    const slot = context.params.slot;
    const url = `https://${endpoint}/checkpointz/v1/beacon/slots/${slot}`

    const response = await fetch(url);
    context.response.body = await response.json();
    context.response.status = response.status;
});

router.get("/:endpoint/api/v1/block/:slot", async (context: any) => {
    const endpoint = context.params.endpoint;
    const slot = context.params.slot;
    const url = `https://${endpoint}/api/v1/block/${slot}`

    const response = await fetch(url);
    context.response.body = await response.json();
    context.response.status = response.status;
});

/////////////////////////////
// Beacon chain rest API   //
/////////////////////////////

router.get("/rest/:path(.*)", processRestApi)
    .post("/rest/:path(.*)", processRestApi);

async function processRestApi(ctx: any) {
    const path = ctx.params.path;
    const url = `${server_config.rest_url}/${path}`;
    const headers = new Headers({ 'Content-Type': 'application/json' });
    await proxyRequest(url, headers, ctx);
}

/////////////////////////////
// Key manager API         //
/////////////////////////////

const processKeyManagerRequest = async (ctx: any) => {
    const path = ctx.params.path;
    const url = `${server_config.keymanager_url}/${path}`;
    const keyManagerToken = await getKeyManagerToken();
    const headers = new Headers({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${keyManagerToken}`
    });

    await proxyRequest(url, headers, ctx);
}

router
    .get('/keymanager/:path(.*)', processKeyManagerRequest)
    .post('/keymanager/:path(.*)', processKeyManagerRequest)
    .delete('/keymanager/:path(.*)', processKeyManagerRequest);

async function proxyRequest(url: string, headers: Headers, ctx: any) {
    try {
        const body = ctx.request.hasBody ? JSON.stringify(JSON.parse(await ctx.request.body.text())) : null
        // console.dir(body);

        const response = await fetch(url, {
            method: ctx.request.method,
            headers,
            body
        });

        ctx.response.status = response.status;
        // console.log('response', response);

        if (response.headers.get("content-length") != "0") {
            ctx.response.body = await response.json();
        }
    } catch (error) {
        console.error('Error', error.message);
        ctx.response.status = 500;
        ctx.response.body = { error: error.message };
    }
}

const getKeyManagerToken = () => {
    return Deno.readTextFile(server_config.keymanager_token_path)
}

const app = new Application();
app.use(oakCors()); // Enable CORS for All Routes
app.use(
    oakCors({
        origin: [
            /^http:\/\/localhost(:[\d]+)?$/,
            /^http:\/\/.*\.my\.ava\.do$/,
            "http://*.dappnode.eth"
        ],
        optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
    }),
);

app.use(router.routes());
app.use(router.allowedMethods());

console.log("Server running on http://localhost:9999");
await app.listen({ port: 9999 });