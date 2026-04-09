import { AnswerType } from "../../domain/enums/AnswerType.js";
import { ApplyMode } from "../../domain/enums/ApplyMode.js";
import type { AnswerPayload } from "../../domain/models/AnswerPayload.js";
import type { MemoryEntry } from "../../domain/models/MemoryEntry.js";
import type { UserSettings } from "../../domain/models/UserSettings.js";
import { ChromeMessagingService } from "../../infrastructure/browser/ChromeMessagingService.js";
import { getChromeApi } from "../../infrastructure/browser/getChromeApi.js";

const APPLY_MODE_ORDER: ApplyMode[] = [
  ApplyMode.SuggestOnly,
  ApplyMode.AskBeforeApply,
  ApplyMode.AutoApply,
];

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!(element instanceof HTMLElement)) {
    throw new Error(`Expected element with id "${id}".`);
  }

  return element as T;
}

function cycleApplyMode(current: ApplyMode): ApplyMode {
  const currentIndex = APPLY_MODE_ORDER.indexOf(current);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % APPLY_MODE_ORDER.length;
  return APPLY_MODE_ORDER[nextIndex]!;
}

function answerPayloadToEditor(memory: MemoryEntry): {
  answerType: AnswerType;
  textValue: string;
  booleanValue: boolean;
} {
  switch (memory.answerType) {
    case AnswerType.Boolean:
      return {
        answerType: AnswerType.Boolean,
        textValue: "",
        booleanValue: memory.answer.booleanValue ?? false,
      };
    case AnswerType.MultiSelect:
      return {
        answerType: AnswerType.MultiSelect,
        textValue: (memory.answer.multiSelectValues ?? []).join("\n"),
        booleanValue: false,
      };
    case AnswerType.SelectChoice:
      return {
        answerType: AnswerType.SelectChoice,
        textValue: memory.answer.selectValue ?? "",
        booleanValue: false,
      };
    case AnswerType.Text:
    default:
      return {
        answerType: AnswerType.Text,
        textValue: memory.answer.textValue ?? "",
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
  const searchInput = requireElement<HTMLInputElement>("memory-search");
  const memoryList = requireElement<HTMLDivElement>("memory-list");
  const emptyState = requireElement<HTMLParagraphElement>("memory-empty");
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

  const renderSettings = (): void => {
    statusElement.textContent = settings.isEnabled
      ? `MemoryBank is enabled. Mode: ${settings.defaultApplyMode}.`
      : `MemoryBank is disabled. Mode: ${settings.defaultApplyMode}.`;

    settingsButton.textContent = settings.isEnabled
      ? "Disable MemoryBank"
      : "Enable MemoryBank";
    modeButton.textContent = `Cycle Mode (${settings.defaultApplyMode})`;
  };

  const renderMemoryList = (): void => {
    memoryList.innerHTML = "";

    const filtered = memories.filter((memory) =>
      memory.questionText.toLowerCase().includes(searchInput.value.trim().toLowerCase()),
    );

    emptyState.hidden = filtered.length > 0;

    for (const memory of filtered) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = memory.id === selectedMemoryId ? "memory-list-item active" : "memory-list-item";
      button.textContent = memory.questionText;
      button.addEventListener("click", () => {
        selectedMemoryId = memory.id;
        renderMemoryList();
        renderEditor();
      });
      memoryList.appendChild(button);
    }
  };

  const renderEditor = (): void => {
    const selectedMemory = memories.find((memory) => memory.id === selectedMemoryId);

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
      updateAnswerInputs();
      return;
    }

    const editorState = answerPayloadToEditor(selectedMemory);
    questionInput.value = selectedMemory.questionText;
    answerTypeSelect.value = editorState.answerType;
    answerText.value = editorState.textValue;
    answerBoolean.checked = editorState.booleanValue;
    enabledInput.checked = selectedMemory.enabled;
    hostsInput.value = selectedMemory.sourceHosts.join(", ");
    tagsInput.value = selectedMemory.tags.join(", ");
    saveButton.disabled = false;
    deleteButton.disabled = false;
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
    renderMemoryList();
  });

  answerTypeSelect.addEventListener("change", () => {
    updateAnswerInputs();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const selectedMemory = memories.find((memory) => memory.id === selectedMemoryId);

    if (!selectedMemory) {
      return;
    }

    const updatedMemory: MemoryEntry = {
      ...selectedMemory,
      questionText: questionInput.value.trim(),
      answerType: answerTypeSelect.value as AnswerType,
      answer: editorToAnswerPayload(
        answerTypeSelect.value as AnswerType,
        answerText.value,
        answerBoolean.checked,
      ),
      enabled: enabledInput.checked,
      sourceHosts: hostsInput.value
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      tags: tagsInput.value
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
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
    if (!selectedMemoryId) {
      return;
    }

    await messaging.send("deleteMemory", {
      memoryId: selectedMemoryId,
    });

    memories = memories.filter((memory) => memory.id !== selectedMemoryId);
    selectedMemoryId = memories[0]?.id ?? null;
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
