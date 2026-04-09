import { ApplyMode } from "../../domain/enums/ApplyMode.js";
import { ChromeMessagingService } from "../../infrastructure/browser/ChromeMessagingService.js";
import type { ChromeApiLike, ChromeTabLike } from "../../infrastructure/browser/ChromeApi.js";
import { getChromeApi } from "../../infrastructure/browser/getChromeApi.js";
import type { SiteRule } from "../../domain/models/SiteRule.js";
import type { UserSettings } from "../../domain/models/UserSettings.js";

const APPLY_MODE_ORDER: ApplyMode[] = [
  ApplyMode.SuggestOnly,
  ApplyMode.AskBeforeApply,
  ApplyMode.AutoApply,
];

interface PopupState {
  settings: UserSettings;
  hostName: string | null;
  siteRule: SiteRule | null;
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!(element instanceof HTMLElement)) {
    throw new Error(`Expected element with id "${id}".`);
  }

  return element as T;
}

async function execute<T>(
  operation: (callback: (value: T) => void) => Promise<T> | void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    try {
      const maybePromise = operation(resolve);

      if (typeof maybePromise === "object" && maybePromise !== null && "then" in maybePromise) {
        void maybePromise.then(resolve, reject);
      }
    } catch (error) {
      reject(error);
    }
  });
}

async function getActiveTab(chromeApi: ChromeApiLike): Promise<ChromeTabLike | undefined> {
  const tabs = await execute<ChromeTabLike[]>((callback) =>
    chromeApi.tabs.query({ active: true, currentWindow: true }, callback),
  );

  return tabs[0];
}

function getHostNameFromTab(tab?: ChromeTabLike): string | null {
  if (!tab?.url) {
    return null;
  }

  try {
    const url = new URL(tab.url);

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.hostname;
    }
  } catch {
    return null;
  }

  return null;
}

function cycleApplyMode(current: ApplyMode): ApplyMode {
  const currentIndex = APPLY_MODE_ORDER.indexOf(current);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % APPLY_MODE_ORDER.length;
  return APPLY_MODE_ORDER[nextIndex]!;
}

function getSiteEnabled(settings: UserSettings, siteRule: SiteRule | null): boolean {
  if (!settings.isEnabled) {
    return false;
  }

  return siteRule?.isEnabled ?? true;
}

async function main(): Promise<void> {
  const chromeApi = getChromeApi();
  const messaging = new ChromeMessagingService(chromeApi);

  const statusElement = requireElement<HTMLParagraphElement>("status");
  const globalToggleButton = requireElement<HTMLButtonElement>("toggle-global");
  const modeButton = requireElement<HTMLButtonElement>("cycle-mode");
  const siteButton = requireElement<HTMLButtonElement>("toggle-site");
  const dashboardButton = requireElement<HTMLButtonElement>("open-dashboard");

  const settingsResponse = await messaging.send("loadSettings", {});
  const activeTab = await getActiveTab(chromeApi);
  const hostName = getHostNameFromTab(activeTab);
  const siteRule = hostName
    ? (await messaging.send("fetchSiteRule", { hostName })).rule
    : null;

  const state: PopupState = {
    settings: settingsResponse.settings,
    hostName,
    siteRule,
  };

  const render = (): void => {
    const siteEnabled = getSiteEnabled(state.settings, state.siteRule);
    const hostLabel = state.hostName ?? "no supported site";
    const siteSummary = state.hostName
      ? siteEnabled ? `Enabled on ${hostLabel}` : `Disabled on ${hostLabel}`
      : "Site controls unavailable on this tab";

    statusElement.textContent = [
      state.settings.isEnabled ? "MemoryBank is enabled." : "MemoryBank is disabled.",
      `Mode: ${state.settings.defaultApplyMode}.`,
      siteSummary,
    ].join(" ");

    globalToggleButton.textContent = state.settings.isEnabled
      ? "Disable MemoryBank"
      : "Enable MemoryBank";
    modeButton.textContent = `Cycle Mode (${state.settings.defaultApplyMode})`;

    if (state.hostName) {
      siteButton.disabled = false;
      siteButton.textContent = siteEnabled
        ? `Disable on ${state.hostName}`
        : `Enable on ${state.hostName}`;
    } else {
      siteButton.disabled = true;
      siteButton.textContent = "Site Toggle Unavailable";
    }
  };

  globalToggleButton.addEventListener("click", async () => {
    state.settings = (
      await messaging.send("updateSettings", {
        settings: {
          ...state.settings,
          isEnabled: !state.settings.isEnabled,
        },
      })
    ).settings;
    render();
  });

  modeButton.addEventListener("click", async () => {
    state.settings = (
      await messaging.send("updateSettings", {
        settings: {
          ...state.settings,
          defaultApplyMode: cycleApplyMode(state.settings.defaultApplyMode),
        },
      })
    ).settings;
    render();
  });

  siteButton.addEventListener("click", async () => {
    if (!state.hostName) {
      return;
    }

    const nextRule: SiteRule = {
      hostName: state.hostName,
      isEnabled: !getSiteEnabled(state.settings, state.siteRule),
      ...(state.siteRule?.overrideApplyMode
        ? { overrideApplyMode: state.siteRule.overrideApplyMode }
        : {}),
    };

    state.siteRule = (
      await messaging.send("updateSiteRule", {
        rule: nextRule,
      })
    ).rule;
    render();
  });

  dashboardButton.addEventListener("click", async () => {
    if (chromeApi.runtime.openOptionsPage) {
      await execute<void>((callback) =>
        chromeApi.runtime.openOptionsPage?.(() => callback(undefined)),
      );
      return;
    }

    window.open("options.html", "_blank");
  });

  render();
}

void main().catch((error) => {
  console.error("MemoryBank popup failed to initialize", error);
});
