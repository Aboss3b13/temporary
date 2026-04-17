"use strict";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

const STORAGE_KEYS = {
  apiKey: "quizforge_groq_api_key",
  model: "quizforge_groq_model"
};

const MODE_LABELS = {
  mcq: "Multiple Choice",
  fib: "Fill In The Blank",
  learn: "Learn + Quiz"
};

const appState = {
  mode: "mcq",
  topic: "",
  difficulty: "intermediate",
  questionCount: 6,
  apiKey: "",
  model: DEFAULT_MODEL,
  lesson: null,
  questions: [],
  answers: {},
  currentIndex: 0,
  results: [],
  chatHistory: []
};

const ui = {
  modeButtons: document.querySelectorAll(".mode-btn"),
  countRange: document.getElementById("questionCountRange"),
  countLabel: document.getElementById("countLabel"),
  topicInput: document.getElementById("topicInput"),
  difficultySelect: document.getElementById("difficultySelect"),
  generatorForm: document.getElementById("generatorForm"),
  generateBtn: document.getElementById("generateBtn"),
  statusText: document.getElementById("statusText"),

  lessonCard: document.getElementById("lessonCard"),
  lessonTitle: document.getElementById("lessonTitle"),
  lessonContent: document.getElementById("lessonContent"),
  startLearnQuizBtn: document.getElementById("startLearnQuizBtn"),

  quizCard: document.getElementById("quizCard"),
  progressLabel: document.getElementById("progressLabel"),
  modeLabel: document.getElementById("modeLabel"),
  questionText: document.getElementById("questionText"),
  questionHint: document.getElementById("questionHint"),
  optionsWrap: document.getElementById("optionsWrap"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  finishBtn: document.getElementById("finishBtn"),

  resultsCard: document.getElementById("resultsCard"),
  scoreBadge: document.getElementById("scoreBadge"),
  scoreSummary: document.getElementById("scoreSummary"),
  reviewList: document.getElementById("reviewList"),
  restartBtn: document.getElementById("restartBtn"),

  chatMessages: document.getElementById("chatMessages"),
  chatForm: document.getElementById("chatForm"),
  chatInput: document.getElementById("chatInput"),
  chatSendBtn: document.getElementById("chatSendBtn"),

  openSettingsBtn: document.getElementById("openSettingsBtn"),
  settingsModal: document.getElementById("settingsModal"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  modelInput: document.getElementById("modelInput"),
  closeSettingsBtn: document.getElementById("closeSettingsBtn"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn")
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  hydrateSettings();
  bindEvents();
  setMode("mcq");
  updateQuestionCount();
  addChatMessage("assistant", "I can explain topics, give hints, and help you improve weak spots. Add your Groq key in Groq Setup to begin.");
}

function bindEvents() {
  ui.modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  ui.countRange.addEventListener("input", updateQuestionCount);
  ui.generatorForm.addEventListener("submit", handleGenerateQuiz);
  ui.startLearnQuizBtn.addEventListener("click", () => {
    ui.lessonCard.classList.add("hidden");
    ui.quizCard.classList.remove("hidden");
    renderQuestion();
  });

  ui.prevBtn.addEventListener("click", handlePrevQuestion);
  ui.nextBtn.addEventListener("click", handleNextQuestion);
  ui.finishBtn.addEventListener("click", handleFinishQuiz);
  ui.restartBtn.addEventListener("click", () => {
    ui.resultsCard.classList.add("hidden");
    ui.quizCard.classList.add("hidden");
    updateStatus("Pick a new topic and generate your next quiz.", "success");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  ui.chatForm.addEventListener("submit", handleChatSubmit);

  ui.openSettingsBtn.addEventListener("click", openSettingsModal);
  ui.closeSettingsBtn.addEventListener("click", closeSettingsModal);
  ui.saveSettingsBtn.addEventListener("click", saveSettings);

  ui.settingsModal.addEventListener("click", (event) => {
    if (event.target === ui.settingsModal) {
      closeSettingsModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSettingsModal();
    }
  });
}

function hydrateSettings() {
  appState.apiKey = localStorage.getItem(STORAGE_KEYS.apiKey) || "";
  appState.model = localStorage.getItem(STORAGE_KEYS.model) || DEFAULT_MODEL;

  ui.apiKeyInput.value = appState.apiKey;
  ui.modelInput.value = appState.model;

  if (appState.apiKey) {
    updateStatus("Groq key loaded. Ready to generate AI quizzes.", "success");
  } else {
    updateStatus("Add your Groq API key in Groq Setup to enable AI generation.", "warn");
  }
}

function setMode(mode) {
  appState.mode = mode;
  ui.modeButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  ui.modeLabel.textContent = MODE_LABELS[mode] || MODE_LABELS.mcq;
}

function updateQuestionCount() {
  appState.questionCount = Number(ui.countRange.value);
  ui.countLabel.textContent = String(appState.questionCount);
}

function openSettingsModal() {
  ui.settingsModal.classList.remove("hidden");
  ui.settingsModal.setAttribute("aria-hidden", "false");
  ui.apiKeyInput.focus();
}

function closeSettingsModal() {
  ui.settingsModal.classList.add("hidden");
  ui.settingsModal.setAttribute("aria-hidden", "true");
}

function saveSettings() {
  const apiKey = ui.apiKeyInput.value.trim();
  const model = ui.modelInput.value.trim() || DEFAULT_MODEL;

  appState.apiKey = apiKey;
  appState.model = model;

  localStorage.setItem(STORAGE_KEYS.apiKey, apiKey);
  localStorage.setItem(STORAGE_KEYS.model, model);

  closeSettingsModal();

  if (!apiKey) {
    updateStatus("Groq key cleared. AI generation is disabled until you add one.", "warn");
    return;
  }

  updateStatus("Groq settings saved.", "success");
}

async function handleGenerateQuiz(event) {
  event.preventDefault();

  appState.topic = ui.topicInput.value.trim();
  appState.difficulty = ui.difficultySelect.value;

  if (!appState.topic) {
    updateStatus("Please enter a topic first.", "warn");
    ui.topicInput.focus();
    return;
  }

  if (!appState.apiKey) {
    updateStatus("Add your Groq API key in Groq Setup before generating.", "warn");
    openSettingsModal();
    return;
  }

  setUiBusy(true, "Generating quiz with Groq...");

  try {
    const payload = await generateQuizFromGroq();

    appState.lesson = payload.lesson;
    appState.questions = payload.questions;
    appState.answers = {};
    appState.results = [];
    appState.currentIndex = 0;

    ui.resultsCard.classList.add("hidden");

    if (appState.mode === "learn") {
      renderLesson();
      ui.lessonCard.classList.remove("hidden");
      ui.quizCard.classList.add("hidden");
      updateStatus("Lesson generated. Review it, then start your quiz.", "success");
    } else {
      ui.lessonCard.classList.add("hidden");
      ui.quizCard.classList.remove("hidden");
      renderQuestion();
      updateStatus("Quiz ready. Answer the questions and finish.", "success");
    }

    ui.quizCard.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    const fallback = buildFallbackPayload(appState.mode, appState.topic, appState.questionCount);
    appState.lesson = fallback.lesson;
    appState.questions = fallback.questions;
    appState.answers = {};
    appState.results = [];
    appState.currentIndex = 0;

    if (appState.mode === "learn") {
      renderLesson();
      ui.lessonCard.classList.remove("hidden");
      ui.quizCard.classList.add("hidden");
    } else {
      ui.lessonCard.classList.add("hidden");
      ui.quizCard.classList.remove("hidden");
      renderQuestion();
    }

    updateStatus("Groq request failed. Loaded fallback quiz instead. " + error.message, "error");
  } finally {
    setUiBusy(false);
  }
}

async function generateQuizFromGroq() {
  const prompt = buildQuizPrompt(appState.mode, appState.topic, appState.difficulty, appState.questionCount);

  const messages = [
    {
      role: "system",
      content: "You are a precision quiz generator. Return strict JSON only. No markdown, no commentary."
    },
    {
      role: "user",
      content: prompt
    }
  ];

  const rawResponse = await callGroq(messages, {
    temperature: 0.45,
    maxTokens: 1800
  });

  const parsed = parseJsonResponse(rawResponse);
  return normalizePayload(parsed, appState.mode, appState.questionCount, appState.topic);
}

function buildQuizPrompt(mode, topic, difficulty, count) {
  if (mode === "mcq") {
    return [
      "Create " + count + " multiple choice questions.",
      "Topic: " + topic,
      "Difficulty: " + difficulty,
      "Rules:",
      "- Exactly 4 options per question",
      "- answer must match one of the options exactly",
      "- concise explanations",
      "Return JSON with shape:",
      '{"questions":[{"type":"mcq","question":"","options":["","","",""],"answer":"","explanation":""}]}'
    ].join("\n");
  }

  if (mode === "fib") {
    return [
      "Create " + count + " fill-in-the-blank questions.",
      "Topic: " + topic,
      "Difficulty: " + difficulty,
      "Rules:",
      "- each question must contain ____",
      "- provide short answer in answer field",
      "- concise explanations",
      "Return JSON with shape:",
      '{"questions":[{"type":"fib","question":"","answer":"","explanation":""}]}'
    ].join("\n");
  }

  return [
    "Create a learn-first quiz pack.",
    "Topic: " + topic,
    "Difficulty: " + difficulty,
    "Question count: " + count,
    "Rules:",
    "- include a lesson object with title and points (array)",
    "- then generate mixed quiz questions using type mcq or fib",
    "- mcq questions need 4 options and exact answer",
    "- fib questions must contain ____",
    "Return JSON with shape:",
    '{"lesson":{"title":"","points":["",""]},"questions":[{"type":"mcq","question":"","options":["","","",""],"answer":"","explanation":""}]}'
  ].join("\n");
}

function normalizePayload(payload, mode, count, topic) {
  const normalized = {
    lesson: null,
    questions: []
  };

  if (mode === "learn") {
    normalized.lesson = normalizeLesson(payload.lesson, topic);
  }

  const rawQuestions = Array.isArray(payload.questions) ? payload.questions : [];
  const questions = rawQuestions
    .map((item, index) => normalizeQuestion(item, mode, index))
    .filter(Boolean)
    .slice(0, count);

  if (questions.length < count) {
    const fallback = buildFallbackPayload(mode, topic, count - questions.length).questions;
    normalized.questions = questions.concat(fallback).slice(0, count);
  } else {
    normalized.questions = questions;
  }

  if (mode === "learn" && !normalized.lesson) {
    normalized.lesson = normalizeLesson(null, topic);
  }

  return normalized;
}

function normalizeLesson(rawLesson, topic) {
  if (!rawLesson || typeof rawLesson !== "object") {
    return {
      title: topic + " essentials",
      points: [
        "Start with core definitions and map the big ideas.",
        "Use examples to connect abstract concepts to real scenarios.",
        "Summarize key facts in your own words before testing yourself."
      ]
    };
  }

  const title = typeof rawLesson.title === "string" && rawLesson.title.trim()
    ? rawLesson.title.trim()
    : topic + " essentials";

  const points = Array.isArray(rawLesson.points)
    ? rawLesson.points.map((point) => String(point).trim()).filter(Boolean)
    : [];

  return {
    title,
    points: points.length ? points.slice(0, 6) : [
      "Review fundamentals before moving to advanced details.",
      "Practice retrieval to lock in what you learned.",
      "Spot patterns and common mistakes."
    ]
  };
}

function normalizeQuestion(rawQuestion, mode, index) {
  if (!rawQuestion || typeof rawQuestion !== "object") {
    return null;
  }

  const expectedType = mode === "learn"
    ? (rawQuestion.type === "fib" ? "fib" : "mcq")
    : mode;

  const questionText = String(rawQuestion.question || "").trim();
  if (!questionText) {
    return null;
  }

  if (expectedType === "mcq") {
    let options = Array.isArray(rawQuestion.options)
      ? rawQuestion.options.map((option) => String(option).trim()).filter(Boolean)
      : [];

    while (options.length < 4) {
      options.push("Option " + String.fromCharCode(65 + options.length));
    }

    options = options.slice(0, 4);

    let answer = String(rawQuestion.answer || "").trim();
    if (!options.includes(answer)) {
      answer = options[0];
    }

    return {
      type: "mcq",
      question: questionText,
      options,
      answer,
      explanation: String(rawQuestion.explanation || "Review this concept and compare each option.").trim()
    };
  }

  const fibQuestion = questionText.includes("____") ? questionText : questionText + " ____";

  return {
    type: "fib",
    question: fibQuestion,
    answer: String(rawQuestion.answer || "").trim() || "concept",
    explanation: String(rawQuestion.explanation || "Think about the core idea this blank represents.").trim()
  };
}

function renderLesson() {
  if (!appState.lesson) {
    return;
  }

  ui.lessonTitle.textContent = appState.lesson.title;
  ui.lessonContent.innerHTML = "";

  appState.lesson.points.forEach((point, index) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = String(index + 1) + ". " + point;
    ui.lessonContent.appendChild(paragraph);
  });
}

function renderQuestion() {
  if (!appState.questions.length) {
    return;
  }

  const currentQuestion = appState.questions[appState.currentIndex];
  const currentAnswer = appState.answers[appState.currentIndex] || "";

  ui.progressLabel.textContent = "Question " + String(appState.currentIndex + 1) + " / " + String(appState.questions.length);
  ui.modeLabel.textContent = MODE_LABELS[appState.mode] || MODE_LABELS.mcq;
  ui.questionText.textContent = currentQuestion.question;
  ui.questionHint.textContent = currentQuestion.type === "fib"
    ? "Type your answer and continue."
    : "Choose the best answer.";

  ui.optionsWrap.innerHTML = "";

  if (currentQuestion.type === "mcq") {
    currentQuestion.options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-btn" + (currentAnswer === option ? " selected" : "");
      button.textContent = option;
      button.addEventListener("click", () => {
        appState.answers[appState.currentIndex] = option;
        renderQuestion();
      });
      ui.optionsWrap.appendChild(button);
    });
  } else {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "blank-input";
    input.placeholder = "Type your answer";
    input.value = currentAnswer;
    input.addEventListener("input", (event) => {
      appState.answers[appState.currentIndex] = event.target.value;
    });
    ui.optionsWrap.appendChild(input);
  }

  ui.prevBtn.disabled = appState.currentIndex === 0;

  const atLastQuestion = appState.currentIndex === appState.questions.length - 1;
  ui.nextBtn.classList.toggle("hidden", atLastQuestion);
  ui.finishBtn.classList.toggle("hidden", !atLastQuestion);
}

function handlePrevQuestion() {
  if (appState.currentIndex <= 0) {
    return;
  }
  appState.currentIndex -= 1;
  renderQuestion();
}

function handleNextQuestion() {
  if (!hasCurrentAnswer()) {
    updateStatus("Answer this question first.", "warn");
    return;
  }

  if (appState.currentIndex < appState.questions.length - 1) {
    appState.currentIndex += 1;
    renderQuestion();
  }
}

function handleFinishQuiz() {
  if (!hasCurrentAnswer()) {
    updateStatus("Please answer the final question first.", "warn");
    return;
  }

  appState.results = appState.questions.map((question, index) => {
    const userAnswer = String(appState.answers[index] || "").trim();
    const result = evaluateAnswer(question, userAnswer);
    return {
      question,
      userAnswer,
      correct: result.correct,
      expectedAnswer: result.expectedAnswer,
      explanation: question.explanation
    };
  });

  const score = appState.results.filter((item) => item.correct).length;
  const total = appState.results.length;
  const percentage = Math.round((score / total) * 100);

  ui.scoreBadge.textContent = score + " / " + total;
  ui.scoreSummary.textContent = "You scored " + String(percentage) + "% on " + MODE_LABELS[appState.mode] + " mode.";

  renderReview();
  ui.quizCard.classList.add("hidden");
  ui.resultsCard.classList.remove("hidden");
  ui.resultsCard.scrollIntoView({ behavior: "smooth", block: "start" });

  updateStatus("Quiz completed.", "success");
}

function evaluateAnswer(question, userAnswer) {
  if (question.type === "mcq") {
    const expected = normalizeText(question.answer);
    const actual = normalizeText(userAnswer);
    return {
      correct: expected === actual,
      expectedAnswer: question.answer
    };
  }

  const candidates = String(question.answer)
    .split("|")
    .map((part) => normalizeText(part))
    .filter(Boolean);

  const actual = normalizeText(userAnswer);
  const correct = candidates.includes(actual);

  return {
    correct,
    expectedAnswer: question.answer
  };
}

function normalizeText(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function renderReview() {
  ui.reviewList.innerHTML = "";

  appState.results.forEach((item, index) => {
    const block = document.createElement("article");
    block.className = "review-item";

    const title = document.createElement("h3");
    title.textContent = "Q" + String(index + 1) + " - " + (item.correct ? "Correct" : "Needs Work");

    const question = document.createElement("p");
    question.textContent = "Question: " + item.question.question;

    const yourAnswer = document.createElement("p");
    yourAnswer.textContent = "Your answer: " + (item.userAnswer || "(blank)");

    const expected = document.createElement("p");
    expected.textContent = "Correct answer: " + item.expectedAnswer;

    const explain = document.createElement("p");
    explain.textContent = "Why: " + item.explanation;

    block.appendChild(title);
    block.appendChild(question);
    block.appendChild(yourAnswer);
    block.appendChild(expected);
    block.appendChild(explain);
    ui.reviewList.appendChild(block);
  });
}

function hasCurrentAnswer() {
  const answer = appState.answers[appState.currentIndex];
  return typeof answer === "string" && answer.trim().length > 0;
}

function updateStatus(message, type = "") {
  ui.statusText.textContent = message;
  ui.statusText.className = "status";
  if (type) {
    ui.statusText.classList.add(type);
  }
}

function setUiBusy(isBusy, statusMessage) {
  ui.generateBtn.disabled = isBusy;
  ui.chatSendBtn.disabled = isBusy;

  if (isBusy && statusMessage) {
    updateStatus(statusMessage);
  }
}

async function handleChatSubmit(event) {
  event.preventDefault();

  const message = ui.chatInput.value.trim();
  if (!message) {
    return;
  }

  addChatMessage("user", message);
  ui.chatInput.value = "";

  if (!appState.apiKey) {
    addChatMessage("assistant", "Add your Groq key in Groq Setup so I can respond.");
    return;
  }

  ui.chatSendBtn.disabled = true;

  try {
    const chatMessages = [
      {
        role: "system",
        content: buildChatSystemPrompt()
      },
      ...appState.chatHistory.slice(-10),
      {
        role: "user",
        content: message
      }
    ];

    const reply = await callGroq(chatMessages, {
      temperature: 0.65,
      maxTokens: 700
    });

    appState.chatHistory.push({ role: "user", content: message });
    appState.chatHistory.push({ role: "assistant", content: reply });
    addChatMessage("assistant", reply);
  } catch (error) {
    addChatMessage("assistant", "I could not reach Groq right now. " + error.message);
  } finally {
    ui.chatSendBtn.disabled = false;
  }
}

function buildChatSystemPrompt() {
  const topic = appState.topic || "Not selected yet";
  const mode = MODE_LABELS[appState.mode] || MODE_LABELS.mcq;

  return [
    "You are Study Copilot inside QuizForge mobile app.",
    "Keep responses short, clear, and practical.",
    "Offer hints first, then deeper explanation.",
    "Current topic: " + topic,
    "Current mode: " + mode
  ].join("\n");
}

function addChatMessage(role, content) {
  const bubble = document.createElement("div");
  bubble.className = "message " + role;
  bubble.textContent = content;
  ui.chatMessages.appendChild(bubble);
  ui.chatMessages.scrollTop = ui.chatMessages.scrollHeight;
}

async function callGroq(messages, config = {}) {
  const response = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + appState.apiKey
    },
    body: JSON.stringify({
      model: appState.model || DEFAULT_MODEL,
      messages,
      temperature: config.temperature ?? 0.5,
      max_tokens: config.maxTokens ?? 1200
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data && data.error && data.error.message ? data.error.message : "Unknown API error";
    throw new Error(message);
  }

  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) {
    throw new Error("Empty response from Groq");
  }

  return content.trim();
}

function parseJsonResponse(rawText) {
  const cleaned = rawText
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Invalid JSON response format");
  }

  const jsonSlice = cleaned.slice(firstBrace, lastBrace + 1);
  return JSON.parse(jsonSlice);
}

function buildFallbackPayload(mode, topic, count) {
  const fallbackCount = Number(count) || 6;

  if (mode === "fib") {
    return {
      lesson: null,
      questions: Array.from({ length: fallbackCount }, (_, index) => {
        return {
          type: "fib",
          question: "(" + String(index + 1) + ") In " + topic + ", one core concept is ____.",
          answer: "fundamentals",
          explanation: "Revisit the fundamentals before adding complexity."
        };
      })
    };
  }

  if (mode === "learn") {
    return {
      lesson: normalizeLesson(null, topic),
      questions: Array.from({ length: fallbackCount }, (_, index) => {
        if (index % 2 === 0) {
          return {
            type: "mcq",
            question: "(" + String(index + 1) + ") Which action helps you learn " + topic + " faster?",
            options: [
              "Active recall practice",
              "Skipping foundational ideas",
              "Memorizing without understanding",
              "Avoiding feedback"
            ],
            answer: "Active recall practice",
            explanation: "Active recall improves retention and understanding."
          };
        }

        return {
          type: "fib",
          question: "(" + String(index + 1) + ") Effective study includes frequent ____.",
          answer: "review",
          explanation: "Spaced review helps move ideas into long-term memory."
        };
      })
    };
  }

  return {
    lesson: null,
    questions: Array.from({ length: fallbackCount }, (_, index) => {
      return {
        type: "mcq",
        question: "(" + String(index + 1) + ") Which statement is most accurate about " + topic + "?",
        options: [
          topic + " builds from core principles",
          topic + " has no practical use",
          topic + " cannot be learned with practice",
          topic + " has only one rigid method"
        ],
        answer: topic + " builds from core principles",
        explanation: "Mastering fundamentals makes advanced ideas easier."
      };
    })
  };
}
