import defaultsettings_gnosis from "./settings/defaultsettings-gnosis.json" with { type: "json" };
import defaultsettings_holesky from "./settings/defaultsettings-holesky.json" with { type: "json" };
import defaultsettings_mainnet from "./settings/defaultsettings-mainnet.json" with { type: "json" };
import defaultsettings_prater from "./settings/defaultsettings-prater.json" with { type: "json" };

import { server_config } from "./server_config.ts";

const settings_file_path = '/data/settings.json';

export const defaultsettings = () => {
    switch (server_config.network) {
        case "gnosis": return defaultsettings_gnosis;
        case "holesky": return defaultsettings_holesky;
        case "prater": return defaultsettings_prater;
        default: return defaultsettings_mainnet;
    }
};

export const read_settings = async () => {
    const text = await Deno.readTextFile(settings_file_path);
    return JSON.parse(text);
}

export const write_settings = async (settings: any) => {
    console.log(settings);
    console.dir(settings);
    const text = JSON.stringify(settings, null, 4);
    await Deno.writeTextFile(settings_file_path, text);
}