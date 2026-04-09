import { AnswerType } from "../../domain/enums/AnswerType.js";
import { ApplyMode } from "../../domain/enums/ApplyMode.js";
import type { AnswerPayload } from "../../domain/models/AnswerPayload.js";
import type { MemoryEntry } from "../../domain/models/MemoryEntry.js";
import type { UserSettings } from "../../domain/models/UserSettings.js";
import { ChromeMessagingService } from "../../infrastructure/browser/ChromeMessagingService.js";
import { getChromeApi } from "../../infrastructure/browser/getChromeApi.js";

const MEMORIES_PER_PAGE = 12;
const APPLY_MODE_ORDER: ApplyMode[] = [
  ApplyMode.AskBeforeApply,
  ApplyMode.AutoApply,
];

interface MemoryDraft {
  questionText: string;
  answerType: AnswerType;
  answer: AnswerPayload;
  enabled: boolean;
  sourceHosts: string[];
  tags: string[];
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!(element instanceof HTMLElement)) {
    throw new Error(`Expected element with id "${id}".`);
  }

  return element as T;
}

function cycleApplyMode(current: ApplyMode): ApplyMode {
  const normalizedCurrent = current === ApplyMode.SuggestOnly
    ? ApplyMode.AskBeforeApply
    : current;
  const currentIndex = APPLY_MODE_ORDER.indexOf(normalizedCurrent);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % APPLY_MODE_ORDER.length;
  return APPLY_MODE_ORDER[nextIndex]!;
}

function formatApplyMode(mode: ApplyMode): ApplyMode {
  return mode === ApplyMode.SuggestOnly
    ? ApplyMode.AskBeforeApply
    : mode;
}

function answerPayloadToEditorValue(
  answerType: AnswerType,
  answer: AnswerPayload,
): {
  answerType: AnswerType;
  textValue: string;
  booleanValue: boolean;
} {
  switch (answerType) {
    case AnswerType.Boolean:
      return {
        answerType: AnswerType.Boolean,
        textValue: "",
        booleanValue: answer.booleanValue ?? false,
      };
    case AnswerType.MultiSelect:
      return {
        answerType: AnswerType.MultiSelect,
        textValue: (answer.multiSelectValues ?? []).join("\n"),
        booleanValue: false,
      };
    case AnswerType.SelectChoice:
      return {
        answerType: AnswerType.SelectChoice,
        textValue: answer.selectValue ?? "",
        booleanValue: false,
      };
    case AnswerType.Text:
    default:
      return {
        answerType: AnswerType.Text,
        textValue: answer.textValue ?? "",
        booleanValue: false,
      };
  }
}

function editorToAnswerPayload(answerType: AnswerType, textValue: string, booleanValue: boolean): AnswerPayload {
  switch (answerType) {
    case AnswerType.Boolean:
      return { booleanValue };
    case AnswerType.MultiSelect:
      return {
        multiSelectValues: textValue
          .split(/\r?\n/)
          .map((value) => value.trim())
          .filter(Boolean),
      };
    case AnswerType.SelectChoice:
      return { selectValue: textValue.trim() };
    case AnswerType.Text:
    default:
      return { textValue: textValue.trim() };
  }
}

async function main(): Promise<void> {
  const messaging = new ChromeMessagingService(getChromeApi());

  const statusElement = requireElement<HTMLParagraphElement>("dashboard-status");
  const settingsButton = requireElement<HTMLButtonElement>("toggle-settings");
  const modeButton = requireElement<HTMLButtonElement>("cycle-settings-mode");
  const createButton = requireElement<HTMLButtonElement>("create-memory");
  const searchInput = requireElement<HTMLInputElement>("memory-search");
  const memoryList = requireElement<HTMLDivElement>("memory-list");
  const emptyState = requireElement<HTMLParagraphElement>("memory-empty");
  const pagination = requireElement<HTMLDivElement>("memory-pagination");
  const paginationPrevButton = requireElement<HTMLButtonElement>("memory-page-prev");
  const paginationNextButton = requireElement<HTMLButtonElement>("memory-page-next");
  const paginationStatus = requireElement<HTMLSpanElement>("memory-page-status");
  const form = requireElement<HTMLFormElement>("memory-form");
  const questionInput = requireElement<HTMLInputElement>("memory-question");
  const answerTypeSelect = requireElement<HTMLSelectElement>("memory-answer-type");
  const answerText = requireElement<HTMLTextAreaElement>("memory-answer-text");
  const answerBoolean = requireElement<HTMLInputElement>("memory-answer-boolean");
  const enabledInput = requireElement<HTMLInputElement>("memory-enabled");
  const hostsInput = requireElement<HTMLInputElement>("memory-hosts");
  const tagsInput = requireElement<HTMLInputElement>("memory-tags");
  const saveButton = requireElement<HTMLButtonElement>("save-memory");
  const deleteButton = requireElement<HTMLButtonElement>("delete-memory");

  let settings: UserSettings = (await messaging.send("loadSettings", {})).settings;
  let memories: MemoryEntry[] = (await messaging.send("fetchMemories", { query: "" })).memories;
  let selectedMemoryId: string | null = memories[0]?.id ?? null;
  let currentPage = 1;
  let draft: MemoryDraft | null = null;

  const getFilteredMemories = (): MemoryEntry[] =>
    memories.filter((memory) =>
      memory.questionText.toLowerCase().includes(searchInput.value.trim().toLowerCase()),
    );

  const renderSettings = (): void => {
    statusElement.textContent = settings.isEnabled
      ? `MemoryBank is enabled. Mode: ${formatApplyMode(settings.defaultApplyMode)}.`
      : `MemoryBank is disabled. Mode: ${formatApplyMode(settings.defaultApplyMode)}.`;

    settingsButton.textContent = settings.isEnabled
      ? "Disable MemoryBank"
      : "Enable MemoryBank";
    modeButton.textContent = `Cycle Mode (${formatApplyMode(settings.defaultApplyMode)})`;
  };

  const renderMemoryList = (): void => {
    memoryList.innerHTML = "";
    const filtered = getFilteredMemories();
    const totalPages = Math.max(1, Math.ceil(filtered.length / MEMORIES_PER_PAGE));
    currentPage = Math.min(currentPage, totalPages);
    currentPage = Math.max(1, currentPage);
    const startIndex = (currentPage - 1) * MEMORIES_PER_PAGE;
    const pageItems = filtered.slice(startIndex, startIndex + MEMORIES_PER_PAGE);

    emptyState.hidden = filtered.length > 0;
    pagination.hidden = filtered.length <= MEMORIES_PER_PAGE;
    paginationStatus.textContent = `Page ${currentPage} of ${totalPages}`;
    paginationPrevButton.disabled = currentPage <= 1;
    paginationNextButton.disabled = currentPage >= totalPages;

    for (const memory of pageItems) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = memory.id === selectedMemoryId ? "memory-list-item active" : "memory-list-item";
      button.textContent = memory.questionText;
      button.addEventListener("click", () => {
        draft = null;
        selectedMemoryId = memory.id;
        renderMemoryList();
        renderEditor();
      });
      memoryList.appendChild(button);
    }
  };

  const renderEditor = (): void => {
    const selectedMemory = memories.find((memory) => memory.id === selectedMemoryId);

    if (!selectedMemory && draft) {
      const editorState = answerPayloadToEditorValue(draft.answerType, draft.answer);
      questionInput.value = draft.questionText;
      answerTypeSelect.value = editorState.answerType;
      answerText.value = editorState.textValue;
      answerBoolean.checked = editorState.booleanValue;
      enabledInput.checked = draft.enabled;
      hostsInput.value = draft.sourceHosts.join(", ");
      tagsInput.value = draft.tags.join(", ");
      saveButton.disabled = false;
      deleteButton.disabled = false;
      deleteButton.textContent = "Cancel";
      updateAnswerInputs();
      return;
    }

    if (!selectedMemory) {
      questionInput.value = "";
      answerTypeSelect.value = AnswerType.Text;
      answerText.value = "";
      answerBoolean.checked = false;
      enabledInput.checked = true;
      hostsInput.value = "";
      tagsInput.value = "";
      saveButton.disabled = true;
      deleteButton.disabled = true;
      deleteButton.textContent = "Delete Memory";
      updateAnswerInputs();
      return;
    }

    const editorState = answerPayloadToEditorValue(
      selectedMemory.answerType,
      selectedMemory.answer,
    );
    questionInput.value = selectedMemory.questionText;
    answerTypeSelect.value = editorState.answerType;
    answerText.value = editorState.textValue;
    answerBoolean.checked = editorState.booleanValue;
    enabledInput.checked = selectedMemory.enabled;
    hostsInput.value = selectedMemory.sourceHosts.join(", ");
    tagsInput.value = selectedMemory.tags.join(", ");
    saveButton.disabled = false;
    deleteButton.disabled = false;
    deleteButton.textContent = "Delete Memory";
    updateAnswerInputs();
  };

  const updateAnswerInputs = (): void => {
    const isBoolean = answerTypeSelect.value === AnswerType.Boolean;
    answerText.hidden = isBoolean;
    answerBoolean.parentElement?.toggleAttribute("hidden", !isBoolean);
  };

  settingsButton.addEventListener("click", async () => {
    settings = (
      await messaging.send("updateSettings", {
        settings: {
          ...settings,
          isEnabled: !settings.isEnabled,
        },
      })
    ).settings;
    renderSettings();
  });

  modeButton.addEventListener("click", async () => {
    settings = (
      await messaging.send("updateSettings", {
        settings: {
          ...settings,
          defaultApplyMode: cycleApplyMode(settings.defaultApplyMode),
        },
      })
    ).settings;
    renderSettings();
  });

  searchInput.addEventListener("input", () => {
    currentPage = 1;
    renderMemoryList();
  });

  createButton.addEventListener("click", () => {
    draft = {
      questionText: "",
      answerType: AnswerType.Text,
      answer: { textValue: "" },
      enabled: true,
      sourceHosts: [],
      tags: [],
    };
    selectedMemoryId = null;
    renderMemoryList();
    renderEditor();
    questionInput.focus();
  });

  paginationPrevButton.addEventListener("click", () => {
    currentPage = Math.max(1, currentPage - 1);
    renderMemoryList();
  });

  paginationNextButton.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(getFilteredMemories().length / MEMORIES_PER_PAGE));
    currentPage = Math.min(totalPages, currentPage + 1);
    renderMemoryList();
  });

  answerTypeSelect.addEventListener("change", () => {
    updateAnswerInputs();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const selectedMemory = memories.find((memory) => memory.id === selectedMemoryId);
    const answerType = answerTypeSelect.value as AnswerType;
    const answer = editorToAnswerPayload(
      answerType,
      answerText.value,
      answerBoolean.checked,
    );
    const hosts = hostsInput.value
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const tags = tagsInput.value
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (!selectedMemory && draft) {
      const response = await messaging.send("saveMemory", {
        questionText: questionInput.value.trim(),
        answer,
        hostName: hosts[0] ?? "manual",
        tags,
      });

      const savedMemory = response.memory;
      memories = [savedMemory, ...memories.filter((memory) => memory.id !== savedMemory.id)];
      draft = null;
      selectedMemoryId = savedMemory.id;
      currentPage = 1;
      renderMemoryList();
      renderEditor();
      return;
    }

    if (!selectedMemory) {
      return;
    }

    const updatedMemory: MemoryEntry = {
      ...selectedMemory,
      questionText: questionInput.value.trim(),
      answerType,
      answer,
      enabled: enabledInput.checked,
      sourceHosts: hosts,
      tags,
    };

    const response = await messaging.send("updateMemory", {
      memory: updatedMemory,
    });

    memories = memories.map((memory) =>
      memory.id === response.memory.id ? response.memory : memory,
    );
    renderMemoryList();
    renderEditor();
  });

  deleteButton.addEventListener("click", async () => {
    if (draft) {
      draft = null;
      selectedMemoryId = memories[0]?.id ?? null;
      renderMemoryList();
      renderEditor();
      return;
    }

    if (!selectedMemoryId) {
      return;
    }

    await messaging.send("deleteMemory", {
      memoryId: selectedMemoryId,
    });

    memories = memories.filter((memory) => memory.id !== selectedMemoryId);
    selectedMemoryId = memories[0]?.id ?? null;
    currentPage = 1;
    renderMemoryList();
    renderEditor();
  });

  renderSettings();
  renderMemoryList();
  renderEditor();
}

void main().catch((error) => {
  console.error("MemoryBank dashboard failed to initialize", error);
});
