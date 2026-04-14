import chokidar from "chokidar";
import "dotenv/config";
import { createReadStream, existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDocsSite } from "./docs";

interface WsClient {
	send (data: string): void;
}

interface WsServer {
	clients: Set<WsClient>;
}

interface WsModule {
	WebSocketServer: new (options: { server: Server }) => WsServer;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { WebSocketServer } = createRequire(import.meta.url)("ws") as WsModule;

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const srcDirectory = path.join(projectRoot, "src");
const docsScriptsDirectory = path.join(scriptDirectory, "docs");
const docsOutputDirectory = path.join(projectRoot, "docs");
const port = Number(process.env["DOCS_PORT"]) || 3000;

const mimeTypes: Record<string, string> = {
	".html": "text/html",
	".css": "text/css",
	".js": "application/javascript",
	".json": "application/json",
	".png": "image/png",
	".svg": "image/svg+xml",
};

// Static file server
const server = createServer((req, res) => {
	const url = new URL(req.url ?? "/", `http://localhost:${port}`);
	const normalized = path.normalize(url.pathname);
	let filePath = path.join(docsOutputDirectory, normalized);

	// Prevent path traversal
	if (!filePath.startsWith(docsOutputDirectory)) {
		res.writeHead(403);
		res.end("Forbidden");
		return;
	}

	if (url.pathname.endsWith("/")) {
		filePath = path.join(filePath, "index.html");
	}

	if (!existsSync(filePath)) {
		res.writeHead(404);
		res.end("Not found");
		return;
	}

	const ext = path.extname(filePath);
	const contentType = mimeTypes[ext] ?? "application/octet-stream";
	res.writeHead(200, { "Content-Type": contentType });
	createReadStream(filePath).pipe(res);
});

// WebSocket server for auto-reload
const wss = new WebSocketServer({ server });

let building = false;
let pendingSkipTypedoc: boolean | null = null;

async function rebuild (skipTypedoc: boolean): Promise<void> {
	if (building) {
		if (pendingSkipTypedoc === null || !skipTypedoc) {
			pendingSkipTypedoc = skipTypedoc;
		}
		return;
	}

	building = true;
	const label = skipTypedoc ? "docs (pages only)" : "docs (full)";

	try {
		console.log(`\nRebuilding ${label}...`);
		await buildDocsSite({ skipTypedoc, reloadPort: port });
		console.log(`Done.`);

		for (const client of wss.clients) {
			client.send("reload");
		}
	} catch (error) {
		console.error(`Build failed:`, error);
	} finally {
		building = false;

		if (pendingSkipTypedoc !== null) {
			const next = pendingSkipTypedoc;
			pendingSkipTypedoc = null;
			void rebuild(next);
		}
	}
}

// Initial full build + start server
void (async () => {
	await buildDocsSite({ reloadPort: port });

	server.listen(port, () => {
		console.log(`\nServing docs at http://localhost:${port}`);
		console.log("Watching for changes...");
	});

	chokidar.watch(srcDirectory, { ignoreInitial: true })
		.on("all", () => void rebuild(false));

	chokidar.watch(docsScriptsDirectory, { ignoreInitial: true })
		.on("all", () => void rebuild(true));
})();
