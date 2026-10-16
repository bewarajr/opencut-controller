import { chromium, type Browser, type BrowserContext, type Page, type BrowserServer } from "playwright";
import * as fs from "node:fs/promises";

export type SafeResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const EDITOR_BASE = process.env.OPENCUT_URL ?? "http://localhost:3001";
const READY_TIMEOUT_MS = 30_000;
const READY_POLL_MS = 200;
const EDITOR_BASE_URL = EDITOR_BASE.replace(/\/$/, "");

class BrowserManager {
  private server: BrowserServer | null = null;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private currentProjectId: string | null = null;
  private launchPromise: Promise<void> | null = null;
  private navLock: Promise<unknown> = Promise.resolve();
  private persistentContext = false;

  launch(): Promise<void> {
    if (!this.launchPromise) {
      this.launchPromise = this._launch();
    }
    return this.launchPromise;
  }

  private async _launch(): Promise<void> {
    const executablePath = process.env.CHROMIUM_PATH ?? undefined;
    const headless = process.env.MCP_HEADLESS !== "false";
    const launchOpts = {
      headless,
      ...(executablePath ? { executablePath } : {}),
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    };

    const profileDir = process.env.MCP_PROFILE_DIR?.trim();
    if (profileDir && process.platform !== "win32") {
      await fs.mkdir(profileDir, { recursive: true });
      this.context = await chromium.launchPersistentContext(profileDir, launchOpts);
      this.browser = this.context.browser();
      this.persistentContext = true;
    } else {
      if (process.platform === "win32") {
        this.server = await chromium.launchServer(launchOpts);
        this.browser = await chromium.connect(this.server.wsEndpoint());
      } else {
        this.browser = await chromium.launch(launchOpts);
      }
      this.context = await this.browser.newContext();
    }

    this.page = this.context.pages()[0] ?? await this.context.newPage();
    await this.page.goto(`${EDITOR_BASE_URL}/projects`);
  }

  private async ensureReady(): Promise<void> {
    if (!this.launchPromise) throw new Error("Browser not launched — call browserManager.launch() first");
    await this.launchPromise;
  }

  /** Serialize all navigations to avoid race conditions */
  private async withNavLock<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.navLock;
    this.navLock = (async () => {
      await prev;
      return fn();
    })();
    return this.navLock as Promise<T>;
  }

  async navigateToEditor(projectId: string): Promise<void> {
    return this.withNavLock(async () => {
      await this.ensureReady();
      if (this.currentProjectId === projectId) {
        const ready = await this.isEditorReady();
        if (ready) return;
      }
      await this.navigateAndWaitForEditor(`${EDITOR_BASE_URL}/editor/${projectId}`);
      this.currentProjectId = projectId;
    });
  }

  async navigateToHome(): Promise<void> {
    return this.withNavLock(async () => {
      await this.ensureReady();
      await this.page!.goto(`${EDITOR_BASE_URL}/projects`);
      this.currentProjectId = null;
    });
  }

  async navigateToNewProject(): Promise<string> {
    return this.withNavLock(async () => {
      await this.ensureReady();
      const placeholder = `new-${Date.now()}`;
      await this.navigateAndWaitForEditor(`${EDITOR_BASE_URL}/editor/${placeholder}`);
      const id: string = await this.page!.evaluate(() => {
        return (window as any).__opencut.project.getActive().metadata.id;
      });
      this.currentProjectId = id;
      return id;
    });
  }

  private async isEditorReady(): Promise<boolean> {
    if (!this.page) return false;
    try {
      return await this.page.evaluate(() => {
        const project = (window as any).__opencut?.project;
        return typeof project?.getActiveOrNull === "function" && !!project.getActiveOrNull();
      });
    } catch {
      // Navigation can temporarily detach the execution context. Keep polling.
      return false;
    }
  }

  private async navigateAndWaitForEditor(url: string): Promise<void> {
    let lastError = "unknown error";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        if (attempt === 0) {
          await this.page!.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
        } else {
          // A stale browser tab or cached app bundle can miss the bridge on first load.
          await this.page!.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
        }
        await this.waitForEditorReady();
        return;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    const diagnostics = await this.getPageDiagnostics();
    throw new Error(`Editor did not become ready after a page reload: ${lastError}. Page: ${JSON.stringify(diagnostics)}`);
  }

  private async waitForEditorReady(): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const ready = await this.isEditorReady();
      if (ready) return;
      await new Promise((r) => setTimeout(r, READY_POLL_MS));
    }
    const diagnostics = await this.getPageDiagnostics();
    throw new Error(`Editor not ready after ${READY_TIMEOUT_MS}ms. Page: ${JSON.stringify(diagnostics)}`);
  }

  private async getPageDiagnostics(): Promise<Record<string, unknown>> {
    if (!this.page) return { page: "unavailable" };
    try {
      return await this.page.evaluate(() => {
        const w = window as any;
        return {
          url: window.location.href,
          title: document.title,
          readyState: document.readyState,
          bridgeAvailable: !!w.__opencut,
          projectApiAvailable: typeof w.__opencut?.project?.getActiveOrNull === "function",
          activeProjectId: w.__opencut?.project?.getActiveOrNull?.()?.metadata?.id ?? null,
        };
      });
    } catch (error) {
      return {
        url: this.page.url(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Safe evaluate with error handling — never throws */
  async safeEvaluate<T>(fn: () => T): Promise<SafeResult<T>> {
    try {
      await this.ensureReady();
      const data = await this.page!.evaluate(fn);
      return { ok: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }

  /** Safe evaluate with argument — never throws */
  async safeEvaluateWithArg<T>(fn: (arg: any) => T, arg: any): Promise<SafeResult<T>> {
    try {
      await this.ensureReady();
      const data = await this.page!.evaluate(fn, arg);
      return { ok: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }

  /** Safe async evaluate with argument — never throws */
  async safeEvaluateAsyncWithArg<T>(fn: (arg: any) => Promise<T>, arg: any): Promise<SafeResult<T>> {
    try {
      await this.ensureReady();
      const data = await this.page!.evaluate(fn, arg);
      return { ok: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }

  /** Legacy evaluate (throws on error) — kept for backward compatibility */
  async evaluate<T>(fn: () => T): Promise<T> {
    const result = await this.safeEvaluate(fn);
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }

  /** Legacy evaluateWithArg (throws on error) */
  async evaluateWithArg(fn: (arg: any) => any, arg: any): Promise<any> {
    const result = await this.safeEvaluateWithArg(fn, arg);
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }

  /** Legacy evaluateAsyncWithArg (throws on error) */
  async evaluateAsyncWithArg(fn: (arg: any) => Promise<any>, arg: any): Promise<any> {
    const result = await this.safeEvaluateAsyncWithArg(fn, arg);
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }

  /** Direct HTTP API call (no browser context needed) */
  async fetchApi(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${EDITOR_BASE_URL}${path}`, init);
  }

  async getPage(): Promise<Page> {
    await this.ensureReady();
    return this.page!;
  }

  getBase(): string {
    return EDITOR_BASE;
  }

  async close(): Promise<void> {
    if (this.persistentContext) {
      await this.context?.close();
    } else {
      await this.browser?.close();
    }
    await this.server?.close();
    this.browser = null;
    this.server = null;
    this.context = null;
    this.page = null;
    this.currentProjectId = null;
    this.persistentContext = false;
  }
}

export const browserManager = new BrowserManager();
