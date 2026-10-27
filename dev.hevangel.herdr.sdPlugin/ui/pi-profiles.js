// Shared Property Inspector controls: profile picker + global profiles editor.
// Requires pi-common.js to be loaded first.
(function () {
    "use strict";

    var KINDS = ["local", "wsl", "machine", "docker", "ssh", "ssh-docker", "custom"];

    function el(id) {
        return document.getElementById(id);
    }

    function kindLabel(p) {
        var bits = [p.kind];
        if (p.kind === "wsl" && p.distro) bits.push(p.distro);
        if (p.kind === "machine" && p.machine) bits.push(p.machine);
        if ((p.kind === "docker" || p.kind === "ssh-docker") && p.container) bits.push(p.container);
        if ((p.kind === "ssh" || p.kind === "ssh-docker") && p.sshHost) bits.push(p.sshHost);
        if (p.kind === "custom" && p.prefix) bits.push(p.prefix);
        return bits.join(" · ");
    }

    /** Mirror the plugin's normalizeGlobalSettings fallback so an empty store reads as Local. */
    function normalized(global) {
        var profiles = global && Array.isArray(global.profiles) && global.profiles.length > 0 ? global.profiles : [{ id: "local", name: "Local", kind: "local" }];
        return {
            profiles: profiles,
            defaultProfileId: (global && global.defaultProfileId) || profiles[0].id,
        };
    }

    function fillProfileSelect(select, global, settings) {
        var profiles = (global && global.profiles) || [];
        var current = (settings && settings.profileId) || "";
        select.innerHTML = "";
        var defaultId = global && global.defaultProfileId;
        var defaultProfile = profiles.filter(function (p) { return p.id === defaultId; })[0];
        var defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "Default: " + (defaultProfile ? defaultProfile.name : "none set");
        select.appendChild(defaultOption);
        profiles.forEach(function (p) {
            var opt = document.createElement("option");
            opt.value = p.id;
            opt.textContent = p.name + "  (" + kindLabel(p) + ")";
            if (p.id === current) opt.selected = true;
            select.appendChild(opt);
        });
    }

    window.HerdrPI = {
        /**
         * Wires the profile <select id="profile">, the profiles JSON editor and
         * (optionally) extra fields. fieldBind maps settings key -> element id.
         */
        init: function (fieldBind) {
            var select = el("profile");

            function bindField(key, id, transform) {
                var node = el(id);
                if (!node) return;
                var apply = function (value) {
                    var patch = {};
                    patch[key] = transform ? transform(value) : value;
                    window.$PI.patchSettings(patch);
                };
                var event = node.type === "checkbox" ? "change" : node.tagName === "SELECT" || node.tagName === "TEXTAREA" ? "change" : "input";
                node.addEventListener(event, function () {
                    apply(node.type === "checkbox" ? node.checked : node.value);
                });
            }

            Object.keys(fieldBind || {}).forEach(function (key) {
                var spec = fieldBind[key];
                if (typeof spec === "string") bindField(key, spec);
                else bindField(key, spec.id, spec.transform);
            });

            function renderEditor() {
                var global = normalized(window.$PI.globalSettings());
                var settings = window.$PI.settings();
                if (select) fillProfileSelect(select, global, settings);
                var area = el("profilesJson");
                if (area && document.activeElement !== area) {
                    area.value = JSON.stringify(
                        { profiles: (global && global.profiles) || [], defaultProfileId: global && global.defaultProfileId },
                        null,
                        2,
                    );
                }
                var hint = el("profileHint");
                if (hint) hint.textContent = "";
            }

            select &&
                select.addEventListener("change", function () {
                    window.$PI.patchSettings({ profileId: select.value || undefined });
                });

            var applyBtn = el("applyProfiles");
            applyBtn &&
                applyBtn.addEventListener("click", function () {
                    var hint = el("profileHint");
                    try {
                        var parsed = JSON.parse(el("profilesJson").value);
                        if (!Array.isArray(parsed.profiles)) throw new Error('"profiles" must be an array');
                        parsed.profiles.forEach(function (p) {
                            if (!p.id || !p.name || KINDS.indexOf(p.kind) === -1) {
                                throw new Error('each profile needs id, name and kind (one of ' + KINDS.join(", ") + ')');
                            }
                        });
                        if (!parsed.defaultProfileId) parsed.defaultProfileId = parsed.profiles[0].id;
                        window.$PI.setGlobalSettings(parsed);
                        if (hint) {
                            hint.textContent = "Saved " + parsed.profiles.length + " profile(s).";
                            hint.style.color = "#7ee2a8";
                        }
                        renderEditor();
                    } catch (e) {
                        if (hint) {
                            hint.textContent = "Invalid JSON: " + e.message;
                            hint.style.color = "#e5484d";
                        }
                    }
                });

            window.$PI.on("globalSettings", renderEditor);
            window.$PI.on("settings", renderEditor);
            window.$PI.on("ready", renderEditor);
        },
    };
})();
