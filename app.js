// SAS Civil Accounts Preparation Master Database & Application Logic
// Enhanced for 39 Official Syllabus Topics & Subtopics across 8 Civil Accounts Papers

const SAS_CURRICULUM = (window.SAS_CURRICULUM && window.SAS_CURRICULUM.length > 0) 
  ? window.SAS_CURRICULUM 
  : [];

// App State
let currentPaperIndex = 0;
let currentSectionIndex = 0;
let currentChapterIndex = 0;
let activeTab = "content";
let speechUtterance = null;
let isSpeaking = false;
let isPaused = false;
let summaryMode = "chapter"; // "chapter" or "section"

// User Store (persisted to localStorage)

// Standalone Direct Gemini AI Caller (Used on Mobile Phone when PC / start_app.py is offline)
const GEMINI_DIRECT_KEY = localStorage.getItem("sas_gemini_api_key") || 
  atob("QVEuQWI4Uk42SkJFRHRfMzFRcDFENmdOR2R4cHloLWpMNkhGbkZnbTVuUHBhclctUDM2Q3c=");

// Detect if running on GitHub Pages / any cloud host (no local Python backend available)
const IS_CLOUD_HOSTED = !window.location.hostname.includes("localhost") && 
                         !window.location.hostname.includes("127.0.0.1") &&
                         !/^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname);
async function callDirectGeminiAPI(prompt, systemInstruction = "") {
  const candidateModels = ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite"];
  let lastError = null;

  for (const model of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_DIRECT_KEY}`;
      const payload = {
        contents: [{ parts: [{ text: prompt }] }]
      };
      if (systemInstruction) {
        payload.systemInstruction = { parts: [{ text: systemInstruction }] };
      }
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
        return data.candidates[0].content.parts[0].text;
      }
      if (data.error) {
        lastError = new Error(data.error.message || `Error from ${model}`);
        continue;
      }
    } catch (err) {
      lastError = err;
      continue;
    }
  }

  throw lastError || new Error("Failed to connect to Gemini AI service.");
}

let userStore = {
  status: {},
  chapterStatus: {},
  notes: {},
  checklist: {},
  aiSummaries: {},
  aiCrux: {},
  textEditions: {}
};

// DOM Elements
const papersListEl = document.getElementById("papersList");
const breadcrumbsEl = document.getElementById("breadcrumbs");
const sectionHeadingEl = document.getElementById("sectionHeading");
const weightagePillEl = document.getElementById("weightagePill");
const statusSelectEl = document.getElementById("statusSelect");
const wholeContentEl = document.getElementById("wholeContent");
const cruxContentEl = document.getElementById("cruxContent");
const summaryContentEl = document.getElementById("summaryContent");
const textEditionInputEl = document.getElementById("textEditionInput");
const whatToCoverChecklistEl = document.getElementById("whatToCoverChecklist");
const coverageProgressBadgeEl = document.getElementById("coverageProgressBadge");
const flashcardsListEl = document.getElementById("flashcardsList");
const filesRefListEl = document.getElementById("filesRefList");
const overallProgressPctEl = document.getElementById("overallProgressPct");
const overallProgressBarEl = document.getElementById("overallProgressBar");
const searchInputEl = document.getElementById("searchInput");
const tutorChatBoxEl = document.getElementById("tutorChatBox");
const tutorInputEl = document.getElementById("tutorInput");
const editionStatusIndicatorEl = document.getElementById("editionStatusIndicator");

// Markdown Formatter
function formatMarkdown(text) {
  if (!text) return "";
  let md = text.replace(/\r\n/g, "\n");
  
  // Code blocks
  md = md.replace(/```([a-z]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code>${code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>`;
  });
  
  // Headers
  md = md.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
  md = md.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  md = md.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  md = md.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  // Alerts
  md = md.replace(/^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\] (.*$)/gim, (match, type, content) => {
    return `<blockquote class="alert-box ${type.toLowerCase()}"><strong>${type}:</strong> ${content}</blockquote>`;
  });
  md = md.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');
  
  // Bold & Italic & Inline Code
  md = md.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  md = md.replace(/\*(.*?)\*/g, '<em>$1</em>');
  md = md.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Tables
  if (md.includes("|")) {
    md = md.replace(/^\|(.+)\|$/gim, (match, row) => {
      const cells = row.split("|").map(c => c.trim()).filter(c => c);
      if (cells.some(c => c.startsWith("---") || c.startsWith(":---"))) {
        return "";
      }
      return `<tr>${cells.map(c => `<td>${c}</td>`).join("")}</tr>`;
    });
    md = md.replace(/(<tr>.+<\/tr>\s*)+/g, '<table class="study-table" border="1" cellpadding="6" style="border-collapse: collapse; margin: 14px 0; width: 100%; border-color: var(--border);">$0</table>');
  }

  // Lists
  md = md.replace(/^[-*] (.*$)/gim, '<ul><li>$1</li></ul>');
  md = md.replace(/<\/ul>\s*<ul>/g, '');
  md = md.replace(/^\d+\.\s+(.*$)/gim, '<ol><li>$1</li></ol>');
  md = md.replace(/<\/ol>\s*<ol>/g, '');

  // Paragraphs
  const paragraphs = md.split(/\n\n+/);
  return paragraphs.map(p => {
    p = p.trim();
    if (!p) return "";
    if (p.startsWith("<h") || p.startsWith("<ul") || p.startsWith("<ol") || p.startsWith("<pre") || p.startsWith("<blockquote") || p.startsWith("<table")) {
      return p;
    }
    return `<p>${p.replace(/\n/g, "<br>")}</p>`;
  }).join("");
}

// App Initialization
function initApp() {
  loadUserProgress();
  initCountdown();
  renderPapersNav();
  loadCurrentSection();
  initSpeechSynthesis();
  initSearch();
  initKeyboardNav();
  updateProgressUI();
}

// 6-Month Countdown
function initCountdown() {
  const countdownEl = document.getElementById("countdownTimer");
  if (!countdownEl) return;
  
  let targetTimestamp = localStorage.getItem("sas_exam_target_date");
  if (!targetTimestamp) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 180);
    targetTimestamp = targetDate.getTime();
    localStorage.setItem("sas_exam_target_date", targetTimestamp);
  }
  
  function updateTimer() {
    const now = new Date().getTime();
    const diff = targetTimestamp - now;
    if (diff <= 0) {
      countdownEl.textContent = "Exam Target Reached!";
      return;
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    countdownEl.textContent = `${days}d ${hours}h Remaining`;
  }
  updateTimer();
  setInterval(updateTimer, 60000);
}

// Keyboard Navigation (Left / Right Arrow)
function initKeyboardNav() {
  window.addEventListener("keydown", (e) => {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) {
      return;
    }
    if (e.key === "ArrowLeft") {
      navigateChapter(-1);
    } else if (e.key === "ArrowRight") {
      navigateChapter(1);
    }
  });
}

// Render Sidebar Navigation with Categorized Topics and Subtopics
function renderPapersNav() {
  papersListEl.innerHTML = "";
  
  let currentGroup = "";
  SAS_CURRICULUM.forEach((paper, pIdx) => {
    if (paper.group !== currentGroup) {
      currentGroup = paper.group;
      const groupHeading = document.createElement("div");
      groupHeading.className = "paper-group-title";
      groupHeading.textContent = currentGroup;
      papersListEl.appendChild(groupHeading);
    }

    const accordion = document.createElement("div");
    accordion.className = "paper-accordion";

    const paperBtn = document.createElement("button");
    paperBtn.className = `paper-btn ${pIdx === currentPaperIndex ? "active" : ""}`;
    paperBtn.innerHTML = `
      <div style="display: flex; align-items: center; overflow: hidden;">
        <span class="paper-tag">${paper.paperCode}</span>
        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${paper.paperTitle}</span>
      </div>
      <span style="font-size: 0.75rem; flex-shrink: 0; margin-left: 4px;">${pIdx === currentPaperIndex ? "▼" : "▶"}</span>
    `;

    const sectionsList = document.createElement("div");
    sectionsList.className = `sections-list ${pIdx === currentPaperIndex ? "open" : ""}`;

    let lastCategory = "";

    paper.sections.forEach((sec, sIdx) => {
      // Grouping logic strictly matching syllabus_complete.pdf (Civil Accounts)
      let categoryHeader = "";
      const code = sec.topicCode || "";
      const pCode = paper.paperCode || "";

      if (pCode === "PC-3") {
        if (code.includes("Theory")) {
          categoryHeader = "Part A: Information Technology (Theory - 60 Marks)";
        } else if (code.includes("Practical")) {
          categoryHeader = "Part B: Practical Examination (40 Marks)";
        }
      }

      if (categoryHeader && categoryHeader !== lastCategory) {
        lastCategory = categoryHeader;
        const subHead = document.createElement("div");
        subHead.className = "sidebar-subheading";
        subHead.textContent = categoryHeader;
        sectionsList.appendChild(subHead);
      }

      const secItem = document.createElement("div");
      secItem.className = `section-item ${pIdx === currentPaperIndex && sIdx === currentSectionIndex ? "active" : ""}`;
      
      const status = getSectionStatus(sec.id);
      const dotClass = status === "completed" ? "completed" : status === "in-progress" ? "in-progress" : status === "revision" ? "revision" : "";

      const shortBadge = sec.topicCode ? sec.topicCode.replace("Subtopic ", "Sub ").replace("Topic ", "T") : `T${sIdx+1}`;

      secItem.innerHTML = `
        <div style="display: flex; align-items: center; overflow: hidden; gap: 4px;">
          <span class="subtopic-badge">${shortBadge}</span>
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${sec.title}">${sec.title}</span>
        </div>
        <span class="status-dot ${dotClass}"></span>
      `;

      secItem.onclick = () => {
        currentPaperIndex = pIdx;
        currentSectionIndex = sIdx;
        currentChapterIndex = 0;
        stopSpeech();
        renderPapersNav();
        loadCurrentSection();
        // Shift view to Whole Content tab and scroll to content
        switchTab('content');
        const contentArea = document.getElementById('panel_content') || document.getElementById('wholeContent');
        if (contentArea) {
          contentArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        // Auto-close mobile drawer on selection
        const sb = document.querySelector('.sidebar');
        const bd = document.getElementById('sidebarBackdrop');
        if (sb && sb.classList.contains('mobile-open')) {
          sb.classList.remove('mobile-open');
          if (bd) bd.classList.remove('active');
        }
      };

      sectionsList.appendChild(secItem);
    });

    paperBtn.onclick = () => {
      if (currentPaperIndex === pIdx) {
        sectionsList.classList.toggle("open");
      } else {
        currentPaperIndex = pIdx;
        currentSectionIndex = 0;
        currentChapterIndex = 0;
        stopSpeech();
        renderPapersNav();
        loadCurrentSection();
      }
    };

    accordion.appendChild(paperBtn);
    accordion.appendChild(sectionsList);
    papersListEl.appendChild(accordion);
  });
}

// Chapter Navigation Functions
function navigateChapter(delta) {
  const paper = SAS_CURRICULUM[currentPaperIndex];
  const section = paper.sections[currentSectionIndex];
  const chapters = section.chapters || [];
  if (chapters.length === 0) return;

  const targetIdx = currentChapterIndex + delta;
  if (targetIdx >= 0 && targetIdx < chapters.length) {
    currentChapterIndex = targetIdx;
    stopSpeech();
    renderChapterNavigation();
    loadCurrentChapter();
    switchTab('content');
    const contentArea = document.getElementById('panel_content') || document.getElementById('wholeContent');
    if (contentArea) {
      contentArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } else if (targetIdx >= chapters.length) {
    if (currentSectionIndex < paper.sections.length - 1) {
      currentSectionIndex++;
      currentChapterIndex = 0;
      stopSpeech();
      renderPapersNav();
      loadCurrentSection();
    } else if (currentPaperIndex < SAS_CURRICULUM.length - 1) {
      currentPaperIndex++;
      currentSectionIndex = 0;
      currentChapterIndex = 0;
      stopSpeech();
      renderPapersNav();
      loadCurrentSection();
    }
  } else if (targetIdx < 0) {
    if (currentSectionIndex > 0) {
      currentSectionIndex--;
      const prevSec = paper.sections[currentSectionIndex];
      currentChapterIndex = (prevSec.chapters || []).length - 1;
      stopSpeech();
      renderPapersNav();
      loadCurrentSection();
    }
  }
}

function selectChapter(idx) {
  currentChapterIndex = idx;
  stopSpeech();
  renderChapterNavigation();
  loadCurrentChapter();
  // Ensure the page shifts to the Whole Content tab and scrolls smoothly into view
  switchTab('content');
  const contentArea = document.getElementById('panel_content') || document.getElementById('wholeContent');
  if (contentArea) {
    contentArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderChapterNavigation() {
  const paper = SAS_CURRICULUM[currentPaperIndex];
  const section = paper.sections[currentSectionIndex];
  const chapters = section.chapters || [];
  if (chapters.length === 0) return;

  if (currentChapterIndex >= chapters.length) currentChapterIndex = 0;
  const currentChapter = chapters[currentChapterIndex];

  const badgeEl = document.getElementById("chapterNumberBadge");
  const headerEl = document.getElementById("chapterTitleHeader");
  if (badgeEl) badgeEl.textContent = `${currentChapterIndex + 1} of ${chapters.length}`;
  if (headerEl) headerEl.textContent = currentChapter.title;

  const pillsListEl = document.getElementById("chaptersTabList");
  if (pillsListEl) {
    pillsListEl.innerHTML = "";
    chapters.forEach((ch, idx) => {
      const btn = document.createElement("button");
      const isCompleted = !!userStore.chapterStatus[`${section.id}_${ch.id}`];
      btn.className = `chapter-pill-btn ${idx === currentChapterIndex ? "active" : ""} ${isCompleted ? "completed" : ""}`;
      const displayTitle = ch.title.replace(/^Chapter \d+:\s*/, "");
      btn.innerHTML = `<span>${displayTitle}</span>`;
      btn.title = ch.title;
      btn.onclick = () => selectChapter(idx);
      pillsListEl.appendChild(btn);
    });
  }

  const btnPrev = document.getElementById("btnPrevChapterTop");
  if (btnPrev) {
    btnPrev.disabled = currentChapterIndex === 0 && currentSectionIndex === 0 && currentPaperIndex === 0;
  }
}

function loadCurrentSection() {
  const paper = SAS_CURRICULUM[currentPaperIndex];
  const section = paper.sections[currentSectionIndex];

  breadcrumbsEl.textContent = `${paper.paperCode} • ${paper.paperTitle} (${paper.group})`;
  sectionHeadingEl.textContent = section.syllabusHeading || ((section.topicCode ? section.topicCode + ": " : "") + section.title);
  weightagePillEl.textContent = section.weightage;

  statusSelectEl.value = getSectionStatus(section.id);

  renderChapterNavigation();
  loadCurrentChapter();
  renderChecklist(section);

  flashcardsListEl.innerHTML = "";
  (section.flashcards || []).forEach(fc => {
    const card = document.createElement("div");
    card.className = "flashcard";
    card.innerHTML = `
      <div class="flashcard-title">❓ ${fc.q}</div>
      <div class="flashcard-body">💡 <strong>Codal Answer:</strong> ${fc.a}</div>
    `;
    flashcardsListEl.appendChild(card);
  });

  const aiQuizContainer = document.getElementById("aiQuizContainer");
  if (aiQuizContainer) aiQuizContainer.style.display = "none";

  // Combine and deduplicate local workspace files
  const combinedFiles = Array.from(new Set([...(section.localFiles || []), ...(paper.localFiles || [])]));
  filesRefListEl.innerHTML = "";
  combinedFiles.forEach(file => {
    const li = document.createElement("li");
    li.className = "file-ref-item";
    const encodedPath = encodeURI("file:///f:/AG office gwalior/SAS EXAM/" + file);
    li.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span>📄</span>
        <a href="${encodedPath}" target="_blank" style="color: var(--primary); text-decoration: none; font-weight: 600;">
          ${file}
        </a>
      </div>
      <span class="file-ref-badge">In Local Workspace</span>
    `;
    filesRefListEl.appendChild(li);
  });

  resetTutorChat(paper, section);
}

function loadCurrentChapter() {
  const paper = SAS_CURRICULUM[currentPaperIndex];
  const section = paper.sections[currentSectionIndex];
  const chapters = section.chapters || [];
  if (chapters.length === 0) return;

  if (currentChapterIndex >= chapters.length) currentChapterIndex = 0;
  const currentChapter = chapters[currentChapterIndex];
  const effChapterKey = `${section.id}_${currentChapter.id}`;

  const isCompleted = !!userStore.chapterStatus[effChapterKey];
  const prevChapter = currentChapterIndex > 0 ? chapters[currentChapterIndex - 1] : null;
  const nextChapter = currentChapterIndex < chapters.length - 1 ? chapters[currentChapterIndex + 1] : null;

  wholeContentEl.innerHTML = `
    <div class="chapter-content-box">
      <div class="card-toolbar" style="margin-bottom: 16px;">
        <div>
          <span class="chapter-stepper-tag">Syllabus Subtopic ${currentChapterIndex + 1} of ${chapters.length}</span>
          <h3 style="margin-top: 4px;">${currentChapter.title}</h3>
        </div>
        <div class="card-actions">
          <button class="btn-ai-pill" onclick="triggerAISummary()">✨ Summarize Chapter</button>
          <button class="btn-ai-pill" style="background: linear-gradient(135deg, #2563eb, #38bdf8);" onclick="triggerAICrux()">📘 Chapter Crux</button>
          <button class="btn-save-pill" onclick="openTextEdition()">✍️ Chapter Notes</button>
          <button class="btn-small" onclick="playSpeech()">🔊 Listen</button>
        </div>
      </div>
      
      <div class="formatted-study-content">
        ${formatMarkdown(currentChapter.content)}
      </div>

      <div class="chapter-bottom-nav">
        <button class="btn-chapter-bottom" onclick="navigateChapter(-1)" ${!prevChapter && currentSectionIndex === 0 ? "disabled style='opacity:0.4;'" : ""}>
          ◀ ${prevChapter ? prevChapter.title.slice(0, 32) + '...' : 'Previous Section'}
        </button>
        
        <div class="chapter-completion-toggle">
          <label style="cursor: pointer; display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="chapterCompletedCheckbox" ${isCompleted ? 'checked' : ''} onchange="toggleChapterCompleted(this.checked)" style="width: 18px; height: 18px; cursor: pointer;">
            <span style="font-weight: 600; color: var(--text-main);">Mark Chapter as Mastered</span>
          </label>
        </div>

        <button class="btn-chapter-bottom" onclick="navigateChapter(1)">
          ${nextChapter ? nextChapter.title.slice(0, 32) + '...' : 'Next Section'} ▶
        </button>
      </div>
    </div>
  `;

  loadSummaryForChapter(currentChapter);
  loadCruxForChapter(currentChapter);
  loadTextEditionForChapter(currentChapter);
  loadChapterQuiz();
}

function loadSummaryForChapter(chapter) {
  const paper = SAS_CURRICULUM[currentPaperIndex];
  const section = paper.sections[currentSectionIndex];
  const effKey = `${section.id}_${chapter.id}`;

  const cached = userStore.aiSummaries[effKey];
  if (cached) {
    summaryContentEl.innerHTML = `
      <div class="alert-box success">
        <strong>✨ AI Summary for ${chapter.title} (Cached):</strong>
      </div>
    ` + formatMarkdown(cached);
  } else {
    summaryContentEl.innerHTML = `
      <div class="alert-box success">
        <strong>⚡ High-Yield Key Points: ${chapter.title}</strong>
        <p style="margin-top: 6px;">${chapter.summary}</p>
      </div>
      <p style="color: var(--text-muted); font-size: 0.88rem; margin-top: 12px;">
        Click <strong>✨ Regenerate with Gemini AI</strong> above to generate an in-depth AI executive summary for this specific chapter.
      </p>
    `;
  }
}

function loadCruxForChapter(chapter) {
  const paper = SAS_CURRICULUM[currentPaperIndex];
  const section = paper.sections[currentSectionIndex];
  const effKey = `${section.id}_${chapter.id}`;

  const cached = userStore.aiCrux[effKey];
  if (cached) {
    cruxContentEl.innerHTML = `
      <div class="alert-box info">
        <strong>✨ AI Crux for ${chapter.title} (Cached):</strong>
      </div>
    ` + formatMarkdown(cached);
  } else {
    cruxContentEl.innerHTML = `
      <div class="alert-box info">
        <strong>📘 Codal Crux: ${chapter.title}</strong>
        <p style="margin-top: 6px;">${chapter.crux}</p>
      </div>
      <div class="formatted-study-content" style="margin-top: 14px;">
        ${formatMarkdown(section.cruxMaterial)}
      </div>
    `;
  }
}

function loadTextEditionForChapter(chapter) {
  const section = SAS_CURRICULUM[currentPaperIndex].sections[currentSectionIndex];
  const effKey = `${section.id}_${chapter.id}`;

  editionStatusIndicatorEl.textContent = "Loading chapter notes...";
  if (userStore.textEditions[effKey]) {
    textEditionInputEl.value = userStore.textEditions[effKey];
    editionStatusIndicatorEl.textContent = "Loaded from Local Storage";
    return;
  }

  fetch(`/api/load-text-edition?sectionId=${section.id}&chapterId=${chapter.id}`)
    .then(r => r.json())
    .then(data => {
      if (data.success && data.content) {
        textEditionInputEl.value = data.content;
        userStore.textEditions[effKey] = data.content;
        editionStatusIndicatorEl.textContent = "Loaded from Server Cache";
      } else {
        const defaultText = `# ${chapter.title}\n\n## 1. Statutory Provisions\n${chapter.crux}\n\n## 2. Personal Notes & Mnemonics\n- Add your exam points here...`;
        textEditionInputEl.value = defaultText;
        editionStatusIndicatorEl.textContent = "Template Ready";
      }
    })
    .catch(() => {
      textEditionInputEl.value = `# ${chapter.title}\n\n${chapter.content}`;
      editionStatusIndicatorEl.textContent = "Ready";
    });
}

function toggleChapterCompleted(isCompleted) {
  const section = SAS_CURRICULUM[currentPaperIndex].sections[currentSectionIndex];
  const chapter = section.chapters[currentChapterIndex];
  const effKey = `${section.id}_${chapter.id}`;

  userStore.chapterStatus[effKey] = isCompleted;
  saveUserProgress();
  renderChapterNavigation();
}

function triggerAISummary() {
  switchTab('ai_coach');
  switchAiSubTab('summary');
  const section = SAS_CURRICULUM[currentPaperIndex].sections[currentSectionIndex];
  const chapter = section.chapters[currentChapterIndex];
  const effKey = `${section.id}_${chapter.id}`;

  if (!userStore.aiSummaries[effKey]) {
    generateAISummary(false);
  }
}

function triggerAICrux() {
  switchTab('ai_coach');
  switchAiSubTab('crux');
  const section = SAS_CURRICULUM[currentPaperIndex].sections[currentSectionIndex];
  const chapter = section.chapters[currentChapterIndex];
  const effKey = `${section.id}_${chapter.id}`;

  if (!userStore.aiCrux[effKey]) {
    generateAICrux(false);
  }
}

function openTextEdition() {
  switchTab('notes');
  switchNotesSubTab('editor');
  textEditionInputEl.focus();
}

async function generateAISummary(forceRefresh = false) {
  const paper = SAS_CURRICULUM[currentPaperIndex];
  const section = paper.sections[currentSectionIndex];
  const chapter = section.chapters[currentChapterIndex];
  const effKey = `${section.id}_${chapter.id}`;
  const loadingEl = document.getElementById("summaryLoading");

  // Return cached result if available
  if (!forceRefresh && userStore.aiSummaries[effKey]) {
    summaryContentEl.innerHTML = `<div class="alert-box success"><strong>✨ AI Summary for ${chapter.title} (Cached):</strong></div>` + formatMarkdown(userStore.aiSummaries[effKey]);
    return;
  }

  loadingEl.style.display = "flex";
  summaryContentEl.innerHTML = "";

  // On GitHub Pages / cloud: call Gemini directly without local Python backend
  if (IS_CLOUD_HOSTED) {
    try {
      const sysPrompt = "You are an expert exam mentor and senior audit officer specializing in the Indian Audit & Accounts Department (IA&AD) SAS Examination for Civil Accounts. Provide an authoritative, high-yield, structured executive summary designed for rapid exam revision.";
      const userPrompt = `Generate an exam-focused, high-yield summary for SAS Paper ${paper.paperCode} - ${section.title} (${chapter.title}):\n\n${chapter.content.slice(0, 8000)}`;
      const result = await callDirectGeminiAPI(userPrompt, sysPrompt);
      loadingEl.style.display = "none";
      userStore.aiSummaries[effKey] = result;
      saveUserProgress();
      summaryContentEl.innerHTML = `<div class="alert-box success"><strong>✨ Gemini AI Summary for ${chapter.title}:</strong></div>` + formatMarkdown(result);
    } catch(err) {
      loadingEl.style.display = "none";
      summaryContentEl.innerHTML = `<div class="alert-box warning"><strong>⚠️ Error:</strong> ${err.message || "Please check your internet connection."}</div>`;
    }
    return;
  }

  // On local PC: use Python backend
  try {
    const res = await fetch("/api/generate-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paperCode: paper.paperCode,
        sectionId: section.id,
        chapterId: chapter.id,
        title: section.title,
        chapterTitle: chapter.title,
        content: chapter.content,
        whatToCover: section.whatToCover,
        forceRefresh: forceRefresh
      })
    });
    const data = await res.json();
    loadingEl.style.display = "none";
    if (data.success && data.result) {
      userStore.aiSummaries[effKey] = data.result;
      saveUserProgress();
      summaryContentEl.innerHTML = `
        <div class="alert-box success">
          <strong>✨ Gemini AI Summary for ${chapter.title} ${data.cached ? "(Instant from Cache)" : "(Freshly Generated)"}:</strong>
        </div>
      ` + formatMarkdown(data.result);
    } else {
      alert("AI Summary generation notice: " + (data.error || "Unable to reach Gemini API."));
    }
  } catch(err) {
    loadingEl.style.display = "none";
    summaryContentEl.innerHTML = `<div class="alert-box warning"><strong>⚠️ Backend unreachable:</strong> Please ensure start_app.py is running.</div>`;
  }
}

async function generateAICrux(forceRefresh = false) {
  const paper = SAS_CURRICULUM[currentPaperIndex];
  const section = paper.sections[currentSectionIndex];
  const chapter = section.chapters[currentChapterIndex];
  const effKey = `${section.id}_${chapter.id}`;
  const loadingEl = document.getElementById("cruxLoading");

  if (!forceRefresh && userStore.aiCrux[effKey]) {
    cruxContentEl.innerHTML = `<div class="alert-box info"><strong>🎯 AI Codal Crux for ${chapter.title} (Cached):</strong></div>` + formatMarkdown(userStore.aiCrux[effKey]);
    return;
  }

  loadingEl.style.display = "flex";
  cruxContentEl.innerHTML = "";

  if (IS_CLOUD_HOSTED) {
    try {
      const sysPrompt = "You are a senior director of audit and chief examiner for the Subordinate Audit/Accounts Service (SAS) Civil Accounts examination. Extract the absolute codal crux, vital thresholds, time limits, and memory hooks.";
      const userPrompt = `Extract the vital examination crux, time limits, and thresholds for SAS Paper ${paper.paperCode} - ${section.title} (${chapter.title}):\n\n${chapter.content.slice(0, 8000)}`;
      const result = await callDirectGeminiAPI(userPrompt, sysPrompt);
      loadingEl.style.display = "none";
      userStore.aiCrux[effKey] = result;
      saveUserProgress();
      cruxContentEl.innerHTML = `<div class="alert-box info"><strong>🎯 Gemini AI Codal Crux for ${chapter.title}:</strong></div>` + formatMarkdown(result);
    } catch(err) {
      loadingEl.style.display = "none";
      cruxContentEl.innerHTML = `<div class="alert-box warning"><strong>⚠️ Error:</strong> ${err.message || "Please check your internet connection."}</div>`;
    }
    return;
  }

  loadingEl.style.display = "flex";
  try {
    const res = await fetch("/api/generate-crux", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paperCode: paper.paperCode,
        sectionId: section.id,
        chapterId: chapter.id,
        title: section.title,
        chapterTitle: chapter.title,
        content: chapter.content,
        whatToCover: section.whatToCover,
        forceRefresh: forceRefresh
      })
    });
    const data = await res.json();
    loadingEl.style.display = "none";
    if (data.success && data.result) {
      userStore.aiCrux[effKey] = data.result;
      saveUserProgress();
      cruxContentEl.innerHTML = `
        <div class="alert-box info">
          <strong>✨ Gemini AI Codal Crux for ${chapter.title} ${data.cached ? "(Instant from Cache)" : "(Freshly Generated)"}:</strong>
        </div>
      ` + formatMarkdown(data.result);
    } else {
      alert("AI Crux generation notice: " + (data.error || "Unable to reach Gemini API."));
    }
  } catch(err) {
    console.warn("Local backend unreachable, falling back to Direct Gemini API on phone...", err);
    try {
      const sysPrompt = "You are a senior director of audit and chief examiner for the Subordinate Audit/Accounts Service (SAS) Civil Accounts examination. Extract the absolute codal crux, vital thresholds, and memory hooks.";
      const userPrompt = `Extract the vital examination crux, time limits, and thresholds for SAS Paper ${paper.paperCode} - ${section.title} (${chapter.title}):\n\n${chapter.content.slice(0, 8000)}`;
      const directResult = await callDirectGeminiAPI(userPrompt, sysPrompt);
      loadingEl.style.display = "none";
      userStore.aiCrux[effKey] = directResult;
      saveUserProgress();
      cruxContentEl.innerHTML = `
        <div class="alert-box info">
          <strong>✨ Gemini AI Codal Crux for ${chapter.title} (Direct Mobile Cloud):</strong>
        </div>
      ` + formatMarkdown(directResult);
    } catch(directErr) {
      loadingEl.style.display = "none";
      console.error("Direct Gemini error:", directErr);
      alert("Unable to reach Gemini API. Please check internet connection.");
    }
  }
}

function saveTextEdition() {
  const section = SAS_CURRICULUM[currentPaperIndex].sections[currentSectionIndex];
  const chapter = section.chapters[currentChapterIndex];
  const effKey = `${section.id}_${chapter.id}`;
  const val = textEditionInputEl.value;

  userStore.textEditions[effKey] = val;
  saveUserProgress();

  editionStatusIndicatorEl.textContent = "Saving to server...";
  fetch("/api/save-text-edition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sectionId: section.id,
      chapterId: chapter.id,
      content: val
    })
  })
  .then(r => r.json())
  .then(d => {
    editionStatusIndicatorEl.textContent = "Saved to Server & Browser Storage";
    setTimeout(() => { editionStatusIndicatorEl.textContent = "Saved"; }, 3000);
  })
  .catch(() => {
    editionStatusIndicatorEl.textContent = "Saved to Browser Storage (Offline)";
  });
}

async function aiEnrichTextEdition() {
  const section = SAS_CURRICULUM[currentPaperIndex].sections[currentSectionIndex];
  const chapter = section.chapters[currentChapterIndex];
  const currentVal = textEditionInputEl.value;
  
  editionStatusIndicatorEl.textContent = "✨ Gemini AI is analyzing and adding exam points...";

  const doDirectEnrich = async () => {
    const prompt = `Review these chapter notes for SAS Paper ${SAS_CURRICULUM[currentPaperIndex].paperCode} (${section.title} - ${chapter.title}) and append: (1) 3 critical Rule/Codal numbers, (2) One practical audit trap or caveat, and (3) A 1-line memory mnemonic.\n\nNotes:\n` + currentVal;
    const res = await callDirectGeminiAPI(prompt, "You are an expert exam mentor for the IA&AD SAS Civil Accounts examination.");
    textEditionInputEl.value = currentVal + "\n\n### 🌟 AI Exam Enrichments & Statutory Citations\n" + res;
    saveTextEdition();
    editionStatusIndicatorEl.textContent = "Enriched & Saved!";
  };

  if (IS_CLOUD_HOSTED) {
    try { await doDirectEnrich(); } catch(e) { editionStatusIndicatorEl.textContent = "AI enrichment failed: " + (e.message || ""); }
    return;
  }

  try {
    const res = await fetch("/api/ask-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paperCode: SAS_CURRICULUM[currentPaperIndex].paperCode,
        title: `${section.title} - ${chapter.title}`,
        context: currentVal,
        question: "Please review these chapter notes and append: (1) 3 critical Rule / Codal numbers often tested, (2) One practical audit trap or caveat, and (3) A 1-line memory mnemonic."
      })
    });
    const d = await res.json();
    if (d.success && d.result) {
      textEditionInputEl.value = currentVal + "\n\n### 🌟 AI Exam Enrichments & Statutory Citations\n" + d.result;
      saveTextEdition();
      editionStatusIndicatorEl.textContent = "Enriched & Saved!";
    }
  } catch(e) {
    try { await doDirectEnrich(); } catch(err2) { editionStatusIndicatorEl.textContent = "AI enrichment failed."; }
  }
}

function insertFormatting(prefix, suffix) {
  const textarea = textEditionInputEl;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.substring(start, end);
  const replacement = prefix + selected + suffix;
  textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
  textarea.focus();
  textarea.setSelectionRange(start + prefix.length, end + prefix.length);
}

function exportTextEdition() {
  const section = SAS_CURRICULUM[currentPaperIndex].sections[currentSectionIndex];
  const chapter = section.chapters[currentChapterIndex];
  const content = textEditionInputEl.value;
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${section.id}_${chapter.id}_Notes.md`;
  a.click();
}

function renderChecklist(section) {
  const paper = SAS_CURRICULUM[currentPaperIndex];
  whatToCoverChecklistEl.innerHTML = "";
  if (!userStore.checklist[section.id]) {
    userStore.checklist[section.id] = {};
  }
  
  // 1. Official Prescribed Syllabus Box
  const syllabusBox = document.createElement("div");
  syllabusBox.className = "official-syllabus-box";
  syllabusBox.innerHTML = `
    <div class="official-syllabus-title">📜 Official Syllabus Prescribed (Verbatim)</div>
    <p class="official-syllabus-text">${section.syllabusText || 'Official syllabus guidelines for ' + section.title}</p>
  `;
  whatToCoverChecklistEl.appendChild(syllabusBox);

  // 2. Prescribed Reading Material & Reference Books
  const readingList = section.readingMaterial || paper.readingMaterial || [];
  if (readingList.length > 0) {
    const refBox = document.createElement("div");
    refBox.className = "reference-books-box";
    refBox.innerHTML = `
      <div class="reference-books-title">📚 Prescribed Books & Codal Rules (C&AG)</div>
      <ul class="reference-books-list">
        ${readingList.map(b => `<li class="reference-books-item">📖 ${b}</li>`).join('')}
      </ul>
    `;
    whatToCoverChecklistEl.appendChild(refBox);
  }

  // 3. Checklist Items
  const checklistHeader = document.createElement("div");
  checklistHeader.style.cssText = "font-weight: 700; color: var(--text-main); margin-bottom: 10px; font-size: 0.95rem;";
  checklistHeader.textContent = "✅ Key Competencies & Checklist Items to Master:";
  whatToCoverChecklistEl.appendChild(checklistHeader);

  let checkedCount = 0;
  (section.whatToCover || []).forEach((item, idx) => {
    const isChecked = !!userStore.checklist[section.id][idx];
    if (isChecked) checkedCount++;

    const itemDiv = document.createElement("div");
    itemDiv.className = `checklist-item ${isChecked ? "checked" : ""}`;
    itemDiv.innerHTML = `
      <input type="checkbox" class="checklist-checkbox" ${isChecked ? "checked" : ""}>
      <span class="checklist-text">${item}</span>
    `;

    const checkbox = itemDiv.querySelector(".checklist-checkbox");
    checkbox.onchange = (e) => {
      userStore.checklist[section.id][idx] = e.target.checked;
      saveUserProgress();
      renderChecklist(section);
    };

    itemDiv.onclick = (e) => {
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
        userStore.checklist[section.id][idx] = checkbox.checked;
        saveUserProgress();
        renderChecklist(section);
      }
    };

    whatToCoverChecklistEl.appendChild(itemDiv);
  });

  const total = (section.whatToCover || []).length;
  const pct = total > 0 ? Math.round((checkedCount / total) * 100) : 0;
  coverageProgressBadgeEl.textContent = `${pct}% Checked (${checkedCount}/${total})`;
}

function switchTab(tabId) {
  activeTab = tabId;
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.remove("active"));

  const targetBtn = document.getElementById(`tabBtn_${tabId}`);
  const targetPanel = document.getElementById(`panel_${tabId}`);
  if (targetBtn) targetBtn.classList.add("active");
  if (targetPanel) targetPanel.classList.add("active");
}

async function triggerAIQuiz() {
  switchTab('ai_coach');
  switchAiSubTab('cards');
  generateAIQuiz();
}

async function generateAIQuiz() {
  const paper = SAS_CURRICULUM[currentPaperIndex];
  const section = paper.sections[currentSectionIndex];
  const chapter = section.chapters[currentChapterIndex];
  const aiQuizContainer = document.getElementById("aiQuizContainer");
  const aiQuizContent = document.getElementById("aiQuizContent");

  aiQuizContainer.style.display = "block";
  aiQuizContent.innerHTML = "<p>✨ Gemini AI is generating 3 high-yield SAS Civil Accounts exam questions (MCQ + Case Study + Short Note)...</p>";

  const doDirectQuiz = async () => {
    const prompt = `Generate 3 high-yield SAS Civil Accounts exam questions for SAS Paper ${paper.paperCode} - ${section.title} (${chapter.title}): (1) MCQ with 4 options and explanation, (2) Practical Audit Scenario/Case Study with model answer, (3) Short Note question with model answer.\n\nContext:\n${chapter.content.slice(0, 8000)}`;
    const res = await callDirectGeminiAPI(prompt, "You are a senior director of audit and chief examiner for the IA&AD SAS Civil Accounts examination.");
    aiQuizContent.innerHTML = `<div class="alert-box success"><strong>✨ Gemini AI Practice Quiz:</strong></div>` + formatMarkdown(res);
  };

  if (IS_CLOUD_HOSTED) {
    try { await doDirectQuiz(); } catch(err) { aiQuizContent.innerHTML = `<p style="color: var(--danger);">Quiz failed: ${err.message || "Check internet connection."}</p>`; }
    return;
  }

  try {
    const res = await fetch("/api/generate-quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paperCode: paper.paperCode,
        title: `${section.title} - ${chapter.title}`,
        context: chapter.content
      })
    });
    const data = await res.json();
    if (data.success && data.result) {
      aiQuizContent.innerHTML = formatMarkdown(data.result);
    } else {
      aiQuizContent.innerHTML = `<p style="color: var(--danger);">Error generating quiz: ${data.error}</p>`;
    }
  } catch(err) {
    try { await doDirectQuiz(); } catch(err2) { aiQuizContent.innerHTML = `<p style="color: var(--danger);">Unable to generate quiz. Please check internet connection.</p>`; }
  }
}

function resetTutorChat(paper, section) {
  const currentTopic = paper && section ? `${paper.paperCode} • ${section.title}` : 'Universal Civil Accounts';
  tutorChatBoxEl.innerHTML = `
    <div class="chat-message ai-message">
      <div class="chat-avatar">🤖</div>
      <div class="chat-bubble">
        <strong>Hello! I am your Universal SAS Civil Accounts AI Mentor.</strong>
        <p>You can ask me <strong>ANY query from any part of the 8 Civil Accounts papers</strong> (PC-1, PC-2, PC-3, PC-4, PC-9, PC-11, PC-13, PC-15) — GFR 2017, CPWA Code, CCS Pension, FR/SR, Constitution, DPC Act, or Treasury/PFMS operations.</p>
        <span style="display: inline-block; margin-top: 6px; font-size: 0.8rem; color: #38bdf8; background: rgba(56, 189, 248, 0.1); padding: 3px 8px; border-radius: 4px;">
          📍 Currently exploring: ${currentTopic}
        </span>
      </div>
    </div>
  `;
}

function clearTutorChat() {
  const paper = SAS_CURRICULUM[currentPaperIndex];
  const section = paper.sections[currentSectionIndex];
  resetTutorChat(paper, section);
}

async // Global Search across entire Civil Accounts syllabus
function findGlobalSyllabusContext(query) {
  const qTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  let matchedMatches = [];

  SAS_CURRICULUM.forEach(paper => {
    (paper.sections || []).forEach(sec => {
      (sec.chapters || []).forEach(ch => {
        const text = `${paper.paperCode} ${sec.title} ${ch.title} ${ch.gist || ''} ${ch.crux || ''} ${ch.content || ''}`.toLowerCase();
        let score = 0;
        qTerms.forEach(term => {
          if (text.includes(term)) score += 1;
        });
        if (score > 0) {
          matchedMatches.push({
            score,
            label: `${paper.paperCode} - ${sec.title} > ${ch.title}`,
            snippet: (ch.crux || ch.gist || ch.content || '').slice(0, 800)
          });
        }
      });
    });
  });

  matchedMatches.sort((a, b) => b.score - a.score);
  return matchedMatches.slice(0, 4);
}

async function sendTutorQuestion() {
  const q = tutorInputEl.value.trim();
  if (!q) return;
  tutorInputEl.value = "";

  const paper = SAS_CURRICULUM[currentPaperIndex];
  const section = paper ? paper.sections[currentSectionIndex] : null;
  const chapter = section && section.chapters ? section.chapters[currentChapterIndex] : null;

  const userMsg = document.createElement("div");
  userMsg.className = "chat-message user-message";
  userMsg.innerHTML = `<div class="chat-avatar">👤</div><div class="chat-bubble">${q}</div>`;
  tutorChatBoxEl.appendChild(userMsg);

  const aiMsg = document.createElement("div");
  aiMsg.className = "chat-message ai-message";
  aiMsg.innerHTML = `<div class="chat-avatar">🤖</div><div class="chat-bubble"><em>Searching complete Civil Accounts syllabus & analyzing codal rules...</em></div>`;
  tutorChatBoxEl.appendChild(aiMsg);
  tutorChatBoxEl.scrollTop = tutorChatBoxEl.scrollHeight;

  const doDirectChat = async () => {
    const globalContexts = findGlobalSyllabusContext(q);
    let contextText = "";
    if (globalContexts.length > 0) {
      contextText += "\n--- MATCHED SYLLABUS REFERENCES ---\n";
      globalContexts.forEach(c => {
        contextText += `[${c.label}]:\n${c.snippet}\n\n`;
      });
    }
    if (chapter) {
      contextText += `\n--- CURRENTLY ACTIVE TOPIC: ${paper.paperCode} - ${section.title} (${chapter.title}) ---\n${(chapter.content || '').slice(0, 3000)}`;
    }

    const prompt = `User Query: "${q}"\n\nRelevant Syllabus & Codal Information:${contextText}`;
    const sysPrompt = "You are an authoritative, universal AI Exam Mentor for the Indian Audit & Accounts Department (IA&AD) Subordinate Accounts Service (SAS) Examination (Civil Accounts Branch). Answer the user's question clearly and accurately, regardless of which part of the syllabus it touches (PC-1, PC-2, PC-3, PC-4, PC-9, PC-11, PC-13, or PC-15). Quote exact rule numbers (e.g. GFR 2017 Rule 149, CPWA Code, FR 22, CCS Leave Rules 1972, DPC Act 1971), article numbers of the Constitution, and practical exam advice.";

    const res = await callDirectGeminiAPI(prompt, sysPrompt);
    aiMsg.querySelector(".chat-bubble").innerHTML = formatMarkdown(res);
    tutorChatBoxEl.scrollTop = tutorChatBoxEl.scrollHeight;
  };

  if (IS_CLOUD_HOSTED) {
    try {
      await doDirectChat();
    } catch(err) {
      aiMsg.querySelector(".chat-bubble").innerHTML = `<span style="color: var(--danger);">AI Mentor error: ${err.message || "Check internet connection."}</span>`;
      tutorChatBoxEl.scrollTop = tutorChatBoxEl.scrollHeight;
    }
    return;
  }

  try {
    const res = await fetch("/api/ask-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paperCode: paper.paperCode,
        title: `${section.title} - ${chapter ? chapter.title : ''}`,
        question: q,
        context: chapter ? chapter.content : ''
      })
    });
    const d = await res.json();
    if (d.success && d.result) {
      aiMsg.querySelector(".chat-bubble").innerHTML = formatMarkdown(d.result);
    } else {
      await doDirectChat();
    }
  } catch(err) {
    try {
      await doDirectChat();
    } catch(err2) {
      aiMsg.querySelector(".chat-bubble").innerHTML = `<span style="color: var(--danger);">AI Mentor error: ${err2.message || "Please check internet connection."}</span>`;
    }
  }
  tutorChatBoxEl.scrollTop = tutorChatBoxEl.scrollHeight;
}

function initSpeechSynthesis() {
  if (!('speechSynthesis' in window)) {
    const btn = document.getElementById("btnPlayAudio");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Audio Not Supported";
    }
    return;
  }

  function populateVoices() {
    const voiceSelect = document.getElementById("voiceSelect");
    if (!voiceSelect) return;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return;
    const prevVal = voiceSelect.value;
    voiceSelect.innerHTML = "";
    const enVoices = voices.filter(v => v.lang.startsWith("en"));
    const displayVoices = enVoices.length > 0 ? enVoices : voices;
    displayVoices.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = voices.indexOf(v);
      opt.textContent = `${v.name} (${v.lang})`;
      if (v.lang === "en-IN") opt.selected = true;
      voiceSelect.appendChild(opt);
    });
    if (prevVal && voiceSelect.querySelector(`[value="${prevVal}"]`)) {
      voiceSelect.value = prevVal;
    }
  }

  populateVoices();
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populateVoices;
  }
  // Mobile browsers load voices async - retry
  setTimeout(populateVoices, 300);
  setTimeout(populateVoices, 1000);
  setTimeout(populateVoices, 2500);
}

function readActiveText(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const rawText = el.innerText || el.textContent;
  playSpeechText(rawText);
}

function playSpeech() {
  if (isPaused) {
    window.speechSynthesis.resume();
    isPaused = false;
    isSpeaking = true;
    updateAudioUI(true);
    return;
  }

  stopSpeech();

  const paper = SAS_CURRICULUM[currentPaperIndex];
  const section = paper.sections[currentSectionIndex];
  const chapter = section.chapters[currentChapterIndex];
  let textToRead = "";

  if (activeTab === "summary") {
    textToRead = `Summary for ${chapter.title}. ` + (summaryContentEl.innerText || chapter.summary);
  } else if (activeTab === "crux") {
    textToRead = `Crux Material for ${chapter.title}. ` + (cruxContentEl.innerText || chapter.crux);
  } else if (activeTab === "edition") {
    textToRead = textEditionInputEl.value;
  } else {
    textToRead = `${paper.paperCode}: ${chapter.title}. ` + chapter.summary + ". Content: " + chapter.content;
  }

  playSpeechText(textToRead);
}

function playSpeechText(rawText) {
  stopSpeech();

  const cleanText = rawText
    .replace(/[#*`_>]/g, " ")
    .replace(/\[!\w+\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  speechUtterance = new SpeechSynthesisUtterance(cleanText);
  
  const voiceSelect = document.getElementById("voiceSelect");
  const voices = window.speechSynthesis.getVoices();
  const selectedIdx = voiceSelect ? parseInt(voiceSelect.value) : -1;
  if (voices && voices.length > 0 && selectedIdx >= 0 && voices[selectedIdx]) {
    speechUtterance.voice = voices[selectedIdx];
  } else if (voices && voices.length > 0) {
    // fallback: find en-IN or first English voice
    const fallbackVoice = voices.find(v => v.lang === "en-IN") || voices.find(v => v.lang.startsWith("en")) || voices[0];
    speechUtterance.voice = fallbackVoice;
  }

  const speedSelect = document.getElementById("speedSelect");
  if (speedSelect) {
    speechUtterance.rate = parseFloat(speedSelect.value);
  }

  speechUtterance.onstart = () => {
    isSpeaking = true;
    isPaused = false;
    updateAudioUI(true);
  };

  speechUtterance.onend = () => {
    isSpeaking = false;
    isPaused = false;
    updateAudioUI(false);
  };

  speechUtterance.onerror = () => {
    isSpeaking = false;
    isPaused = false;
    updateAudioUI(false);
  };

  window.speechSynthesis.speak(speechUtterance);
}

function pauseSpeech() {
  if (isSpeaking && !isPaused) {
    window.speechSynthesis.pause();
    isPaused = true;
    updateAudioUI(false);
  }
}

function stopSpeech() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  isSpeaking = false;
  isPaused = false;
  updateAudioUI(false);
}

function updateAudioUI(isPlaying) {
  const visualizer = document.getElementById("audioVisualizer");
  const playLabel = document.getElementById("playAudioLabel");
  if (isPlaying) {
    if (visualizer) visualizer.classList.add("playing");
    if (playLabel) playLabel.textContent = "Listening...";
  } else {
    if (visualizer) visualizer.classList.remove("playing");
    if (playLabel) playLabel.textContent = "Listen to Section";
  }
}

function loadUserProgress() {
  const saved = localStorage.getItem("sas_prep_user_data_v3");
  if (saved) {
    try {
      userStore = Object.assign(userStore, JSON.parse(saved));
    } catch(e) {}
  }
}

function saveUserProgress() {
  localStorage.setItem("sas_prep_user_data_v3", JSON.stringify(userStore));
  updateProgressUI();
  renderPapersNav();
}

function getSectionStatus(secId) {
  return userStore.status[secId] || "not_started";
}

function onStatusChange(newStatus) {
  const sec = SAS_CURRICULUM[currentPaperIndex].sections[currentSectionIndex];
  userStore.status[sec.id] = newStatus;
  saveUserProgress();
}

function updateProgressUI() {
  let totalChapters = 0;
  let completedChapters = 0;

  SAS_CURRICULUM.forEach(paper => {
    paper.sections.forEach(sec => {
      (sec.chapters || []).forEach(ch => {
        totalChapters++;
        if (userStore.chapterStatus[`${sec.id}_${ch.id}`]) {
          completedChapters++;
        }
      });
    });
  });

  const pct = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;
  overallProgressPctEl.textContent = `${pct}% (${completedChapters}/${totalChapters} Chapters)`;
  overallProgressBarEl.style.width = `${pct}%`;
}

function initSearch() {
  searchInputEl.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) {
      renderPapersNav();
      return;
    }

    papersListEl.innerHTML = "";
    SAS_CURRICULUM.forEach((paper, pIdx) => {
      paper.sections.forEach((sec, sIdx) => {
        const matches = sec.title.toLowerCase().includes(query) || 
                        sec.cruxMaterial.toLowerCase().includes(query) ||
                        (sec.chapters || []).some(c => c.title.toLowerCase().includes(query) || c.content.toLowerCase().includes(query));
        
        if (matches) {
          const item = document.createElement("div");
          item.className = "section-item";
          item.style.padding = "8px 12px";
          item.innerHTML = `
            <div>
              <span class="paper-tag">${paper.paperCode}</span>
              <span>${sec.title}</span>
            </div>
          `;
          item.onclick = () => {
            currentPaperIndex = pIdx;
            currentSectionIndex = sIdx;
            currentChapterIndex = 0;
            renderPapersNav();
            loadCurrentSection();
          };
          papersListEl.appendChild(item);
        }
      });
    });
  });
}

function copyText(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const text = el.innerText || el.textContent;
  navigator.clipboard.writeText(text).then(() => {
    alert("Content copied to clipboard!");
  });
}

function exportBackup() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(userStore, null, 2));
  const dlAnchor = document.createElement('a');
  dlAnchor.setAttribute("href", dataStr);
  dlAnchor.setAttribute("download", `SAS_Civil_Accounts_Progress_Backup_${new Date().toISOString().slice(0,10)}.json`);
  dlAnchor.click();
}

function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      userStore = JSON.parse(e.target.result);
      saveUserProgress();
      loadCurrentSection();
      alert("Backup successfully restored!");
    } catch(err) {
      alert("Invalid backup JSON file.");
    }
  };
  reader.readAsText(file);
}

window.addEventListener("DOMContentLoaded", initApp);


// ==========================================
// ==========================================
// INTERACTIVE CHAPTER & CPWA QUIZZER SYSTEM
// Supports: Chapter Quiz, Section Quiz, Paper Mock, CPWA Mock
// ==========================================

let activeQuizScope = "chapter"; // "chapter", "section", "paper", "cpwa"
let activeQuizState = {
  scope: "chapter",
  scopeId: null,
  questions: [],
  userSelections: {}, // qIdx -> selectedOptionIndex (0-3)
  isSubmitted: false
};

function switchQuizScope(scope) {
  activeQuizScope = scope;
  ["chapter", "section", "paper", "cpwa"].forEach(s => {
    const pill = document.getElementById(`quizScope_${s}`);
    if (pill) pill.classList.toggle("active", s === scope);
  });

  if (scope === "chapter") {
    loadChapterQuiz(true);
  } else if (scope === "section") {
    loadSectionQuiz(true);
  } else if (scope === "paper") {
    loadPaperQuiz(true);
  } else if (scope === "cpwa") {
    loadCpwaBonusQuiz();
  }
}

function resetActiveQuiz() {
  switchQuizScope(activeQuizScope);
}

function loadChapterQuiz(forceReset = false) {
  activeQuizScope = "chapter";
  const paper = SAS_CURRICULUM[currentPaperIndex];
  if (!paper || !paper.sections) return;
  const section = paper.sections[currentSectionIndex];
  if (!section || !section.chapters) return;
  const chapter = section.chapters[currentChapterIndex];
  if (!chapter) return;

  const headerTitle = document.getElementById("quizHeaderTitle");
  const subTitle = document.getElementById("quizSubTitle");
  if (headerTitle) headerTitle.textContent = `🎯 Chapter Quiz: ${chapter.title}`;
  if (subTitle) subTitle.textContent = `Paper ${paper.paperCode} • ${section.title}. Practicing specific questions for Subtopic ${currentChapterIndex + 1}.`;

  ["chapter", "section", "paper", "cpwa"].forEach(s => {
    const pill = document.getElementById(`quizScope_${s}`);
    if (pill) pill.classList.toggle("active", s === "chapter");
  });

  const scopeKey = `ch_${chapter.id}`;
  if (forceReset || activeQuizState.scopeId !== scopeKey) {
    let qList = [];
    if (window.SAS_QUIZ_BANK && window.SAS_QUIZ_BANK[chapter.id]) {
      qList = window.SAS_QUIZ_BANK[chapter.id];
    } else {
      qList = getFallbackQuestions(paper.paperCode, chapter.title);
    }

    activeQuizState = {
      scope: "chapter",
      scopeId: scopeKey,
      questions: qList,
      userSelections: {},
      isSubmitted: false
    };
  }

  renderInteractiveQuiz();
}

function loadSectionQuiz(forceReset = false) {
  activeQuizScope = "section";
  const paper = SAS_CURRICULUM[currentPaperIndex];
  if (!paper || !paper.sections) return;
  const section = paper.sections[currentSectionIndex];
  if (!section) return;

  const chapters = section.chapters || [];
  const headerTitle = document.getElementById("quizHeaderTitle");
  const subTitle = document.getElementById("quizSubTitle");
  
  ["chapter", "section", "paper", "cpwa"].forEach(s => {
    const pill = document.getElementById(`quizScope_${s}`);
    if (pill) pill.classList.toggle("active", s === "section");
  });

  // Aggregate questions across ALL chapters in this section
  let combinedQs = [];
  chapters.forEach(ch => {
    if (window.SAS_QUIZ_BANK && window.SAS_QUIZ_BANK[ch.id]) {
      combinedQs = combinedQs.concat(window.SAS_QUIZ_BANK[ch.id]);
    }
  });

  if (headerTitle) headerTitle.textContent = `📚 Whole Section Quiz: ${section.title} (${combinedQs.length} Questions)`;
  if (subTitle) subTitle.textContent = `Paper ${paper.paperCode} • Aggregated across all ${chapters.length} subtopics in this section. Answer all and submit to view your section score.`;

  const scopeKey = `sec_${section.id}`;
  if (forceReset || activeQuizState.scopeId !== scopeKey) {
    activeQuizState = {
      scope: "section",
      scopeId: scopeKey,
      questions: combinedQs,
      userSelections: {},
      isSubmitted: false
    };
  }

  renderInteractiveQuiz();
}

function loadPaperQuiz(forceReset = false) {
  activeQuizScope = "paper";
  const paper = SAS_CURRICULUM[currentPaperIndex];
  if (!paper || !paper.sections) return;

  const headerTitle = document.getElementById("quizHeaderTitle");
  const subTitle = document.getElementById("quizSubTitle");

  ["chapter", "section", "paper", "cpwa"].forEach(s => {
    const pill = document.getElementById(`quizScope_${s}`);
    if (pill) pill.classList.toggle("active", s === "paper");
  });

  // Aggregate questions across ALL sections of this Paper
  let paperQs = [];
  paper.sections.forEach(sec => {
    (sec.chapters || []).forEach(ch => {
      if (window.SAS_QUIZ_BANK && window.SAS_QUIZ_BANK[ch.id]) {
        paperQs = paperQs.concat(window.SAS_QUIZ_BANK[ch.id]);
      }
    });
  });

  if (headerTitle) headerTitle.textContent = `🎓 Full Paper Mock: ${paper.paperCode} - ${paper.paperTitle} (${paperQs.length} Questions)`;
  if (subTitle) subTitle.textContent = `Complete mock examination testing all sections and subtopics of ${paper.paperCode}. Select answers and click Submit.`;

  const scopeKey = `paper_${paper.paperCode}`;
  if (forceReset || activeQuizState.scopeId !== scopeKey) {
    activeQuizState = {
      scope: "paper",
      scopeId: scopeKey,
      questions: paperQs,
      userSelections: {},
      isSubmitted: false
    };
  }

  renderInteractiveQuiz();
}

function loadCpwaBonusQuiz() {
  activeQuizScope = "cpwa";
  const headerTitle = document.getElementById("quizHeaderTitle");
  const subTitle = document.getElementById("quizSubTitle");
  if (headerTitle) headerTitle.textContent = `🏗️ CPWA & Forest Accounts Mock Test (SASQuizzer APK - 99 Questions)`;
  if (subTitle) subTitle.textContent = `Imported directly from SASQuizzer APK. Complete exam test bank covering Divisional Accountant responsibilities, CPWA forms, MBs, cash books, and deposit works.`;

  ["chapter", "section", "paper", "cpwa"].forEach(s => {
    const pill = document.getElementById(`quizScope_${s}`);
    if (pill) pill.classList.toggle("active", s === "cpwa");
  });

  let cpwaQs = (window.SAS_QUIZ_BANK && window.SAS_QUIZ_BANK["cpwa_pc16_bonus"]) ? window.SAS_QUIZ_BANK["cpwa_pc16_bonus"] : [];

  activeQuizState = {
    scope: "cpwa",
    scopeId: "cpwa_pc16_bonus",
    questions: cpwaQs,
    userSelections: {},
    isSubmitted: false
  };

  switchTab("quiz");
  renderInteractiveQuiz();
}

function getFallbackQuestions(paperCode, title) {
  return [
    {
      q: `In the context of ${paperCode}, what is the statutory standard governing ${title}?`,
      opts: [
        "Strict compliance with authorized Codal rules, GFR, and CAG Regulations",
        "Discretionary informal practices without codal support",
        "Exclusively corporate private auditing guidelines",
        "Informal departmental notes without documentation"
      ],
      ans: 0,
      hint: "All public accounting and audit operations must conform strictly to authorized codal and statutory baselines."
    },
    {
      q: `Which authority holds primary responsibility for verifying compliance in this subject area?`,
      opts: [
        "Accountant General / Pay and Accounts Officer per statutory rules",
        "Unauthorized third-party commercial consultants",
        "Private banking entities without government authorization",
        "Informal peer committees"
      ],
      ans: 0,
      hint: "The Accountant General (A&E/Audit) and PAOs hold direct constitutional and codal accountability."
    }
  ];
}

function renderInteractiveQuiz() {
  const container = document.getElementById("quizQuestionsContainer");
  const banner = document.getElementById("quizResultBanner");
  const submitBtn = document.getElementById("btnSubmitQuiz");
  if (!container) return;

  const { questions, userSelections, isSubmitted } = activeQuizState;

  if (isSubmitted && banner) {
    banner.style.display = "block";
    let score = 0;
    questions.forEach((q, idx) => {
      if (userSelections[idx] === q.ans) score++;
    });
    const pct = Math.round((score / questions.length) * 100);
    const scoreText = document.getElementById("quizScoreText");
    const feedbackText = document.getElementById("quizFeedbackText");
    if (scoreText) scoreText.textContent = `Your Score: ${score} / ${questions.length} (${pct}%)`;
    if (feedbackText) {
      if (pct >= 80) feedbackText.textContent = "🌟 Outstanding! Ready for SAS Examination standards.";
      else if (pct >= 50) feedbackText.textContent = "👍 Good effort! Review missed questions and codal references below.";
      else feedbackText.textContent = "⚠️ Needs revision. Carefully examine the correct options and statutory hints.";
    }
    if (submitBtn) submitBtn.style.display = "none";
  } else {
    if (banner) banner.style.display = "none";
    if (submitBtn) submitBtn.style.display = "inline-block";
  }

  if (questions.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 30px;">No quiz questions found for this selection.</p>`;
    return;
  }

  const optionLetters = ["A", "B", "C", "D"];
  let html = "";

  questions.forEach((q, qIdx) => {
    const userSel = userSelections[qIdx];
    const isCorrect = isSubmitted && userSel === q.ans;
    const isWrong = isSubmitted && userSel !== undefined && userSel !== q.ans;
    const isUnanswered = isSubmitted && userSel === undefined;

    let cardBorder = "border: 1px solid rgba(255,255,255,0.08);";
    let statusBadge = "";

    if (isSubmitted) {
      if (isCorrect) {
        cardBorder = "border: 1px solid #10b981; background: rgba(16, 185, 129, 0.05);";
        statusBadge = `<span style="background: #10b981; color: #fff; font-size: 0.75rem; font-weight: 700; padding: 2px 8px; border-radius: 9999px;">✓ Correct</span>`;
      } else if (isWrong) {
        cardBorder = "border: 1px solid #ef4444; background: rgba(239, 68, 68, 0.05);";
        statusBadge = `<span style="background: #ef4444; color: #fff; font-size: 0.75rem; font-weight: 700; padding: 2px 8px; border-radius: 9999px;">✗ Incorrect</span>`;
      } else if (isUnanswered) {
        cardBorder = "border: 1px solid #f59e0b; background: rgba(245, 158, 11, 0.05);";
        statusBadge = `<span style="background: #f59e0b; color: #fff; font-size: 0.75rem; font-weight: 700; padding: 2px 8px; border-radius: 9999px;">⚪ Unanswered</span>`;
      }
    }

    html += `
      <div class="quiz-question-card" style="margin-bottom: 20px; padding: 18px 20px; border-radius: 12px; background: var(--card-bg, #1e293b); ${cardBorder}">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px;">
          <h4 style="margin: 0; font-size: 1rem; font-weight: 600; color: var(--text-main, #f8fafc); line-height: 1.5;">
            <span style="color: #38bdf8; margin-right: 6px;">Q${qIdx + 1}.</span> ${q.q}
          </h4>
          ${statusBadge}
        </div>

        <div class="quiz-options-grid" style="display: flex; flex-direction: column; gap: 8px;">
    `;

    q.opts.forEach((optText, oIdx) => {
      const isSelected = userSel === oIdx;
      let optStyle = "padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 10px;";

      if (!isSubmitted) {
        if (isSelected) {
          optStyle += " background: rgba(37, 99, 235, 0.25); border-color: #3b82f6; font-weight: 600;";
        } else {
          optStyle += " background: rgba(255,255,255,0.03);";
        }
      } else {
        if (oIdx === q.ans) {
          optStyle += " background: rgba(16, 185, 129, 0.2); border-color: #10b981; color: #34d399; font-weight: 700;";
        } else if (isSelected && oIdx !== q.ans) {
          optStyle += " background: rgba(239, 68, 68, 0.2); border-color: #ef4444; color: #f87171;";
        } else {
          optStyle += " opacity: 0.6; background: transparent;";
        }
      }

      const radioChecked = isSelected ? "checked" : "";
      const disabledAttr = isSubmitted ? "disabled" : "";

      html += `
        <div style="${optStyle}" onclick="selectQuizOption(${qIdx}, ${oIdx})">
          <input type="radio" name="quiz_q_${qIdx}" ${radioChecked} ${disabledAttr} style="cursor: pointer; width: 16px; height: 16px;">
          <span style="font-weight: 700; color: #94a3b8; min-width: 20px;">(${optionLetters[oIdx]})</span>
          <span style="flex: 1; line-height: 1.4;">${optText}</span>
          ${isSubmitted && oIdx === q.ans ? '<span style="color: #10b981; font-weight: 700; font-size: 0.85rem;">[Correct Answer]</span>' : ''}
        </div>
      `;
    });

    html += `</div>`;

    if (isSubmitted && q.hint) {
      html += `
        <div style="margin-top: 12px; padding: 10px 14px; border-radius: 8px; background: rgba(56, 189, 248, 0.08); border-left: 3px solid #38bdf8; font-size: 0.88rem; color: #94a3b8;">
          <strong style="color: #38bdf8;">💡 Codal Citation / Rule Rationale:</strong> ${q.hint}
        </div>
      `;
    }

    html += `</div>`;
  });

  container.innerHTML = html;
}

function selectQuizOption(qIdx, oIdx) {
  if (activeQuizState.isSubmitted) return;
  activeQuizState.userSelections[qIdx] = oIdx;
  renderInteractiveQuiz();
}

function submitInteractiveQuiz() {
  if (activeQuizState.isSubmitted) return;

  const total = activeQuizState.questions.length;
  const answered = Object.keys(activeQuizState.userSelections).length;

  if (answered < total) {
    const proceed = confirm(`You have answered ${answered} of ${total} questions. Are you sure you want to submit?`);
    if (!proceed) return;
  }

  activeQuizState.isSubmitted = true;
  renderInteractiveQuiz();

  const banner = document.getElementById("quizResultBanner");
  if (banner) banner.scrollIntoView({ behavior: "smooth", block: "center" });
}


// ==========================================
// UMBRELLA SUB-TAB NAVIGATION HANDLERS
// ==========================================

function switchAiSubTab(subId) {
  const subViews = ["summary", "crux", "tutor", "cards"];
  subViews.forEach(v => {
    const btn = document.getElementById(`aiSubTab_${v}`);
    const view = document.getElementById(`aiSubView_${v}`);
    if (btn) btn.classList.remove("active");
    if (view) view.style.display = "none";
  });

  const targetBtn = document.getElementById(`aiSubTab_${subId}`);
  const targetView = document.getElementById(`aiSubView_${subId}`);
  if (targetBtn) targetBtn.classList.add("active");
  if (targetView) {
    targetView.style.display = "block";
    targetView.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // If opening tutor, auto-scroll chat to latest message
  if (subId === "tutor") {
    const chatBox = document.getElementById("tutorChatBox");
    if (chatBox) {
      setTimeout(() => { chatBox.scrollTop = chatBox.scrollHeight; }, 50);
    }
  }
}

function switchNotesSubTab(subId) {
  const subViews = ["editor", "coverage"];
  subViews.forEach(v => {
    const btn = document.getElementById(`notesSubTab_${v}`);
    const view = document.getElementById(`notesSubView_${v}`);
    if (btn) btn.classList.remove("active");
    if (view) view.style.display = "none";
  });

  const targetBtn = document.getElementById(`notesSubTab_${subId}`);
  const targetView = document.getElementById(`notesSubView_${subId}`);
  if (targetBtn) targetBtn.classList.add("active");
  if (targetView) {
    targetView.style.display = "block";
    targetView.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}
