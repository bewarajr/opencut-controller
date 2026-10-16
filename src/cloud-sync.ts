import { createReadStream, statSync } from "node:fs";
import { extname } from "node:path";
import { browserManager } from "./browser.js";

const apiBase = () => {
	const configured = process.env.OPENCUT_API_URL;
	if (configured) return configured.replace(/\/$/, "");
	const appUrl = process.env.OPENCUT_URL ?? "https://opencut.bewara.xyz";
	return `${appUrl.replace(/\/$/, "")}/api/cloud`;
};

function token(): string | null {
	return process.env.OPENCUT_API_TOKEN?.trim() || null;
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
	const apiToken = token();
	if (!apiToken) throw new Error("OPENCUT_API_TOKEN is not configured; create one at /account to sync MCP projects to your cloud account");
	return { Authorization: `Bearer ${apiToken}`, ...extra };
}

export async function syncCurrentProjectToCloud(): Promise<{ synced: boolean; reason?: string; id?: string }> {
	if (!token()) {
		return { synced: false, reason: "OPENCUT_API_TOKEN is not configured" };
	}
	const projectId = await browserManager.evaluate(async () => {
		const editor = (window as any).__opencut;
		await editor.save.flush();
		return editor.project.getActiveOrNull()?.metadata.id ?? null;
	});
	if (!projectId) throw new Error("There is no active OpenCut project to sync");
	const serializedProject = await browserManager.evaluateWithArg(async (id: string) => {
		return await (window as any).__opencutStorageBridge?.getSerializedProject(id) ?? null;
	}, projectId);
	if (!serializedProject) throw new Error(`Could not read serialized project ${projectId}`);
	const response = await fetch(`${apiBase()}/projects/${encodeURIComponent(projectId)}`, {
		method: "PUT",
		headers: authHeaders({ "Content-Type": "application/json" }),
		body: JSON.stringify(serializedProject),
	});
	if (!response.ok) {
		const body = await response.json().catch(() => null) as { error?: string } | null;
		throw new Error(body?.error ?? `Cloud project sync failed (${response.status})`);
	}
	return { synced: true, id: projectId };
}

export async function listCloudProjects(): Promise<unknown[] | null> {
	if (!token()) return null;
	const response = await fetch(`${apiBase()}/projects`, { headers: authHeaders() });
	if (!response.ok) {
		const body = await response.json().catch(() => null) as { error?: string } | null;
		throw new Error(body?.error ?? `Cloud project list failed (${response.status})`);
	}
	const payload = await response.json() as { projects?: unknown[] };
	return payload.projects ?? [];
}

const mimeTypes: Record<string, string> = {
	".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mkv": "video/x-matroska",
	".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg",
	".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
};

export async function uploadMediaToCloud({
	projectId,
	media,
	filePath,
}: {
	projectId: string;
	media: { id: string; name: string; type: string; width?: number; height?: number; duration?: number };
	filePath: string;
}): Promise<{ synced: boolean; reason?: string }> {
	if (!token()) return { synced: false, reason: "OPENCUT_API_TOKEN is not configured" };
	const fileStat = statSync(filePath);
	const mimeType = mimeTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream";
	const metadata = {
		id: media.id,
		name: media.name,
		type: media.type,
		size: fileStat.size,
		lastModified: Math.round(fileStat.mtimeMs),
		width: media.width,
		height: media.height,
		duration: media.duration,
		mimeType,
	};
	const encodedMetadata = Buffer.from(JSON.stringify(metadata)).toString("base64url");
	const response = await fetch(`${apiBase()}/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(media.id)}`, {
		method: "PUT",
		headers: authHeaders({
			"Content-Type": mimeType,
			"Content-Length": String(fileStat.size),
			"x-opencut-media-meta": encodedMetadata,
		}),
		body: createReadStream(filePath),
		duplex: "half",
	} as unknown as RequestInit & { duplex: "half" });
	if (!response.ok) {
		const body = await response.json().catch(() => null) as { error?: string } | null;
		throw new Error(body?.error ?? `Cloud media upload failed (${response.status})`);
	}
	return { synced: true };
}
