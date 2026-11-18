// SAS Prep - Quizzer & One-Liner Controller
// Complete Paper-Wise SAS Quizzer (1,118 Questions) & SAS One-Liners (5,328 Facts)

(function() {
  "use strict";

  // ==========================================
  // 1. PAPER METADATA & CONSTANTS
  // ==========================================
  const PAPERS_INFO = {
    "ALL": { name: "All Papers", count: 1118, badge: "All" },
    "PC1": { name: "PC-1: Language, Noting & Drafting", count: 45, badge: "PC-1" },
    "PC2": { name: "PC-2: Constitution, CAG Act & MSO", count: 150, badge: "PC-2" },
    "PC3": { name: "PC-3: Information Technology", count: 174, badge: "PC-3" },
    "PC4": { name: "PC-4: GFR, R&P, GAR & CPWA", count: 249, badge: "PC-4" },
    "PC9": { name: "PC-9: Financial Accounting & AS", count: 47, badge: "PC-9" },
    "PC11": { name: "PC-11: Civil Accounts & Treasury", count: 168, badge: "PC-11" },
    "PC13": { name: "PC-13: Parliamentary & State Financial Control", count: 114, badge: "PC-13" },
    "PC15": { name: "PC-15: Pension, GPF & Service Rules", count: 72, badge: "PC-15" },
    "CPWA": { name: "CPWA & Forest Accounts (SASQuizzer APK)", count: 99, badge: "CPWA-APK" }
  };

  const ONELINER_PAPERS = {
    "ALL": "All Papers",
    "PC-1": "PC-1 (Language, Noting)",
    "PC-2": "PC-2 (CAG Act, Const.)",
    "PC-3": "PC-3 (Info Technology)",
    "PC-4": "PC-4 (GFR, R&P, CPWA)",
    "PC-9": "PC-9 (Accountancy, AS)",
    "PC-11": "PC-11 (Civil Accounts)",
    "PC-13": "PC-13 (Parliamentary Control)",
    "PC-15": "PC-15 (Pension, GPF)",
    "CPWA_APK": "CPWA Code (APK)"
  };

  // ==========================================
  // 2. QUIZZER STATE & ENGINE
  // ==========================================
  let allQuizzerQuestions = []; // Flat list of all 1,118 questions
  let quizzerState = {
    initialized: false,
    selectedPaper: "ALL",
    selectedTopic: "ALL",
    mode: "practice", // "practice" | "exam"
    limit: 25,
    activeList: [],
    currentIndex: 0,
    userAnswers: {}, // { [qIndex]: optIndex }
    isSubmitted: false,
    timerSeconds: 0,
    timerTimer: null
  };

  function normalizePaperCode(chId) {
    if (!chId) return "PC1";
    const lower = chId.toLowerCase();
    if (lower.startsWith("pc11")) return "PC11";
    if (lower.startsWith("pc13")) return "PC13";
    if (lower.startsWith("pc15")) return "PC15";
    if (lower.startsWith("pc1_") || lower === "pc1") return "PC1";
    if (lower.startsWith("pc2")) return "PC2";
    if (lower.startsWith("pc3")) return "PC3";
    if (lower.startsWith("pc4")) return "PC4";
    if (lower.startsWith("pc9")) return "PC9";
    if (lower.includes("cpwa") || lower.includes("pc16")) return "CPWA";
    return "PC1";
  }

  function getChapterTitle(chId) {
    if (chId === "cpwa_pc16_bonus") return "CPWA Code & Public Works Accounts (APK Mock)";
    if (window.SAS_CURRICULUM) {
      for (const p of window.SAS_CURRICULUM) {
        if (p.sections) {
          for (const s of p.sections) {
            if (s.chapters) {
              const f = s.chapters.find(c => c.id === chId);
              if (f) return f.title;
            }
          }
        }
      }
    }
    return chId.toUpperCase().replace(/_/g, " ");
  }

  function buildQuizzerDatabase() {
    if (allQuizzerQuestions.length > 0) return;
    if (!window.SAS_QUIZ_BANK) {
      console.warn("[SAS Quizzer] SAS_QUIZ_BANK not yet loaded.");
      return;
    }

    let globalId = 1;
    for (const [chId, qArray] of Object.entries(window.SAS_QUIZ_BANK)) {
      const paperCode = normalizePaperCode(chId);
      const chTitle = getChapterTitle(chId);

      qArray.forEach((item, localIdx) => {
        allQuizzerQuestions.push({
          id: "q_" + (globalId++),
          chId: chId,
          paper: paperCode,
          paperBadge: PAPERS_INFO[paperCode]?.badge || paperCode,
          chapterTitle: chTitle,
          q: item.q,
          opts: item.opts,
          ans: item.ans,
          hint: item.hint || "Review codal provisions for this topic."
        });
      });
    }
    console.log(`[SAS Quizzer] Built database with ${allQuizzerQuestions.length} questions across 8 papers + APK.`);
    const totalBadge = document.getElementById("quizzerTotalBadge");
    if (totalBadge) totalBadge.textContent = `${allQuizzerQuestions.length.toLocaleString()} Questions`;
  }

  function initQuizzer() {
    buildQuizzerDatabase();
    populateQuizzerTopicSelect();
    restartQuizzerQuiz();
    quizzerState.initialized = true;
  }

  function populateQuizzerTopicSelect() {
    const sel = document.getElementById("quizzerTopicSelect");
    if (!sel) return;

    // Filter topics by selected paper
    const paper = quizzerState.selectedPaper;
    const chaptersMap = new Map();

    allQuizzerQuestions.forEach(q => {
      if (paper === "ALL" || q.paper === paper) {
        if (!chaptersMap.has(q.chId)) {
          chaptersMap.set(q.chId, {
            id: q.chId,
            title: q.chapterTitle,
            count: 0
          });
        }
        chaptersMap.get(q.chId).count++;
      }
    });

    let html = `<option value="ALL">All Topics in ${paper === "ALL" ? "All Papers" : paper} (${chaptersMap.size} Topics)</option>`;
    for (const ch of chaptersMap.values()) {
      html += `<option value="${ch.id}">${ch.title} (${ch.count} Qs)</option>`;
    }
    sel.innerHTML = html;
    quizzerState.selectedTopic = "ALL";
  }

  window.selectQuizzerPaper = function(paperCode) {
    quizzerState.selectedPaper = paperCode;
    // Update pill buttons
    const pills = document.querySelectorAll("#quizzerPaperPills .filter-pill");
    pills.forEach(p => {
      const onclickAttr = p.getAttribute("onclick") || "";
      if (onclickAttr.includes(`'${paperCode}'`)) {
        p.classList.add("active");
      } else {
        p.classList.remove("active");
      }
    });

    populateQuizzerTopicSelect();
    restartQuizzerQuiz();
  };

  window.onQuizzerTopicChange = function() {
    const sel = document.getElementById("quizzerTopicSelect");
    if (sel) {
      quizzerState.selectedTopic = sel.value;
      restartQuizzerQuiz();
    }
  };

  window.setQuizzerMode = function(mode) {
    quizzerState.mode = mode;
    const btnP = document.getElementById("btnModePractice");
    const btnE = document.getElementById("btnModeExam");
    if (btnP) btnP.classList.toggle("active", mode === "practice");
    if (btnE) btnE.classList.toggle("active", mode === "exam");
    restartQuizzerQuiz();
  };

  window.onQuizzerCountChange = function() {
    const sel = document.getElementById("quizzerCountSelect");
    if (sel) {
      const val = sel.value;
      quizzerState.limit = val === "ALL" ? 9999 : parseInt(val, 10);
      restartQuizzerQuiz();
    }
  };

  window.restartQuizzerQuiz = function() {
    if (allQuizzerQuestions.length === 0) buildQuizzerDatabase();

    // Filter questions
    let filtered = allQuizzerQuestions.filter(q => {
      const matchPaper = quizzerState.selectedPaper === "ALL" || q.paper === quizzerState.selectedPaper;
      const matchTopic = quizzerState.selectedTopic === "ALL" || q.chId === quizzerState.selectedTopic;
      return matchPaper && matchTopic;
    });

    if (filtered.length === 0) {
      filtered = allQuizzerQuestions.slice();
    }

    // Shuffle copy
    const shuffled = filtered.slice().sort(() => Math.random() - 0.5);
    const limit = Math.min(shuffled.length, quizzerState.limit);
    quizzerState.activeList = shuffled.slice(0, limit);
    quizzerState.currentIndex = 0;
    quizzerState.userAnswers = {};
    quizzerState.isSubmitted = false;

    // Reset results view
    const resultsArea = document.getElementById("quizzerResultsArea");
    const activeArea = document.getElementById("quizzerActiveArea");
    if (resultsArea) resultsArea.style.display = "none";
    if (activeArea) activeArea.style.display = "block";

    // Setup timer
    if (quizzerState.timerTimer) clearInterval(quizzerState.timerTimer);
    const timerBadge = document.getElementById("quizzerTimer");
    if (quizzerState.mode === "exam") {
      quizzerState.timerSeconds = limit * 60; // 1 minute per question
      if (timerBadge) {
        timerBadge.style.display = "inline-flex";
        updateTimerDisplay();
      }
      quizzerState.timerTimer = setInterval(() => {
        quizzerState.timerSeconds--;
        updateTimerDisplay();
        if (quizzerState.timerSeconds <= 0) {
          clearInterval(quizzerState.timerTimer);
          alert("Time's up! Your mock exam is submitting now.");
          submitQuizzerExam(true);
        }
      }, 1000);
    } else {
      if (timerBadge) timerBadge.style.display = "none";
    }

    renderQuizzerQuestion();
    renderQuizzerPalette();
    updateQuizzerScoreLive();
  };

  function updateTimerDisplay() {
    const el = document.getElementById("quizzerTimer");
    if (!el) return;
    const mins = Math.floor(quizzerState.timerSeconds / 60);
    const secs = quizzerState.timerSeconds % 60;
    el.textContent = `⏱️ ${mins}:${secs < 10 ? '0' : ''}${secs}`;
    if (quizzerState.timerSeconds < 180) {
      el.style.color = "#ef4444";
      el.style.borderColor = "#ef4444";
    } else {
      el.style.color = "";
      el.style.borderColor = "";
    }
  }

  function updateQuizzerScoreLive() {
    const badge = document.getElementById("quizzerScoreLive");
    if (!badge) return;

    const total = quizzerState.activeList.length;
    const answeredCount = Object.keys(quizzerState.userAnswers).length;

    if (quizzerState.mode === "practice") {
      let correct = 0;
      for (const [idxStr, chosen] of Object.entries(quizzerState.userAnswers)) {
        const q = quizzerState.activeList[parseInt(idxStr, 10)];
        if (q && chosen === q.ans) correct++;
      }
      badge.textContent = `Score: ${correct} / ${answeredCount} (Total: ${total})`;
      badge.style.display = "inline-flex";
    } else {
      badge.textContent = `Answered: ${answeredCount} / ${total}`;
      badge.style.display = "inline-flex";
    }
  }

  function renderQuizzerQuestion() {
    const qList = quizzerState.activeList;
    const total = qList.length;
    if (total === 0) return;

    const idx = quizzerState.currentIndex;
    const q = qList[idx];

    // Progress text
    const progText = document.getElementById("quizzerProgressText");
    if (progText) progText.textContent = `Question ${idx + 1} of ${total}`;

    // Meta Badge
    const metaBadge = document.getElementById("quizzerMetaBadge");
    if (metaBadge) {
      metaBadge.textContent = `${q.paperBadge} • ${q.chapterTitle}`;
    }

    // Question Text
    const qText = document.getElementById("quizzerQuestionText");
    if (qText) {
      qText.innerHTML = `<span style="color:var(--text-muted); font-size:0.88rem; margin-right:6px;">Q${idx + 1}.</span> ${escapeHtml(q.q)}`;
    }

    // Options List
    const optsContainer = document.getElementById("quizzerOptionsList");
    if (optsContainer) {
      const isAnswered = quizzerState.userAnswers.hasOwnProperty(idx);
      const chosenOpt = isAnswered ? quizzerState.userAnswers[idx] : null;

      let html = "";
      q.opts.forEach((optText, oIdx) => {
        const letters = ["A", "B", "C", "D", "E"];
        const optLetter = letters[oIdx] || (oIdx + 1);

        let optClass = "quizzer-opt-item";
        let statusIcon = "";

        if (quizzerState.mode === "practice") {
          if (isAnswered) {
            if (oIdx === q.ans) {
              optClass += " correct-opt";
              statusIcon = `<span class="opt-status-badge correct">✓ Correct</span>`;
            } else if (oIdx === chosenOpt) {
              optClass += " wrong-opt";
              statusIcon = `<span class="opt-status-badge wrong">✗ Selected</span>`;
            } else {
              optClass += " disabled-opt";
            }
          }
        } else {
          // Exam Mode
          if (chosenOpt === oIdx) {
            optClass += " selected-exam-opt";
          }
        }

        html += `
          <div class="${optClass}" onclick="selectQuizzerOption(${oIdx})">
            <span class="quizzer-opt-letter">${optLetter}</span>
            <span class="quizzer-opt-text">${escapeHtml(optText)}</span>
            ${statusIcon}
          </div>
        `;
      });
      optsContainer.innerHTML = html;
    }

    // Hint Box
    const hintBox = document.getElementById("quizzerHintBox");
    if (hintBox) {
      const isAnswered = quizzerState.userAnswers.hasOwnProperty(idx);
      if (quizzerState.mode === "practice" && isAnswered) {
        const isCorrect = quizzerState.userAnswers[idx] === q.ans;
        hintBox.style.display = "block";
        hintBox.className = `quizzer-hint-box ${isCorrect ? 'hint-correct' : 'hint-wrong'}`;
        hintBox.innerHTML = `
          <strong>💡 ${isCorrect ? "Well Done!" : "Codal Reference & Explanation:"}</strong>
          <p style="margin:4px 0 0 0; font-size:0.9rem;">${escapeHtml(q.hint)}</p>
        `;
      } else {
        hintBox.style.display = "none";
      }
    }

    // Button states
    const btnPrev = document.getElementById("btnQuizzerPrev");
    const btnNext = document.getElementById("btnQuizzerNext");
    if (btnPrev) btnPrev.disabled = (idx === 0);
    if (btnNext) btnNext.disabled = (idx === total - 1);

    renderQuizzerPalette();
    updateQuizzerScoreLive();
  }

  function renderQuizzerPalette() {
    const pal = document.getElementById("quizzerPalette");
    if (!pal) return;

    const total = quizzerState.activeList.length;
    let html = "";

    for (let i = 0; i < total; i++) {
      let cls = "pal-btn";
      if (i === quizzerState.currentIndex) cls += " current";

      if (quizzerState.userAnswers.hasOwnProperty(i)) {
        if (quizzerState.mode === "practice") {
          const isCorrect = quizzerState.userAnswers[i] === quizzerState.activeList[i].ans;
          cls += isCorrect ? " pal-correct" : " pal-wrong";
        } else {
          cls += " pal-answered";
        }
      }

      html += `<button class="${cls}" onclick="jumpToQuizzerQ(${i})" title="Go to Question ${i + 1}">${i + 1}</button>`;
    }
    pal.innerHTML = html;
  }

  window.selectQuizzerOption = function(optIdx) {
    if (quizzerState.isSubmitted) return;
    const currIdx = quizzerState.currentIndex;

    if (quizzerState.mode === "practice") {
      if (quizzerState.userAnswers.hasOwnProperty(currIdx)) {
        return; // Already locked in practice mode
      }
      quizzerState.userAnswers[currIdx] = optIdx;
      renderQuizzerQuestion();
    } else {
      // Exam mode allows changing answer
      quizzerState.userAnswers[currIdx] = optIdx;
      renderQuizzerQuestion();
    }
  };

  window.navigateQuizzerQ = function(delta) {
    const total = quizzerState.activeList.length;
    const newIdx = quizzerState.currentIndex + delta;
    if (newIdx >= 0 && newIdx < total) {
      quizzerState.currentIndex = newIdx;
      renderQuizzerQuestion();
    }
  };

  window.jumpToQuizzerQ = function(idx) {
    if (idx >= 0 && idx < quizzerState.activeList.length) {
      quizzerState.currentIndex = idx;
      renderQuizzerQuestion();
    }
  };

  window.submitQuizzerExam = function(force = false) {
    if (quizzerState.isSubmitted) return;

    const total = quizzerState.activeList.length;
    const answered = Object.keys(quizzerState.userAnswers).length;

    if (!force && answered < total) {
      const proceed = confirm(`You have answered ${answered} of ${total} questions. Are you sure you want to finish and submit the exam?`);
      if (!proceed) return;
    }

    if (quizzerState.timerTimer) clearInterval(quizzerState.timerTimer);
    quizzerState.isSubmitted = true;

    // Calculate score
    let correct = 0;
    let wrong = 0;
    let unattempted = 0;
    const missedList = [];

    quizzerState.activeList.forEach((q, idx) => {
      if (quizzerState.userAnswers.hasOwnProperty(idx)) {
        if (quizzerState.userAnswers[idx] === q.ans) {
          correct++;
        } else {
          wrong++;
          missedList.push({ ...q, chosen: quizzerState.userAnswers[idx], qIdx: idx });
        }
      } else {
        unattempted++;
        missedList.push({ ...q, chosen: null, qIdx: idx });
      }
    });

    const percent = total > 0 ? Math.round((correct / total) * 100) : 0;
    const isPass = percent >= 50; // SAS Civil Accounts qualifying benchmark

    // Show Results Card
    const resultsArea = document.getElementById("quizzerResultsArea");
    const activeArea = document.getElementById("quizzerActiveArea");
    if (activeArea) activeArea.style.display = "none";

    if (resultsArea) {
      resultsArea.style.display = "block";
      resultsArea.innerHTML = `
        <div class="quizzer-score-card ${isPass ? 'pass-card' : 'fail-card'}">
          <div style="font-size:2.8rem; margin-bottom:8px;">${isPass ? "🏆" : "📚"}</div>
          <h2>${isPass ? "Congratulations! Pass Standard Achieved" : "Review Required - Below 50% Benchmark"}</h2>
          <div class="score-display">
            <span class="score-num">${correct}</span>
            <span class="score-total">/ ${total}</span>
            <span class="score-percent">(${percent}%)</span>
          </div>
          <p style="color:var(--text-muted); margin: 8px 0 16px 0;">
            Paper: <strong>${PAPERS_INFO[quizzerState.selectedPaper]?.name || quizzerState.selectedPaper}</strong> | Mode: <strong>${quizzerState.mode.toUpperCase()}</strong>
          </p>

          <div class="result-stats-row">
            <div class="stat-box stat-correct">
              <div class="stat-val">${correct}</div>
              <div class="stat-label">Correct</div>
            </div>
            <div class="stat-box stat-wrong">
              <div class="stat-val">${wrong}</div>
              <div class="stat-label">Incorrect</div>
            </div>
            <div class="stat-box stat-unattempted">
              <div class="stat-val">${unattempted}</div>
              <div class="stat-label">Unanswered</div>
            </div>
          </div>

          <div style="display:flex; justify-content:center; gap:12px; margin-top:20px; flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="restartQuizzerQuiz()">🔄 Start Fresh Quiz</button>
            ${missedList.length > 0 ? `<button class="btn btn-warning" onclick="retakeMissedQuizzer()">🎯 Retake ${missedList.length} Missed Questions</button>` : ''}
            <button class="btn btn-outline" onclick="reviewFullQuizzer()">📋 Review Detailed Explanations</button>
          </div>
        </div>

        <div id="quizzerDetailedReview" style="margin-top:24px;"></div>
      `;
      resultsArea.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  window.retakeMissedQuizzer = function() {
    const missed = [];
    quizzerState.activeList.forEach((q, idx) => {
      if (!quizzerState.userAnswers.hasOwnProperty(idx) || quizzerState.userAnswers[idx] !== q.ans) {
        missed.push(q);
      }
    });

    if (missed.length === 0) {
      alert("No missed questions! You got 100%!");
      return;
    }

    quizzerState.activeList = missed;
    quizzerState.currentIndex = 0;
    quizzerState.userAnswers = {};
    quizzerState.isSubmitted = false;
    quizzerState.mode = "practice";

    const resultsArea = document.getElementById("quizzerResultsArea");
    const activeArea = document.getElementById("quizzerActiveArea");
    if (resultsArea) resultsArea.style.display = "none";
    if (activeArea) activeArea.style.display = "block";

    renderQuizzerQuestion();
    renderQuizzerPalette();
    updateQuizzerScoreLive();
  };

  window.reviewFullQuizzer = function() {
    const revDiv = document.getElementById("quizzerDetailedReview");
    if (!revDiv) return;

    let html = `
      <div style="margin-top:16px; border-top:1px solid var(--border); padding-top:16px;">
        <h3 style="margin-bottom:12px;">Detailed Question-by-Question Review</h3>
    `;

    quizzerState.activeList.forEach((q, idx) => {
      const chosen = quizzerState.userAnswers[idx];
      const isCorrect = chosen === q.ans;
      const isAnswered = quizzerState.userAnswers.hasOwnProperty(idx);

      html += `
        <div class="review-q-item ${isCorrect ? 'rev-correct' : (isAnswered ? 'rev-wrong' : 'rev-skipped')}" style="margin-bottom:14px; padding:12px 14px; border-radius:8px; border:1px solid var(--border); background:var(--bg-card);">
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <span class="badge" style="font-size:0.75rem;">Q${idx + 1} • ${q.paperBadge}</span>
            <span style="font-weight:600; font-size:0.8rem; color:${isCorrect ? 'var(--success)' : (isAnswered ? 'var(--danger)' : 'var(--text-muted)')};">
              ${isCorrect ? '✓ Correct' : (isAnswered ? '✗ Incorrect' : '○ Skipped')}
            </span>
          </div>
          <div style="font-weight:600; font-size:0.92rem; margin-bottom:8px;">${escapeHtml(q.q)}</div>
          <div style="font-size:0.88rem; display:grid; gap:4px; margin-bottom:8px;">
      `;

      q.opts.forEach((opt, oIdx) => {
        let optStyle = "padding:4px 8px; border-radius:4px;";
        if (oIdx === q.ans) {
          optStyle += " background:rgba(34, 197, 94, 0.15); font-weight:600; color:var(--success); border:1px solid rgba(34, 197, 94, 0.4);";
        } else if (oIdx === chosen) {
          optStyle += " background:rgba(239, 68, 68, 0.15); color:var(--danger); border:1px solid rgba(239, 68, 68, 0.4);";
        }
        html += `<div style="${optStyle}">${String.fromCharCode(65 + oIdx)}. ${escapeHtml(opt)}</div>`;
      });

      html += `
          </div>
          <div style="font-size:0.82rem; color:var(--text-muted); background:var(--bg-main); padding:8px 10px; border-radius:6px; border-left:3px solid var(--primary);">
            <strong>Explanation:</strong> ${escapeHtml(q.hint)}
          </div>
        </div>
      `;
    });

    html += `</div>`;
    revDiv.innerHTML = html;
  };

  // ==========================================
  // 3. SAS ONE-LINERS STATE & ENGINE
  // ==========================================
  let allOneLiners = []; // Flat list with id
  let oneLinerState = {
    initialized: false,
    selectedPaper: "ALL",
    searchQuery: "",
    onlyStarred: false,
    pageSize: 50,
    currentPage: 1,
    filteredList: [],
    starredIds: new Set()
  };

  function loadStarredOneLiners() {
    try {
      const saved = localStorage.getItem("sas_starred_oneliners");
      if (saved) {
        oneLinerState.starredIds = new Set(JSON.parse(saved));
      }
    } catch (e) {
      console.error("[OneLiners] Failed to load starred items", e);
    }
  }

  function saveStarredOneLiners() {
    try {
      localStorage.setItem("sas_starred_oneliners", JSON.stringify(Array.from(oneLinerState.starredIds)));
    } catch (e) {
      console.error("[OneLiners] Failed to save starred items", e);
    }
  }

  function buildOneLinersDatabase() {
    if (allOneLiners.length > 0) return;
    if (!window.SAS_ONELINERS) {
      console.warn("[SAS OneLiners] SAS_ONELINERS not loaded.");
      return;
    }

    loadStarredOneLiners();
    let idCounter = 1;

    for (const [paperKey, factList] of Object.entries(window.SAS_ONELINERS)) {
      factList.forEach(item => {
        allOneLiners.push({
          id: `ol_${idCounter++}`,
          paper: item.paper || paperKey,
          topic: item.topic || "Core Codal Rule",
          fact: item.fact || "",
          tag: item.tag || "Codal Key Fact"
        });
      });
    }

    console.log(`[SAS OneLiners] Loaded ${allOneLiners.length} one-liners.`);
    const countBadge = document.getElementById("onelinerCountBadge");
    if (countBadge) countBadge.textContent = `${allOneLiners.length.toLocaleString()} Facts`;
  }

  function initOneLiners() {
    buildOneLinersDatabase();
    updateStarredCountBadge();
    filterOneLiners();
    oneLinerState.initialized = true;
  }

  function updateStarredCountBadge() {
    const badge = document.getElementById("starredCount");
    if (badge) badge.textContent = oneLinerState.starredIds.size;
  }

  window.selectOneLinerPaper = function(paperCode) {
    oneLinerState.selectedPaper = paperCode;
    oneLinerState.currentPage = 1;

    // Update pill buttons
    const pills = document.querySelectorAll("#onelinerPaperPills .filter-pill");
    pills.forEach(p => {
      const onclickAttr = p.getAttribute("onclick") || "";
      if (onclickAttr.includes(`'${paperCode}'`)) {
        p.classList.add("active");
      } else {
        p.classList.remove("active");
      }
    });

    filterOneLiners();
  };

  let searchDebounce = null;
  window.onOneLinerSearch = function(inputEl) {
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      oneLinerState.searchQuery = (inputEl.value || "").trim().toLowerCase();
      oneLinerState.currentPage = 1;
      filterOneLiners();
    }, 150);
  };

  window.toggleStarredOneLiners = function() {
    oneLinerState.onlyStarred = !oneLinerState.onlyStarred;
    oneLinerState.currentPage = 1;
    const btn = document.getElementById("btnStarredOnly");
    if (btn) btn.classList.toggle("active", oneLinerState.onlyStarred);
    filterOneLiners();
  };

  window.onOneLinerPageSizeChange = function() {
    const sel = document.getElementById("onelinerPageSize");
    if (sel) {
      const val = sel.value;
      oneLinerState.pageSize = val === "ALL" ? 99999 : parseInt(val, 10);
      oneLinerState.currentPage = 1;
      filterOneLiners();
    }
  };

  function filterOneLiners() {
    if (allOneLiners.length === 0) buildOneLinersDatabase();

    const pFilter = oneLinerState.selectedPaper;
    const query = oneLinerState.searchQuery;
    const starredOnly = oneLinerState.onlyStarred;

    oneLinerState.filteredList = allOneLiners.filter(item => {
      if (pFilter !== "ALL" && item.paper !== pFilter) return false;
      if (starredOnly && !oneLinerState.starredIds.has(item.id)) return false;
      if (query) {
        const text = `${item.paper} ${item.topic} ${item.tag} ${item.fact}`.toLowerCase();
        if (!text.includes(query)) return false;
      }
      return true;
    });

    renderOneLinersList();
  }

  function renderOneLinersList() {
    const listContainer = document.getElementById("onelinersList");
    const countText = document.getElementById("onelinerCountText");
    const topPag = document.getElementById("onelinerPagination");
    const btmPag = document.getElementById("onelinerPaginationBottom");

    const totalFiltered = oneLinerState.filteredList.length;
    if (countText) {
      countText.innerHTML = `Showing <strong>${totalFiltered.toLocaleString()}</strong> one-liners ${oneLinerState.onlyStarred ? '(Starred Only)' : ''}`;
    }

    if (totalFiltered === 0) {
      if (listContainer) {
        listContainer.innerHTML = `
          <div style="text-align:center; padding:40px 20px; color:var(--text-muted);">
            <div style="font-size:2rem; margin-bottom:8px;">🔍</div>
            <p>No one-liners found matching your filters.</p>
            <button class="btn btn-small" onclick="resetOneLinerFilters()" style="margin-top:8px;">Reset Filters</button>
          </div>
        `;
      }
      if (topPag) topPag.innerHTML = "";
      if (btmPag) btmPag.innerHTML = "";
      return;
    }

    // Pagination math
    const pageSize = oneLinerState.pageSize;
    const totalPages = Math.ceil(totalFiltered / pageSize);
    if (oneLinerState.currentPage > totalPages) oneLinerState.currentPage = totalPages;
    const currPage = oneLinerState.currentPage;

    const startIdx = (currPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, totalFiltered);
    const pageItems = oneLinerState.filteredList.slice(startIdx, endIdx);

    // Render items
    let html = "";
    pageItems.forEach((item, idx) => {
      const isStarred = oneLinerState.starredIds.has(item.id);
      const highlightedFact = highlightKeywords(escapeHtml(item.fact), oneLinerState.searchQuery);

      html += `
        <div class="oneliner-card" id="${item.id}">
          <div class="oneliner-card-header">
            <div class="oneliner-card-meta">
              <span class="badge oneliner-paper-badge">${escapeHtml(item.paper)}</span>
              <span class="oneliner-topic-tag">${escapeHtml(item.topic)}</span>
              ${item.tag ? `<span class="oneliner-subtag">${escapeHtml(item.tag)}</span>` : ''}
            </div>
            <div class="oneliner-card-actions">
              <button class="action-btn-circle ${isStarred ? 'starred' : ''}" onclick="toggleStarOneLiner('${item.id}', this)" title="${isStarred ? 'Remove from Starred' : 'Star for Revision'}">
                ${isStarred ? '★' : '☆'}
              </button>
              <button class="action-btn-circle" onclick="readOneLinerCard('${item.id}')" title="Listen Aloud">
                🔊
              </button>
              <button class="action-btn-circle" onclick="copyOneLinerCard('${item.id}', this)" title="Copy Fact">
                📋
              </button>
            </div>
          </div>
          <div class="oneliner-card-body" id="fact_${item.id}">
            ${highlightedFact}
          </div>
        </div>
      `;
    });

    if (listContainer) listContainer.innerHTML = html;

    // Render Pagination Controls
    const pagHtml = totalPages > 1 ? `
      <div class="pag-wrapper">
        <button class="btn-pag" onclick="goToOnelinerPage(1)" ${currPage === 1 ? 'disabled' : ''} title="First Page">«</button>
        <button class="btn-pag" onclick="goToOnelinerPage(${currPage - 1})" ${currPage === 1 ? 'disabled' : ''} title="Previous Page">‹</button>
        <span class="pag-info">Page <strong>${currPage}</strong> of <strong>${totalPages}</strong> (${startIdx + 1}–${endIdx} of ${totalFiltered})</span>
        <button class="btn-pag" onclick="goToOnelinerPage(${currPage + 1})" ${currPage === totalPages ? 'disabled' : ''} title="Next Page">›</button>
        <button class="btn-pag" onclick="goToOnelinerPage(${totalPages})" ${currPage === totalPages ? 'disabled' : ''} title="Last Page">»</button>
      </div>
    ` : "";

    if (topPag) topPag.innerHTML = pagHtml;
    if (btmPag) btmPag.innerHTML = pagHtml;
  }

  function highlightKeywords(text, query) {
    if (!query || query.length < 2) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    return text.replace(regex, '<mark class="highlight-mark">$1</mark>');
  }

  window.goToOnelinerPage = function(p) {
    oneLinerState.currentPage = p;
    renderOneLinersList();
    const panel = document.getElementById("panel_sas_oneliner");
    if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  window.resetOneLinerFilters = function() {
    oneLinerState.selectedPaper = "ALL";
    oneLinerState.searchQuery = "";
    oneLinerState.onlyStarred = false;
    oneLinerState.currentPage = 1;

    const sInput = document.getElementById("onelinerSearchInput");
    if (sInput) sInput.value = "";

    const btn = document.getElementById("btnStarredOnly");
    if (btn) btn.classList.remove("active");

    const pills = document.querySelectorAll("#onelinerPaperPills .filter-pill");
    pills.forEach((p, idx) => p.classList.toggle("active", idx === 0));

    filterOneLiners();
  };

  window.toggleStarOneLiner = function(id, btnEl) {
    if (oneLinerState.starredIds.has(id)) {
      oneLinerState.starredIds.delete(id);
      if (btnEl) {
        btnEl.classList.remove("starred");
        btnEl.innerHTML = "☆";
        btnEl.title = "Star for Revision";
      }
    } else {
      oneLinerState.starredIds.add(id);
      if (btnEl) {
        btnEl.classList.add("starred");
        btnEl.innerHTML = "★";
        btnEl.title = "Remove from Starred";
      }
    }
    saveStarredOneLiners();
    updateStarredCountBadge();

    // If currently filtering starred only, re-filter
    if (oneLinerState.onlyStarred) {
      filterOneLiners();
    }
  };

  window.readOneLinerCard = function(id) {
    const item = allOneLiners.find(x => x.id === id);
    if (!item) return;

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const text = `${item.paper}. ${item.topic}. ${item.fact}`;
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.0;
      utter.pitch = 1.0;
      window.speechSynthesis.speak(utter);
    } else {
      alert("Text-to-speech not supported in this browser.");
    }
  };

  window.copyOneLinerCard = function(id, btnEl) {
    const item = allOneLiners.find(x => x.id === id);
    if (!item) return;

    const text = `[${item.paper}] ${item.topic}\n• ${item.fact}`;
    navigator.clipboard.writeText(text).then(() => {
      const orig = btnEl.innerHTML;
      btnEl.innerHTML = "✓";
      btnEl.style.color = "var(--success)";
      setTimeout(() => {
        btnEl.innerHTML = orig;
        btnEl.style.color = "";
      }, 1500);
    }).catch(err => {
      console.error("Failed to copy", err);
    });
  };

  window.readAllFilteredOneLiners = function() {
    const currItems = oneLinerState.filteredList.slice(
      (oneLinerState.currentPage - 1) * oneLinerState.pageSize,
      oneLinerState.currentPage * oneLinerState.pageSize
    );

    if (currItems.length === 0) {
      alert("No one-liners to read.");
      return;
    }

    if (!("speechSynthesis" in window)) {
      alert("Speech synthesis is not available.");
      return;
    }

    window.speechSynthesis.cancel();
    alert(`Reading aloud ${currItems.length} one-liners from current page. Click speech controls to stop anytime.`);

    let idx = 0;
    function speakNext() {
      if (idx >= currItems.length) return;
      const it = currItems[idx++];
      const utter = new SpeechSynthesisUtterance(`${it.paper}: ${it.fact}`);
      utter.onend = speakNext;
      utter.onerror = () => {};
      window.speechSynthesis.speak(utter);
    }
    speakNext();
  };

  window.copyFilteredOneLiners = function() {
    if (oneLinerState.filteredList.length === 0) {
      alert("No one-liners to copy.");
      return;
    }

    let text = `# SAS Civil Accounts High-Yield One-Liners (${oneLinerState.selectedPaper})\n\n`;
    oneLinerState.filteredList.forEach(item => {
      text += `### [${item.paper}] ${item.topic}\n- **Fact**: ${item.fact}\n- **Category**: ${item.tag}\n\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
      alert(`Copied ${oneLinerState.filteredList.length} one-liners to clipboard!`);
    }).catch(e => {
      console.error("Clipboard copy failed", e);
    });
  };

  // ==========================================
  // 4. GLOBAL TAB ROUTING HOOK
  // ==========================================
  const originalSwitchTab = window.switchTab;

  window.switchTab = function(tabId) {
    if (typeof originalSwitchTab === "function") {
      originalSwitchTab(tabId);
    } else {
      document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.remove("active"));
      const targetBtn = document.getElementById(`tabBtn_${tabId}`);
      const targetPanel = document.getElementById(`panel_${tabId}`);
      if (targetBtn) targetBtn.classList.add("active");
      if (targetPanel) targetPanel.classList.add("active");
    }

    // Sync Top-Right Navigation Tabs
    const topQuizzer = document.getElementById("topNavBtn_quizzer");
    const topOneliner = document.getElementById("topNavBtn_oneliner");
    if (topQuizzer) topQuizzer.classList.toggle("active", tabId === "sas_quizzer");
    if (topOneliner) topOneliner.classList.toggle("active", tabId === "sas_oneliner");

    // Initialize SAS Quizzer on demand
    if (tabId === "sas_quizzer") {
      if (!quizzerState.initialized) {
        initQuizzer();
      }
    }

    // Initialize SAS One-Liners on demand
    if (tabId === "sas_oneliner") {
      if (!oneLinerState.initialized) {
        initOneLiners();
      }
    }
  };

  // Keyboard navigation for Quizzer (1-4 for options, arrows for prev/next)
  document.addEventListener("keydown", function(e) {
    const activePanel = document.getElementById("panel_sas_quizzer");
    if (!activePanel || !activePanel.classList.contains("active")) return;
    if (quizzerState.isSubmitted) return;

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      window.navigateQuizzerQ(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      window.navigateQuizzerQ(1);
    } else if (["1", "2", "3", "4"].includes(e.key)) {
      const idx = parseInt(e.key, 10) - 1;
      window.selectQuizzerOption(idx);
    }
  });

  // Helper escape
  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Pre-load on DOM ready
  if (document.readyState !== "loading") {
    setTimeout(() => {
      buildQuizzerDatabase();
      buildOneLinersDatabase();
    }, 200);
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(() => {
        buildQuizzerDatabase();
        buildOneLinersDatabase();
      }, 200);
    });
  }

})();
