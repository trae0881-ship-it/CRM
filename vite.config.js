var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
var projectRoot = fileURLToPath(new URL(".", import.meta.url));
var guideFiles = [
    "index.html",
    "DOMAIN_SETUP.html",
    "CUSTOM_DOMAIN_CONNECTION.html",
    "AUTOMATIC_LINK_GENERATION.html",
    "DNS_CONFIGURATION.html",
    "DOMAIN_TROUBLESHOOTING.html",
    "SEO_LINK_CONFIGURATION.html",
];
var guideAssets = ["docs.css", "docs.js"];
var allowedGuidePaths = new Set(__spreadArray(__spreadArray([], guideFiles, true), guideAssets.map(function (file) { return "assets/".concat(file); }), true));
function domainGuidesPlugin() {
    return {
        name: "adometa-domain-guides",
        configureServer: function (server) {
            server.middlewares.use(function (request, response, next) {
                var _a;
                var pathname;
                try {
                    pathname = new URL((_a = request.url) !== null && _a !== void 0 ? _a : "/", "http://localhost").pathname;
                }
                catch (_b) {
                    return next();
                }
                if (!pathname.startsWith("/domain-guides/"))
                    return next();
                var relativePath = pathname.slice("/domain-guides/".length) || "index.html";
                if (!allowedGuidePaths.has(relativePath))
                    return next();
                var source = relativePath.startsWith("assets/")
                    ? resolve(projectRoot, "docs", "assets", relativePath.slice("assets/".length))
                    : resolve(projectRoot, "docs", relativePath);
                void readFile(source).then(function (content) {
                    response.setHeader("Content-Type", relativePath.endsWith(".css")
                        ? "text/css; charset=utf-8"
                        : relativePath.endsWith(".js")
                            ? "text/javascript; charset=utf-8"
                            : "text/html; charset=utf-8");
                    response.setHeader("Cache-Control", "no-store");
                    response.end(content);
                }).catch(next);
            });
        },
        writeBundle: function (options) {
            return __awaiter(this, void 0, void 0, function () {
                var outputDirectory, guideOutput, assetsOutput;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!options.dir)
                                return [2 /*return*/];
                            outputDirectory = resolve(projectRoot, options.dir);
                            guideOutput = resolve(outputDirectory, "domain-guides");
                            assetsOutput = resolve(guideOutput, "assets");
                            return [4 /*yield*/, mkdir(assetsOutput, { recursive: true })];
                        case 1:
                            _a.sent();
                            return [4 /*yield*/, Promise.all(__spreadArray(__spreadArray([], guideFiles.map(function (file) { return copyFile(resolve(projectRoot, "docs", file), resolve(guideOutput, file)); }), true), guideAssets.map(function (file) { return copyFile(resolve(projectRoot, "docs", "assets", file), resolve(assetsOutput, file)); }), true))];
                        case 2:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            });
        },
    };
}
export default defineConfig({
    plugins: [react(), domainGuidesPlugin()],
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    react: ["react", "react-dom"],
                    supabase: ["@supabase/supabase-js"],
                    icons: ["lucide-react"],
                },
            },
        },
    },
});
