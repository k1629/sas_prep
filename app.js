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
async function callDirectGeminiAPI(prompt, systemInstruction = "") {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_DIRECT_KEY}`;
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
    throw new Error(data.error.message || "Gemini API error");
  }
  throw new Error("Invalid response format from Gemini API");
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
  switchTab('summary');
  const section = SAS_CURRICULUM[currentPaperIndex].sections[currentSectionIndex];
  const chapter = section.chapters[currentChapterIndex];
  const effKey = `${section.id}_${chapter.id}`;

  if (!userStore.aiSummaries[effKey]) {
    generateAISummary(false);
  }
}

function triggerAICrux() {
  switchTab('crux');
  const section = SAS_CURRICULUM[currentPaperIndex].sections[currentSectionIndex];
  const chapter = section.chapters[currentChapterIndex];
  const effKey = `${section.id}_${chapter.id}`;

  if (!userStore.aiCrux[effKey]) {
    generateAICrux(false);
  }
}

function openTextEdition() {
  switchTab('edition');
  textEditionInputEl.focus();
}

async function generateAISummary(forceRefresh = false) {
  const paper = SAS_CURRICULUM[currentPaperIndex];
  const section = paper.sections[currentSectionIndex];
  const chapter = section.chapters[currentChapterIndex];
  const effKey = `${section.id}_${chapter.id}`;
  const loadingEl = document.getElementById("summaryLoading");

  loadingEl.style.display = "flex";
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
    console.warn("Local backend unreachable, falling back to Direct Gemini API on phone...", err);
    try {
      const sysPrompt = "You are an expert exam mentor and senior audit officer specializing in the Indian Audit & Accounts Department (IA&AD) SAS Examination for Civil Accounts. Provide an authoritative, high-yield, structured executive summary designed for rapid exam revision.";
      const userPrompt = `Generate an exam-focused, high-yield summary for SAS Paper ${paper.paperCode} - ${section.title} (${chapter.title}):\n\n${chapter.content.slice(0, 8000)}`;
      const directResult = await callDirectGeminiAPI(userPrompt, sysPrompt);
      loadingEl.style.display = "none";
      userStore.aiSummaries[effKey] = directResult;
      saveUserProgress();
      summaryContentEl.innerHTML = `
        <div class="alert-box success">
          <strong>✨ Gemini AI Summary for ${chapter.title} (Direct Mobile Cloud):</strong>
        </div>
      ` + formatMarkdown(directResult);
    } catch(directErr) {
      loadingEl.style.display = "none";
      console.error("Direct Gemini error:", directErr);
      alert("Unable to reach Gemini API. Please check internet connection.");
    }
  }
}

async function generateAICrux(forceRefresh = false) {
  const paper = SAS_CURRICULUM[currentPaperIndex];
  const section = paper.sections[currentSectionIndex];
  const chapter = section.chapters[currentChapterIndex];
  const effKey = `${section.id}_${chapter.id}`;
  const loadingEl = document.getElementById("cruxLoading");

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
    try {
      const prompt = `Review these chapter notes for SAS Paper ${SAS_CURRICULUM[currentPaperIndex].paperCode} (${section.title} - ${chapter.title}) and append: (1) 3 critical Rule/Codal numbers often tested, (2) One practical audit trap or caveat, and (3) A 1-line memory mnemonic.\n\nNotes:\n` + currentVal;
      const res = await callDirectGeminiAPI(prompt, "You are an expert exam mentor for the IA&AD SAS Civil Accounts examination.");
      textEditionInputEl.value = currentVal + "\n\n### 🌟 AI Exam Enrichments & Statutory Citations (Direct Cloud)\n" + res;
      saveTextEdition();
      editionStatusIndicatorEl.textContent = "Enriched & Saved (Direct Cloud)!";
    } catch(err2) {
      editionStatusIndicatorEl.textContent = "AI enrichment failed.";
    }
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
  switchTab('flashcards');
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
    try {
      const prompt = `Generate 3 high-yield SAS Civil Accounts examination questions (1 MCQ with detailed explanation, 1 practical Case Study / Audit Scenario, and 1 Short Note question with model answer key) for SAS Paper ${paper.paperCode} - ${section.title} (${chapter.title}):\n\n${chapter.content.slice(0, 8000)}`;
      const res = await callDirectGeminiAPI(prompt, "You are a senior director of audit and chief examiner for the IA&AD Subordinate Audit/Accounts Service (SAS) Civil Accounts examination.");
      aiQuizContent.innerHTML = `<div class="alert-box success"><strong>✨ Gemini AI Practice Quiz (Direct Cloud):</strong></div>` + formatMarkdown(res);
    } catch(err2) {
      aiQuizContent.innerHTML = `<p style="color: var(--danger);">Unable to generate quiz. Please check internet connection.</p>`;
    }
  }
}

function resetTutorChat(paper, section) {
  tutorChatBoxEl.innerHTML = `
    <div class="chat-message ai-message">
      <div class="chat-avatar">🤖</div>
      <div class="chat-bubble">
        <strong>Hello! I am your AI Mentor for ${paper.paperCode} (${section.title}).</strong>
        <p>Ask me anything regarding rules, codal procedures, accounting entries (e.g. Form 26, CPWA suspense accounts), or how to frame exam answers for this chapter.</p>
      </div>
    </div>
  `;
}

function clearTutorChat() {
  const paper = SAS_CURRICULUM[currentPaperIndex];
  const section = paper.sections[currentSectionIndex];
  resetTutorChat(paper, section);
}

async function sendTutorQuestion() {
  const q = tutorInputEl.value.trim();
  if (!q) return;
  tutorInputEl.value = "";

  const paper = SAS_CURRICULUM[currentPaperIndex];
  const section = paper.sections[currentSectionIndex];
  const chapter = section.chapters[currentChapterIndex];

  const userMsg = document.createElement("div");
  userMsg.className = "chat-message user-message";
  userMsg.innerHTML = `<div class="chat-avatar">👤</div><div class="chat-bubble">${q}</div>`;
  tutorChatBoxEl.appendChild(userMsg);

  const aiMsg = document.createElement("div");
  aiMsg.className = "chat-message ai-message";
  aiMsg.innerHTML = `<div class="chat-avatar">🤖</div><div class="chat-bubble"><em>Consulting Civil Accounts codal rules with Gemini AI...</em></div>`;
  tutorChatBoxEl.appendChild(aiMsg);
  tutorChatBoxEl.scrollTop = tutorChatBoxEl.scrollHeight;

  try {
    const res = await fetch("/api/ask-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paperCode: paper.paperCode,
        title: `${section.title} - ${chapter.title}`,
        question: q,
        context: chapter.content
      })
    });
    const d = await res.json();
    if (d.success && d.result) {
      aiMsg.querySelector(".chat-bubble").innerHTML = formatMarkdown(d.result);
    } else {
      aiMsg.querySelector(".chat-bubble").innerHTML = `<span style="color: var(--danger);">Error: ${d.error}</span>`;
    }
  } catch(err) {
    try {
      const prompt = `User Question: ${q}\n\nChapter Context (${paper.paperCode} - ${section.title}: ${chapter.title}):\n${chapter.content.slice(0, 7000)}`;
      const res = await callDirectGeminiAPI(prompt, "You are an authoritative, helpful AI Mentor and Senior Audit Officer for the IA&AD SAS Examination (Civil Accounts). Answer clearly with relevant rules, codal procedures, accounting entries, and exam tips.");
      aiMsg.querySelector(".chat-bubble").innerHTML = formatMarkdown(res);
    } catch(err2) {
      aiMsg.querySelector(".chat-bubble").innerHTML = `<span style="color: var(--danger);">Unable to connect to AI mentor. Please check internet connection.</span>`;
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
    voiceSelect.innerHTML = "";
    voices.filter(v => v.lang.startsWith("en")).forEach((v, idx) => {
      const opt = document.createElement("option");
      opt.value = idx;
      opt.textContent = `${v.name} (${v.lang})`;
      voiceSelect.appendChild(opt);
    });
  }

  populateVoices();
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populateVoices;
  }
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
  if (voices && voiceSelect && voices[voiceSelect.value]) {
    speechUtterance.voice = voices[voiceSelect.value];
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
