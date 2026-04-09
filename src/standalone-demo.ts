import {
  ApplyMode,
  FieldType,
  DEFAULT_USER_SETTINGS,
  createInMemoryBackgroundRuntime,
} from "./index.js";

const runtime = createInMemoryBackgroundRuntime({
  initialSettings: {
    ...DEFAULT_USER_SETTINGS,
    defaultApplyMode: ApplyMode.AutoApply,
    autoApplyConfidenceThreshold: 0.8,
  },
});

await runtime.handleMessage({
  type: "saveMemory",
  payload: {
    questionText: "Why do you want to work here?",
    answer: { textValue: "I enjoy mission-driven teams and user-facing product work." },
    hostName: "jobs.example.com",
    tags: ["interview", "motivation"],
  },
});

const analysis = await runtime.handleMessage({
  type: "analyzeField",
  payload: {
    field: {
      fieldId: "motivation",
      fieldType: FieldType.TextArea,
      questionText: "Why do you want to work at our company?",
      isRequired: true,
      hostName: "jobs.example.com",
      sectionText: "Application Questions",
    },
  },
});

console.log(analysis);
