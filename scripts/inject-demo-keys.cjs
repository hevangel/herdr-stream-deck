// One-shot: inject three herdr actions into the current Stream Deck page.
// Backs up the profile manifest next to itself before touching anything.
const fs = require("fs");
const path = require("path");

const base = process.env.APPDATA + "/Elgato/StreamDeck/ProfilesV3/02FD4704-522B-45F1-9BF7-24892C74C299.sdProfile";
const page = JSON.parse(fs.readFileSync(base + "/manifest.json", "utf8")).Pages.Current;
const file = `${base}/Profiles/${page}/manifest.json`;

fs.copyFileSync(file, path.join(__dirname, "page-manifest.backup.json"));
console.log("backup written");

const pm = JSON.parse(fs.readFileSync(file, "utf8"));
const keypad = pm.Controllers[0];
keypad.Actions = keypad.Actions || {};

const now = Date.now();
const entries = {
    "3,0": {
        ActionID: "a1e2b100-0000-4000-8000-herdfleet0001",
        LinkedTitle: true,
        Name: "Fleet Status",
        Plugin: { Name: "herdr", UUID: "dev.hevangel.herdr", Version: "1.0" },
        Resources: null,
        Settings: {},
        State: 0,
        States: [
            {
                FontFamily: "",
                FontSize: 12,
                FontStyle: "",
                FontUnderline: false,
                Image: "",
                OutlineThickness: 2,
                ShowTitle: true,
                Title: "herdr",
                TitleAlignment: "middle",
                TitleColor: "#ffffff",
            },
        ],
        UUID: "dev.hevangel.herdr.fleet-status",
    },
    "3,1": {
        ActionID: "a1e2b100-0000-4000-8000-herdagent0002",
        LinkedTitle: true,
        Name: "Agent Command",
        Plugin: { Name: "herdr", UUID: "dev.hevangel.herdr", Version: "1.0" },
        Resources: null,
        Settings: { promptText: "Reply with your current status.", mode: "prompt" },
        State: 0,
        States: [
            {
                FontFamily: "",
                FontSize: 12,
                FontStyle: "",
                FontUnderline: false,
                Image: "",
                OutlineThickness: 2,
                ShowTitle: true,
                Title: "agent",
                TitleAlignment: "bottom",
                TitleColor: "#ffffff",
            },
        ],
        UUID: "dev.hevangel.herdr.agent-command",
    },
    "3,2": {
        ActionID: "a1e2b100-0000-4000-8000-herdspawn0003",
        LinkedTitle: true,
        Name: "Spawn Agent",
        Plugin: { Name: "herdr", UUID: "dev.hevangel.herdr", Version: "1.0" },
        Resources: null,
        Settings: { kind: "claude", direction: "down" },
        State: 0,
        States: [
            {
                FontFamily: "",
                FontSize: 12,
                FontStyle: "",
                FontUnderline: false,
                Image: "",
                OutlineThickness: 2,
                ShowTitle: true,
                Title: "spawn",
                TitleAlignment: "middle",
                TitleColor: "#ffffff",
            },
        ],
        UUID: "dev.hevangel.herdr.spawn-agent",
    },
};

Object.assign(keypad.Actions, entries);
fs.writeFileSync(file, JSON.stringify(pm, null, "\t"));
console.log("injected:", Object.keys(entries).join(", "), "at page", page);
