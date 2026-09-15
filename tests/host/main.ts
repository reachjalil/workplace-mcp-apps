import { AppBridge, getToolUiResourceUri, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema, EmptyResultSchema, type Tool } from "@modelcontextprotocol/sdk/types.js";

const widgetOrigin = import.meta.env.VITE_WIDGET_ORIGIN as string;
const hostInfo = { name: "workplace-sdk-fixture", version: "1.0.0" };
const client = new Client(hostInfo);
const element = <T extends HTMLElement>(id: string) => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing host control: ${id}`);
  return node as T;
};
const status = element("status");
const errorOutput = element("error");
const toolPicker = element<HTMLSelectElement>("tool");
const widthPicker = element<HTMLSelectElement>("width");
const themePicker = element<HTMLSelectElement>("theme");
const liveInput = element<HTMLInputElement>("live");
const toolsInput = element<HTMLInputElement>("server-tools");
const connectButton = element<HTMLButtonElement>("connect");
const launchButton = element<HTMLButtonElement>("launch");
const closeButton = element<HTMLButtonElement>("close");
const checkSourceButton = element<HTMLButtonElement>("check-source");
let tools: Tool[] = [];
let bridge: AppBridge | undefined;
let iframe: HTMLIFrameElement | undefined;
let removeMessageWitness: (() => void) | undefined;

function reportError(error: unknown) {
  errorOutput.hidden = false;
  errorOutput.textContent = error instanceof Error ? error.message : String(error);
  status.textContent = "Host failed";
}

function witness(event: string, details: Record<string, unknown> = {}) {
  const row = document.createElement("li");
  row.dataset.event = event;
  row.textContent = JSON.stringify({ event, ...details });
  element("sdk-events").append(row);
}

async function closeWidget() {
  if (bridge) {
    await bridge.teardownResource({}, { timeout: 3000 });
    await bridge.close();
  }
  removeMessageWitness?.();
  removeMessageWitness = undefined;
  iframe?.remove();
  iframe = undefined;
  bridge = undefined;
  closeButton.disabled = true;
  checkSourceButton.disabled = true;
}

connectButton.addEventListener("click", () => {
  connectButton.disabled = true;
  void (async () => {
    const transport = new StreamableHTTPClientTransport(new URL("/mcp", location.origin));
    transport.onmessage = message => {
      if ("result" in message) witness("mcp-response", {
        id: message.id,
        received: true,
        isError: message.result.isError === true,
        ...("structuredContent" in message.result ? { result: message.result } : {}),
      });
    };
    await client.connect(transport, { timeout: 10000 });
    const [toolList, resourceList] = await Promise.all([client.listTools(), client.listResources()]);
    tools = toolList.tools;
    for (const tool of tools.filter(tool => getToolUiResourceUri(tool))) {
      const option = document.createElement("option");
      option.value = tool.name;
      option.textContent = `${tool.title ?? tool.name} (${tool.name})`;
      toolPicker.append(option);
    }
    toolPicker.disabled = false;
    launchButton.disabled = false;
    status.textContent = `Connected: ${tools.length} tools / ${resourceList.resources.length} resources`;
    witness("connected", { server: client.getServerVersion(), tools: tools.map(tool => tool.name), resources: resourceList.resources.map(resource => resource.uri) });
  })().catch(reportError);
});

async function launchWidget() {
  launchButton.disabled = true;
  errorOutput.hidden = true;
  await closeWidget();
  const tool = tools.find(tool => tool.name === toolPicker.value);
  if (!tool) throw new Error("Choose a discovered launch tool.");
  const uri = getToolUiResourceUri(tool);
  if (!uri) throw new Error("The selected tool has no MCP App resource.");
  const config = { live: liveInput.checked, seed: 0, refreshSeconds: 15 };
  status.textContent = "Reading the actual MCP resource";
  const resource = await client.readResource({ uri });
  const content = resource.contents.find(content => content.uri === uri);
  if (!content || !("text" in content) || typeof content.text !== "string") throw new Error("Expected a text MCP App resource.");
  const served = await fetch(`${widgetOrigin}/widget`, { cache: "no-store", credentials: "omit" });
  if (!served.ok || await served.text() !== content.text) throw new Error("The isolated iframe response differs from resources/read.");
  const bytes = new TextEncoder().encode(content.text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  element("resource-proof").textContent = JSON.stringify({ uri, mimeType: content.mimeType, bytes: bytes.byteLength, sha256, identical: true, meta: content._meta }, null, 2);
  element("resource-status").textContent = `Verified resources/read matches isolated /widget (${bytes.byteLength} bytes)`;

  const frame = document.createElement("iframe");
  frame.title = "Workplace MCP App";
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
  frame.style.width = `${widthPicker.value}px`;
  frame.referrerPolicy = "no-referrer";
  element("widget-container").append(frame);
  iframe = frame;
  const current = new AppBridge(toolsInput.checked ? client : null, hostInfo, toolsInput.checked ? { serverTools: {} } : {}, {
    hostContext: { theme: themePicker.value as "light" | "dark", displayMode: "inline", containerDimensions: { width: Number(widthPicker.value) }, toolInfo: { tool }, locale: "en-US", timeZone: "UTC", platform: "web" },
  });
  bridge = current;
  const pendingSizes: Array<{ height?: number; width?: number; origin: string }> = [];
  const observeMessage = (event: MessageEvent) => {
    if (event.data?.jsonrpc !== "2.0" || event.data?.method !== "ui/notifications/size-changed") return;
    if (event.source === frame.contentWindow && event.origin === widgetOrigin) {
      pendingSizes.push({ ...event.data.params, origin: event.origin });
    } else {
      witness("unrelated-size-message", { sourceMatches: event.source === frame.contentWindow, origin: event.origin });
    }
  };
  window.addEventListener("message", observeMessage);
  removeMessageWitness = () => window.removeEventListener("message", observeMessage);
  current.addEventListener("sizechange", params => {
    const message = pendingSizes.shift();
    const provenance = Boolean(message && message.height === params.height && message.width === params.width && message.origin === widgetOrigin);
    witness("sizechange", { callback: "AppBridge.sizechange", method: "ui/notifications/size-changed", params, origin: message?.origin, sourceMatches: provenance });
    if (!provenance || typeof params.height !== "number" || !Number.isFinite(params.height) || params.height <= 0) {
      reportError(new Error("Size callback did not match a real iframe notification."));
      return;
    }
    frame.style.height = `${params.height}px`;
  });
  const initialized = new Promise<void>((resolve, reject) => {
    current.onerror = error => { reportError(error); reject(error); };
    current.addEventListener("initialized", () => {
      witness("initialized", { app: current.getAppVersion() });
      resolve();
    });
  });
  await current.connect(new PostMessageTransport(frame.contentWindow!, frame.contentWindow!));
  frame.src = `${widgetOrigin}/widget`;
  await initialized;
  await current.sendToolInput({ arguments: { config } });
  const result = CallToolResultSchema.parse(await client.callTool({ name: tool.name, arguments: { config } }, CallToolResultSchema, { timeout: 10000 }));
  if (result.isError) throw new Error("The actual launch tool returned an error.");
  element("launch-result").textContent = JSON.stringify(result.structuredContent, null, 2);
  await current.sendToolResult(result);
  status.textContent = `Rendered ${tool.name}`;
  closeButton.disabled = false;
  checkSourceButton.disabled = false;
}

element<HTMLFormElement>("launch-form").addEventListener("submit", event => {
  event.preventDefault();
  void launchWidget().catch(reportError).finally(() => { launchButton.disabled = false; });
});
closeButton.addEventListener("click", () => {
  void closeWidget().then(() => { status.textContent = "Widget closed"; }).catch(reportError);
});
widthPicker.addEventListener("change", () => {
  if (iframe) iframe.style.width = `${widthPicker.value}px`;
  bridge?.setHostContext({ containerDimensions: { width: Number(widthPicker.value) } });
});
themePicker.addEventListener("change", () => {
  bridge?.setHostContext({ theme: themePicker.value as "light" | "dark" });
});
checkSourceButton.addEventListener("click", () => {
  void (async () => {
    if (!bridge) throw new Error("Launch a widget first.");
    window.postMessage({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: 9999 } }, location.origin);
    await bridge.request({ method: "ping" }, EmptyResultSchema, { timeout: 3000 });
    element("probe-status").textContent = "Unrelated sender probe complete";
  })().catch(reportError);
});
window.addEventListener("pagehide", () => {
  removeMessageWitness?.();
  void bridge?.close();
  void client.close();
});
