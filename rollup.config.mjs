import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

const nodeBuiltins = ["child_process", "zlib", "path", "fs", "os", "util", "events", "stream"];

/** @type {import('rollup').RollupOptions} */
export default {
    input: "src/plugin.ts",
    output: {
        file: "dev.hevangel.herdr.sdPlugin/bin/plugin.js",
        format: "cjs",
        sourcemap: true,
        exports: "auto",
    },
    external: (id) =>
        id.startsWith("node:") ||
        nodeBuiltins.includes(id) ||
        id.includes("bufferutil") ||
        id.includes("utf-8-validate"),
    plugins: [typescript(), nodeResolve({ preferBuiltins: true }), commonjs()],
};
