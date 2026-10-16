import { z } from "zod";
import { browserManager } from "../browser.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

export const textTools: Tool[] = [
  {
    name: "text_create",
    description: "Create a text element on the timeline",
    inputSchema: {
      type: "object",
      properties: {
        trackId: { type: "string", description: "Track ID to add text to (omit to auto-create text track)" },
        content: { type: "string", description: "Text content" },
        startTime: { type: "number", description: "Start time in seconds" },
        duration: { type: "number", description: "Duration in seconds (default: 3)" },
        fontSize: { type: "number", description: "Font size in pixels" },
        fontFamily: { type: "string", description: "Font family name" },
        color: { type: "string", description: "Text color (hex)" },
        textAlign: { type: "string", enum: ["left", "center", "right"] },
        fontWeight: { type: "string", enum: ["normal", "bold"] },
        fontStyle: { type: "string", enum: ["normal", "italic"] },
        x: { type: "number", description: "X position" },
        y: { type: "number", description: "Y position" },
      },
      required: ["content"],
    },
  },
  {
    name: "text_update_content",
    description: "Update the text content of a text element",
    inputSchema: {
      type: "object",
      properties: {
        trackId: { type: "string" },
        elementId: { type: "string" },
        content: { type: "string" },
      },
      required: ["trackId", "elementId", "content"],
    },
  },
  {
    name: "text_update_font",
    description: "Update font properties of a text element",
    inputSchema: {
      type: "object",
      properties: {
        trackId: { type: "string" },
        elementId: { type: "string" },
        fontFamily: { type: "string" },
        fontSize: { type: "number" },
        fontWeight: { type: "string", enum: ["normal", "bold"] },
        fontStyle: { type: "string", enum: ["normal", "italic"] },
        textDecoration: { type: "string", enum: ["none", "underline", "line-through"] },
      },
      required: ["trackId", "elementId"],
    },
  },
  {
    name: "text_update_style",
    description: "Update style properties of a text element (color, alignment, spacing)",
    inputSchema: {
      type: "object",
      properties: {
        trackId: { type: "string" },
        elementId: { type: "string" },
        color: { type: "string", description: "Text color (hex)" },
        textAlign: { type: "string", enum: ["left", "center", "right"] },
        letterSpacing: { type: "number" },
        lineHeight: { type: "number" },
        opacity: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["trackId", "elementId"],
    },
  },
  {
    name: "text_update_background",
    description: "Update the background of a text element",
    inputSchema: {
      type: "object",
      properties: {
        trackId: { type: "string" },
        elementId: { type: "string" },
        enabled: { type: "boolean" },
        color: { type: "string", description: "Background color (hex)" },
        cornerRadius: { type: "number" },
        paddingX: { type: "number" },
        paddingY: { type: "number" },
        offsetX: { type: "number" },
        offsetY: { type: "number" },
      },
      required: ["trackId", "elementId"],
    },
  },
  {
    name: "text_update_transform",
    description: "Update the position and scale of a text element",
    inputSchema: {
      type: "object",
      properties: {
        trackId: { type: "string" },
        elementId: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        scaleX: { type: "number" },
        scaleY: { type: "number" },
        rotation: { type: "number" },
      },
      required: ["trackId", "elementId"],
    },
  },
  {
    name: "text_update_blend_mode",
    description: "Update the blend mode of a text element",
    inputSchema: {
      type: "object",
      properties: {
        trackId: { type: "string" },
        elementId: { type: "string" },
        blendMode: { type: "string", description: "CSS blend mode (normal, multiply, screen, overlay, etc.)" },
      },
      required: ["trackId", "elementId", "blendMode"],
    },
  },
  {
    name: "text_list",
    description: "List all text elements across all tracks",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "text_delete",
    description: "Delete a text element",
    inputSchema: {
      type: "object",
      properties: {
        trackId: { type: "string" },
        elementId: { type: "string" },
      },
      required: ["trackId", "elementId"],
    },
  },
];

export const textHandlers: [string, Handler][] = [
  ["text_create", async (args) => {
    const schema = z.object({
      trackId: z.string().optional(),
      content: z.string(),
      startTime: z.number().optional(),
      duration: z.number().optional(),
      fontSize: z.number().optional(),
      fontFamily: z.string().optional(),
      color: z.string().optional(),
      textAlign: z.enum(["left", "center", "right"]).optional(),
      fontWeight: z.enum(["normal", "bold"]).optional(),
      fontStyle: z.enum(["normal", "italic"]).optional(),
      x: z.number().optional(),
      y: z.number().optional(),
    });
    const p = schema.parse(args);
    const result = await browserManager.evaluateWithArg((p: any) => {
      const editor = (window as any).__opencut;
      const scene = editor.scenes.getActiveScene();
      const targetTrackId = p.trackId ?? crypto.randomUUID();
      const ticksPerSecond = 120_000;
      const startTime =
        p.startTime === undefined
          ? editor.playback.getCurrentTime()
          : Math.round(p.startTime * ticksPerSecond);
      const element = {
        id: crypto.randomUUID(),
        type: "text",
        name: p.content.substring(0, 20),
        duration: Math.round((p.duration ?? 3) * ticksPerSecond),
        startTime,
        trimStart: 0,
        trimEnd: 0,
        params: {
          content: p.content,
          fontSize: p.fontSize ?? 48,
          fontFamily: p.fontFamily ?? "Inter",
          color: p.color ?? "#ffffff",
          textAlign: p.textAlign ?? "center",
          fontWeight: p.fontWeight ?? "normal",
          fontStyle: p.fontStyle ?? "normal",
          textDecoration: "none",
          letterSpacing: 0,
          lineHeight: 1.2,
          "background.enabled": false,
          "background.color": "#000000",
          "background.cornerRadius": 0,
          "background.paddingX": 30,
          "background.paddingY": 42,
          "background.offsetX": 0,
          "background.offsetY": 0,
          "transform.positionX": p.x ?? 0,
          "transform.positionY": p.y ?? 0,
          "transform.scaleX": 1,
          "transform.scaleY": 1,
          "transform.rotate": 0,
          opacity: 1,
          blendMode: "normal",
        },
      };

      const existingTrack = scene.tracks.overlay.find(
        (track: any) => track.id === targetTrackId && track.type === "text",
      );
      if (p.trackId && !existingTrack) {
        throw new Error(`Text track not found: ${p.trackId}`);
      }
      const overlay = existingTrack
        ? scene.tracks.overlay.map((track: any) =>
            track.id === targetTrackId
              ? { ...track, elements: [...track.elements, element] }
              : track,
          )
        : [
            ...scene.tracks.overlay,
            {
              id: targetTrackId,
              name: "Text",
              type: "text",
              elements: [element],
              hidden: false,
            },
          ];
      editor.scenes.updateSceneTracks({
        tracks: { ...scene.tracks, overlay },
      });
      return { elementId: element.id, trackId: targetTrackId };
    }, p);
    return { success: true, ...result };
  }],

  ["text_update_content", async (args) => {
    const { trackId, elementId, content } = z.object({ trackId: z.string(), elementId: z.string(), content: z.string() }).parse(args);
    await browserManager.evaluateWithArg(({ trackId, elementId, content }: any) => {
      const editor = (window as any).__opencut;
      const element = editor.timeline.getTrackById({ trackId })?.elements.find((item: any) => item.id === elementId);
      if (!element) throw new Error(`Timeline element ${elementId} not found`);
      editor.timeline.updateElements({
        updates: [{ trackId, elementId, patch: { params: { ...element.params, content } } }],
      });
    }, { trackId, elementId, content });
    return { success: true };
  }],

  ["text_update_font", async (args) => {
    const schema = z.object({
      trackId: z.string(), elementId: z.string(),
      fontFamily: z.string().optional(), fontSize: z.number().optional(),
      fontWeight: z.enum(["normal", "bold"]).optional(),
      fontStyle: z.enum(["normal", "italic"]).optional(),
      textDecoration: z.enum(["none", "underline", "line-through"]).optional(),
    });
    const { trackId, elementId, ...updates } = schema.parse(args);
    const filtered = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    await browserManager.evaluateWithArg(({ trackId, elementId, updates }: any) => {
      const editor = (window as any).__opencut;
      const element = editor.timeline.getTrackById({ trackId })?.elements.find((item: any) => item.id === elementId);
      if (!element) throw new Error(`Timeline element ${elementId} not found`);
      editor.timeline.updateElements({
        updates: [{ trackId, elementId, patch: { params: { ...element.params, ...updates } } }],
      });
    }, { trackId, elementId, updates: filtered });
    return { success: true };
  }],

  ["text_update_style", async (args) => {
    const schema = z.object({
      trackId: z.string(), elementId: z.string(),
      color: z.string().optional(), textAlign: z.enum(["left", "center", "right"]).optional(),
      letterSpacing: z.number().optional(), lineHeight: z.number().optional(),
      opacity: z.number().min(0).max(1).optional(),
    });
    const { trackId, elementId, ...updates } = schema.parse(args);
    const filtered = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    await browserManager.evaluateWithArg(({ trackId, elementId, updates }: any) => {
      const editor = (window as any).__opencut;
      const element = editor.timeline.getTrackById({ trackId })?.elements.find((item: any) => item.id === elementId);
      if (!element) throw new Error(`Timeline element ${elementId} not found`);
      editor.timeline.updateElements({
        updates: [{ trackId, elementId, patch: { params: { ...element.params, ...updates } } }],
      });
    }, { trackId, elementId, updates: filtered });
    return { success: true };
  }],

  ["text_update_background", async (args) => {
    const schema = z.object({
      trackId: z.string(), elementId: z.string(),
      enabled: z.boolean().optional(), color: z.string().optional(),
      cornerRadius: z.number().optional(), paddingX: z.number().optional(),
      paddingY: z.number().optional(), offsetX: z.number().optional(), offsetY: z.number().optional(),
    });
    const { trackId, elementId, ...bgUpdates } = schema.parse(args);
    const filtered = Object.fromEntries(Object.entries(bgUpdates).filter(([, v]) => v !== undefined));
    await browserManager.evaluateWithArg(({ trackId, elementId, bg }: any) => {
      const editor = (window as any).__opencut;
      const element = editor.timeline.getTrackById({ trackId })?.elements.find((item: any) => item.id === elementId);
      if (!element) throw new Error(`Timeline element ${elementId} not found`);
      const params = { ...element.params };
      const keys: Record<string, string> = {
        enabled: "background.enabled",
        color: "background.color",
        cornerRadius: "background.cornerRadius",
        paddingX: "background.paddingX",
        paddingY: "background.paddingY",
        offsetX: "background.offsetX",
        offsetY: "background.offsetY",
      };
      for (const [key, value] of Object.entries(bg)) {
        const paramKey = keys[key];
        if (paramKey) params[paramKey] = value;
      }
      editor.timeline.updateElements({
        updates: [{ trackId, elementId, patch: { params } }],
      });
    }, { trackId, elementId, bg: filtered });
    return { success: true };
  }],

  ["text_update_transform", async (args) => {
    const schema = z.object({
      trackId: z.string(), elementId: z.string(),
      x: z.number().optional(), y: z.number().optional(),
      scaleX: z.number().optional(), scaleY: z.number().optional(),
      rotation: z.number().optional(),
    });
    const { trackId, elementId, ...t } = schema.parse(args);
    const filtered = Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined));
    await browserManager.evaluateWithArg(({ trackId, elementId, tf }: any) => {
      const editor = (window as any).__opencut;
      const element = editor.timeline.getTrackById({ trackId })?.elements.find((item: any) => item.id === elementId);
      if (!element) throw new Error(`Timeline element ${elementId} not found`);
      const params = { ...element.params };
      const keys: Record<string, string> = {
        x: "transform.positionX",
        y: "transform.positionY",
        scaleX: "transform.scaleX",
        scaleY: "transform.scaleY",
        rotation: "transform.rotate",
      };
      for (const [key, value] of Object.entries(tf)) {
        const paramKey = keys[key];
        if (paramKey) params[paramKey] = value;
      }
      editor.timeline.updateElements({
        updates: [{ trackId, elementId, patch: { params } }],
      });
    }, { trackId, elementId, tf: filtered });
    return { success: true };
  }],

  ["text_update_blend_mode", async (args) => {
    const { trackId, elementId, blendMode } = z.object({ trackId: z.string(), elementId: z.string(), blendMode: z.string() }).parse(args);
    await browserManager.evaluateWithArg(({ trackId, elementId, blendMode }: any) => {
      const editor = (window as any).__opencut;
      const element = editor.timeline.getTrackById({ trackId })?.elements.find((item: any) => item.id === elementId);
      if (!element) throw new Error(`Timeline element ${elementId} not found`);
      editor.timeline.updateElements({
        updates: [{ trackId, elementId, patch: { params: { ...element.params, blendMode } } }],
      });
    }, { trackId, elementId, blendMode });
    return { success: true };
  }],

  ["text_list", async () => {
    const elements = await browserManager.evaluate(() => {
      const tracks = (window as any).__opencut.timeline.getTracks();
      const textEls: any[] = [];
      for (const t of tracks) {
        if (t.type === "text") {
          for (const el of t.elements) {
            textEls.push({ trackId: t.id, elementId: el.id, content: el.params?.content, startTime: el.startTime, duration: el.duration });
          }
        }
      }
      return textEls;
    });
    return { elements };
  }],

  ["text_delete", async (args) => {
    const { trackId, elementId } = z.object({ trackId: z.string(), elementId: z.string() }).parse(args);
    await browserManager.evaluateWithArg(({ trackId, elementId }: any) => {
      (window as any).__opencut.timeline.deleteElements({ elements: [{ trackId, elementId }] });
    }, { trackId, elementId });
    return { success: true };
  }],
];
