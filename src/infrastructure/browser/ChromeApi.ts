export interface ChromeStorageAreaLike {
  get(
    keys?: string | string[] | Record<string, unknown> | null,
    callback?: (items: Record<string, unknown>) => void,
  ): Promise<Record<string, unknown>> | void;
  set(
    items: Record<string, unknown>,
    callback?: () => void,
  ): Promise<void> | void;
  remove(
    keys: string | string[],
    callback?: () => void,
  ): Promise<void> | void;
}

export interface ChromeRuntimeMessageSenderLike {
  id?: string;
  url?: string;
  origin?: string;
  tab?: {
    id?: number;
    url?: string;
  };
}

export type ChromeRuntimeMessageListener = (
  message: unknown,
  sender: ChromeRuntimeMessageSenderLike,
  sendResponse: (response: unknown) => void,
) => boolean | void;

export interface ChromeRuntimeOnMessageLike {
  addListener(listener: ChromeRuntimeMessageListener): void;
  removeListener(listener: ChromeRuntimeMessageListener): void;
}

export interface ChromeRuntimeLike {
  sendMessage(
    message: unknown,
    callback?: (response: unknown) => void,
  ): Promise<unknown> | void;
  openOptionsPage?(callback?: () => void): Promise<void> | void;
  onMessage: ChromeRuntimeOnMessageLike;
  lastError?: {
    message?: string;
  };
}

export interface ChromeTabLike {
  id?: number;
  url?: string;
  active?: boolean;
  currentWindow?: boolean;
}

export interface ChromeTabsLike {
  query(
    queryInfo: Record<string, unknown>,
    callback?: (tabs: ChromeTabLike[]) => void,
  ): Promise<ChromeTabLike[]> | void;
}

export interface ChromeApiLike {
  storage: {
    local: ChromeStorageAreaLike;
  };
  runtime: ChromeRuntimeLike;
  tabs: ChromeTabsLike;
}
