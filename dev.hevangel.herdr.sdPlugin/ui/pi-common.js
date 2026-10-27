// Minimal Stream Deck Property Inspector bridge - no external deps.
// Exposes window.$PI with settings/global-settings helpers and event routing.
(function () {
    "use strict";

    const listeners = { settings: [], globalSettings: [] };

    let actionInfo = null;
    let settings = {};
    let globalSettings = {};

    window.connectElgatoStreamDeckSocket = function (inPort, inPluginUUID, inRegisterEvent, inInfo, inActionInfo) {
        actionInfo = JSON.parse(inActionInfo);
        settings = (actionInfo.payload && actionInfo.payload.settings) || {};

        const socket = new WebSocket("ws://127.0.0.1:" + inPort);
        socket.onopen = function () {
            socket.send(JSON.stringify({ event: inRegisterEvent, uuid: inPluginUUID }));
            send({ event: "getGlobalSettings", context: inPluginUUID });
            send({ event: "getSettings", context: inPluginUUID });
            document.body.classList.add("pi-ready");
            emit("ready", { actionInfo: actionInfo });
        };
        socket.onmessage = function (evt) {
            let msg;
            try {
                msg = JSON.parse(evt.data);
            } catch (e) {
                return;
            }
            if (msg.event === "didReceiveSettings" && msg.context === inPluginUUID) {
                settings = msg.payload && msg.payload.settings ? msg.payload.settings : {};
                listeners.settings.forEach(function (fn) {
                    fn(settings);
                });
            } else if (msg.event === "didReceiveGlobalSettings" && msg.context === inPluginUUID) {
                globalSettings = (msg.payload && msg.payload.settings) || {};
                listeners.globalSettings.forEach(function (fn) {
                    fn(globalSettings);
                });
            }
            emit(msg.event, msg);
        };
        socket.onerror = function () {
            emit("error", {});
        };
        window.$PI.socket = socket;
    };

    function send(payload) {
        if (window.$PI.socket && window.$PI.socket.readyState === 1) {
            window.$PI.socket.send(JSON.stringify(payload));
        }
    }

    function emit(name, data) {
        (listeners[name] || []).forEach(function (fn) {
            fn(data);
        });
    }

    window.$PI = {
        socket: null,
        actionInfo: function () {
            return actionInfo;
        },
        settings: function () {
            return settings;
        },
        globalSettings: function () {
            return globalSettings;
        },
        on: function (name, fn) {
            (listeners[name] = listeners[name] || []).push(fn);
        },
        /** Read-modify-write of the action settings. */
        patchSettings: function (patch) {
            settings = Object.assign({}, settings, patch);
            send({ event: "setSettings", context: actionInfo.context, payload: settings });
        },
        setGlobalSettings: function (payload) {
            globalSettings = payload;
            send({ event: "setGlobalSettings", context: actionInfo.context, payload: payload });
        },
    };
})();
