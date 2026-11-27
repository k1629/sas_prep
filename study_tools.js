// =========================================================================
// SAS Exam Master Hub - Study Tools & Enhanced Capabilities
// Phases 1, 2, and 3: Reader UI, Quick Search, Mobile Gestures,
// Commute Audio, Cheat Sheet Hub, Spaced Repetition, and Daily Streak
// =========================================================================

(function() {
  "use strict";

  // Helper functions for safe HTML and search highlighting
  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function highlightKeywords(text, query) {
    if (!query || !text) return text;
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escapedQuery})`, "gi");
    return text.replace(regex, `<mark class="highlight-search">$1</mark>`);
  }

  // State management for study tools
  window.SAS_STUDY_TOOLS = {
    fontSizeLevel: 0, // -2, -1, 0, 1, 2, 3
    continuousAudio: false,
    searchFilter: "all",
    searchIndex: null,
    streakData: { count: 1, lastDate: "", chapterDone: false, quizDone: false },
    srsRatings: {}, // { [id]: 'hard' | 'good' | 'easy' }
    highlights: {} // { [effChapterKey]: [ { text, color, note } ] }
  };

  // -------------------------------------------------------------
  // 1. INITIALIZATION & STORAGE
  // -------------------------------------------------------------
  function initStudyTools() {
    loadSavedSettings();
    initKeyboardShortcuts();
    initTouchSwipeGestures();
    initDailyStreak();
    initAudioContinuousListener();
    initHighlightToolbar();
    setupOutlineObserver();
    renderCheatSheetContent();
    console.log("[SAS Study Tools] Initialized all phases successfully.");
  }

  function loadSavedSettings() {
    try {
      // Font size
      const savedFont = localStorage.getItem("sas_font_size_level");
      if (savedFont !== null) {
        window.SAS_STUDY_TOOLS.fontSizeLevel = parseInt(savedFont, 10);
        applyFontSize();
      }

      // Continuous audio
      const savedContAudio = localStorage.getItem("sas_continuous_audio");
      if (savedContAudio === "true") {
        window.SAS_STUDY_TOOLS.continuousAudio = true;
        const cb = document.getElementById("continuousAudioToggle");
        if (cb) cb.checked = true;
      }

      // SRS ratings
      const savedSRS = localStorage.getItem("sas_srs_ratings");
      if (savedSRS) {
        window.SAS_STUDY_TOOLS.srsRatings = JSON.parse(savedSRS);
      }

      // Highlights
      const savedHighlights = localStorage.getItem("sas_chapter_highlights");
      if (savedHighlights) {
        window.SAS_STUDY_TOOLS.highlights = JSON.parse(savedHighlights);
      }
    } catch (e) {
      console.warn("[SAS Study Tools] Error loading saved settings:", e);
    }
  }

  // -------------------------------------------------------------
  // 2. KEYBOARD SHORTCUTS (Ctrl+K, Esc)
  // -------------------------------------------------------------
  function initKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      // Ctrl+K or Cmd+K: Open Search Modal
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openSearchModal();
      }
      // Esc: Close Search or Drawer
      if (e.key === "Escape") {
        closeSearchModal();
        toggleChapterOutline(false);
      }
    });
  }

  // -------------------------------------------------------------
  // 3. INSTANT SEARCH MODAL (Across 155 Chapters, Quizzes & One-Liners)
  // -------------------------------------------------------------
  window.openSearchModal = function() {
    const modal = document.getElementById("searchModal");
    if (!modal) return;
    modal.classList.add("active");
    const input = document.getElementById("globalSearchInput");
    if (input) {
      input.focus();
      input.select();
      if (input.value.trim()) {
        executeGlobalSearch(input.value.trim());
      }
    }
  };

  window.closeSearchModal = function() {
    const modal = document.getElementById("searchModal");
    if (modal) modal.classList.remove("active");
  };

  window.closeSearchModalOnBackdrop = function(e) {
    if (e.target && e.target.id === "searchModal") {
      closeSearchModal();
    }
  };

  window.clearGlobalSearch = function() {
    const input = document.getElementById("globalSearchInput");
    if (input) {
      input.value = "";
      input.focus();
    }
    const list = document.getElementById("searchResultsList");
    if (list) {
      list.innerHTML = `<div class="search-empty-state">Type a keyword or Codal Rule to search across all 8 Civil Accounts papers.</div>`;
    }
  };

  window.setSearchFilter = function(filter) {
    window.SAS_STUDY_TOOLS.searchFilter = filter;
    document.querySelectorAll(".search-filter-pill").forEach(pill => {
      pill.classList.toggle("active", pill.getAttribute("data-filter") === filter);
    });
    const input = document.getElementById("globalSearchInput");
    if (input && input.value.trim()) {
      executeGlobalSearch(input.value.trim());
    }
  };

  let searchDebounceTimer = null;
  window.onGlobalSearchInput = function(query) {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      executeGlobalSearch(query.trim());
    }, 180);
  };

  function executeGlobalSearch(query) {
    const list = document.getElementById("searchResultsList");
    if (!list) return;

    if (!query || query.length < 2) {
      list.innerHTML = `<div class="search-empty-state">Type at least 2 characters to search across chapters, one-liners, and questions.</div>`;
      return;
    }

    const qLower = query.toLowerCase();
    const filter = window.SAS_STUDY_TOOLS.searchFilter;
    const results = [];

    // 1. Search in Chapters (window.SAS_CURRICULUM)
    if (filter === "all" || filter === "chapter") {
      if (window.SAS_CURRICULUM) {
        window.SAS_CURRICULUM.forEach((paper, pIdx) => {
          (paper.sections || []).forEach((sec, sIdx) => {
            (sec.chapters || []).forEach((ch, cIdx) => {
              const inTitle = ch.title.toLowerCase().includes(qLower);
              const inSec = sec.title.toLowerCase().includes(qLower);
              const inContent = (ch.content || "").toLowerCase().indexOf(qLower);

              if (inTitle || inSec || inContent !== -1) {
                let snippet = "";
                if (inContent !== -1) {
                  const start = Math.max(0, inContent - 40);
                  const end = Math.min(ch.content.length, inContent + 100);
                  snippet = ch.content.substring(start, end).replace(/\n/g, " ");
                } else {
                  snippet = ch.content ? ch.content.substring(0, 100).replace(/\n/g, " ") : sec.title;
                }

                results.push({
                  type: "chapter",
                  badge: paper.paperCode || "PC",
                  title: ch.title,
                  subtitle: `${paper.paperTitle} • ${sec.title}`,
                  snippet: snippet,
                  action: () => {
                    closeSearchModal();
                    if (typeof selectChapter === "function") {
                      selectChapter(pIdx, sIdx, cIdx);
                    }
                    if (typeof switchTab === "function") {
                      switchTab("content");
                    }
                  }
                });
              }
            });
          });
        });
      }
    }

    // 2. Search in One-Liners (window.SAS_ONELINERS_RAW)
    if (filter === "all" || filter === "oneliner") {
      if (window.SAS_ONELINERS_RAW) {
        for (const [pKey, facts] of Object.entries(window.SAS_ONELINERS_RAW)) {
          if (results.length > 50) break;
          facts.forEach((f, idx) => {
            const factText = f.fact || "";
            if (factText.toLowerCase().includes(qLower) || (f.topic && f.topic.toLowerCase().includes(qLower))) {
              results.push({
                type: "oneliner",
                badge: f.paper || pKey,
                title: f.topic || "SAS Key Fact",
                subtitle: `One-Liner #${idx + 1}`,
                snippet: factText,
                action: () => {
                  closeSearchModal();
                  if (typeof switchTab === "function") {
                    switchTab("sas_oneliner");
                  }
                  // Optionally trigger search in oneliner view
                  const olInput = document.getElementById("onelinerSearchInput");
                  if (olInput) {
                    olInput.value = query;
                    if (typeof filterOneLiners === "function") filterOneLiners();
                  }
                }
              });
            }
          });
        }
      }
    }

    // 3. Search in Quizzes (window.SAS_QUIZ_BANK)
    if (filter === "all" || filter === "quiz") {
      if (window.SAS_QUIZ_BANK) {
        for (const [chId, qArray] of Object.entries(window.SAS_QUIZ_BANK)) {
          if (results.length > 70) break;
          qArray.forEach((q, qIdx) => {
            const inQ = q.q.toLowerCase().includes(qLower);
            const inOpts = q.opts.some(o => o.toLowerCase().includes(qLower));
            if (inQ || inOpts) {
              results.push({
                type: "quiz",
                badge: "MCQ",
                title: q.q,
                subtitle: `Chapter: ${chId.toUpperCase()} • Q#${qIdx + 1}`,
                snippet: q.hint || q.opts.join(" | "),
                action: () => {
                  closeSearchModal();
                  if (typeof switchTab === "function") {
                    switchTab("sas_quizzer");
                  }
                }
              });
            }
          });
        }
      }
    }

    // Render results
    if (results.length === 0) {
      list.innerHTML = `<div class="search-empty-state">No matching topics, rules, or questions found for "<strong>${escapeHtml(query)}</strong>".</div>`;
      return;
    }

    // Cap display at 35 results for optimal DOM performance
    const displayList = results.slice(0, 35);
    window._currentSearchResults = displayList;

    let html = `<div class="search-results-count">Found ${results.length} matches (showing top ${displayList.length})</div>`;
    displayList.forEach((item, rIdx) => {
      const typeIcons = { chapter: "📖", oneliner: "⚡", quiz: "🎯" };
      const icon = typeIcons[item.type] || "📄";

      html += `
        <div class="search-result-item" onclick="selectSearchResult(${rIdx})">
          <div class="search-item-header">
            <span class="badge search-type-${item.type}">${icon} ${item.type.toUpperCase()}</span>
            <span class="badge search-paper-badge">${escapeHtml(item.badge)}</span>
            <span class="search-item-subtitle">${escapeHtml(item.subtitle)}</span>
          </div>
          <div class="search-item-title">${highlightKeywords(escapeHtml(item.title), query)}</div>
          <div class="search-item-snippet">${highlightKeywords(escapeHtml(item.snippet), query)}</div>
        </div>
      `;
    });

    list.innerHTML = html;
  }

  window.selectSearchResult = function(idx) {
    if (window._currentSearchResults && window._currentSearchResults[idx]) {
      window._currentSearchResults[idx].action();
    }
  };

  // -------------------------------------------------------------
  // 4. FLOATING TABLE OF CONTENTS (OUTLINE DRAWER) & IN-CHAPTER SEARCH
  // -------------------------------------------------------------
  window.searchInCurrentChapter = function(query) {
    const container = document.getElementById("wholeContent");
    if (!container) return;
    const q = (query || "").trim();
    const countBadge = document.getElementById("inChapterMatchBadge");

    if (!window._origChapterHTML || window._lastSearchedChapter !== window.currentChapterIndex) {
      window._origChapterHTML = container.innerHTML;
      window._lastSearchedChapter = window.currentChapterIndex;
    }

    if (!q) {
      container.innerHTML = window._origChapterHTML;
      if (countBadge) {
        countBadge.textContent = "";
        countBadge.style.display = "none";
      }
      return;
    }

    const cleanHTML = window._origChapterHTML;
    const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?![^<]*>)(${escapedQ})`, "gi");
    const matches = cleanHTML.match(regex);
    const count = matches ? matches.length : 0;

    container.innerHTML = cleanHTML.replace(regex, `<mark class="chapter-search-hit">$1</mark>`);

    if (countBadge) {
      countBadge.textContent = `${count} match${count === 1 ? '' : 'es'}`;
      countBadge.style.display = count > 0 ? "inline-block" : "none";
    }

    const firstHit = container.querySelector(".chapter-search-hit");
    if (firstHit) {
      firstHit.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  function setupOutlineObserver() {
    // When loadCurrentChapter updates #wholeContent, re-render outline
    const contentBox = document.getElementById("wholeContent");
    if (!contentBox) return;

    const observer = new MutationObserver(() => {
      renderChapterOutline();
    });
    observer.observe(contentBox, { childList: true, subtree: false });
  }

  window.toggleChapterOutline = function(force) {
    const drawer = document.getElementById("chapterOutlineDrawer");
    const backdrop = document.getElementById("outlineBackdrop");
    if (!drawer) return;

    const isOpen = drawer.classList.contains("open");
    const shouldOpen = force !== undefined ? force : !isOpen;

    drawer.classList.toggle("open", shouldOpen);
    if (backdrop) backdrop.classList.toggle("active", shouldOpen);
  };

  function renderChapterOutline() {
    const contentBox = document.getElementById("wholeContent");
    const list = document.getElementById("chapterOutlineList");
    const badge = document.getElementById("outlineCountBadge");
    const floatBtn = document.getElementById("btnToggleOutline");
    if (!contentBox || !list) return;

    const headings = contentBox.querySelectorAll("h2, h3, h4");
    if (headings.length === 0) {
      if (floatBtn) floatBtn.style.display = "none";
      list.innerHTML = `<div style="padding:16px; color:var(--text-muted); font-size:0.88rem;">No section headings found in this topic.</div>`;
      if (badge) badge.textContent = "0";
      return;
    }

    if (floatBtn) floatBtn.style.display = "inline-flex";
    if (badge) badge.textContent = headings.length;

    let html = "";
    headings.forEach((h, idx) => {
      const anchorId = `sec-heading-${idx}`;
      h.id = anchorId;
      const level = h.tagName.toLowerCase();
      const text = h.textContent.trim();

      html += `
        <div class="outline-item outline-${level}" onclick="scrollToOutlineHeading('${anchorId}')">
          <span class="outline-bullet">•</span>
          <span class="outline-text">${escapeHtml(text)}</span>
        </div>
      `;
    });

    list.innerHTML = html;
  }

  window.scrollToOutlineHeading = function(id) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      toggleChapterOutline(false);
    }
  };

  // -------------------------------------------------------------
  // 5. READER MODE CONTROLS (Font Size, Sepia Theme)
  // -------------------------------------------------------------
  window.adjustFontSize = function(delta) {
    if (delta === 0) {
      window.SAS_STUDY_TOOLS.fontSizeLevel = 0;
    } else {
      window.SAS_STUDY_TOOLS.fontSizeLevel = Math.max(-2, Math.min(3, window.SAS_STUDY_TOOLS.fontSizeLevel + delta));
    }
    applyFontSize();
    localStorage.setItem("sas_font_size_level", window.SAS_STUDY_TOOLS.fontSizeLevel);
  };

  function applyFontSize() {
    const root = document.documentElement;
    const sizes = {
      "-2": "13px",
      "-1": "14px",
      "0": "15px",
      "1": "16.5px",
      "2": "18px",
      "3": "20px"
    };
    const chosen = sizes[window.SAS_STUDY_TOOLS.fontSizeLevel] || "15px";
    root.style.setProperty("--reader-font-size", chosen);

    const labels = { "-2": "75%", "-1": "90%", "0": "100%", "1": "115%", "2": "130%", "3": "145%" };
    const badge = document.getElementById("fontSizeDisplay");
    if (badge) badge.textContent = labels[window.SAS_STUDY_TOOLS.fontSizeLevel] || "100%";
  }

  window.toggleSepiaMode = function() {
    const curr = document.documentElement.getAttribute("data-theme");
    const next = curr === "sepia" ? "dark" : "sepia";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("sas_app_theme", next);

    const btn = document.getElementById("btnSepiaToggle");
    if (btn) btn.classList.toggle("active", next === "sepia");
  };

  // -------------------------------------------------------------
  // 6. TOUCH SWIPE GESTURES FOR MOBILE (Next/Prev Navigation)
  // -------------------------------------------------------------
  function initTouchSwipeGestures() {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;

    const contentArea = document.querySelector(".content-body");
    if (!contentArea) return;

    contentArea.addEventListener("touchstart", (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    contentArea.addEventListener("touchend", (e) => {
      touchEndX = e.changedTouches[0].screenX;
      touchEndY = e.changedTouches[0].screenY;
      handleSwipe();
    }, { passive: true });

    function handleSwipe() {
      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;

      // Ensure predominantly horizontal swipe of at least 70px
      if (Math.abs(diffX) > Math.abs(diffY) * 1.5 && Math.abs(diffX) > 70) {
        const activeTab = document.querySelector(".tab-panel.active");
        const activeTabId = activeTab ? activeTab.id : "";

        if (activeTabId === "panel_content") {
          if (diffX < 0) {
            // Swipe Left -> Next Chapter
            if (typeof navigateChapter === "function") navigateChapter(1);
          } else {
            // Swipe Right -> Prev Chapter
            if (typeof navigateChapter === "function") navigateChapter(-1);
          }
        } else if (activeTabId === "panel_sas_quizzer") {
          if (diffX < 0) {
            // Next Question
            if (typeof navigateQuizzerQ === "function") navigateQuizzerQ(1);
          } else {
            // Prev Question
            if (typeof navigateQuizzerQ === "function") navigateQuizzerQ(-1);
          }
        }
      }
    }
  }

  // -------------------------------------------------------------
  // 7. CONTINUOUS AUDIO "COMMUTE / PODCAST MODE"
  // -------------------------------------------------------------
  window.toggleContinuousAudio = function(enabled) {
    window.SAS_STUDY_TOOLS.continuousAudio = enabled;
    localStorage.setItem("sas_continuous_audio", enabled ? "true" : "false");
  };

  function initAudioContinuousListener() {
    // Intercept when speech utterance ends to auto-advance if continuous audio is on
    const checkSpeechOnEnd = () => {
      if (window.speechUtterance) {
        const originalOnEnd = window.speechUtterance.onend;
        window.speechUtterance.onend = (e) => {
          if (typeof originalOnEnd === "function") originalOnEnd(e);

          if (window.SAS_STUDY_TOOLS.continuousAudio) {
            console.log("[SAS Audio] Chapter finished. Continuous Podcast mode advancing to next chapter...");
            setTimeout(() => {
              if (typeof navigateChapter === "function") {
                navigateChapter(1);
                setTimeout(() => {
                  if (typeof playSpeech === "function") playSpeech();
                }, 800);
              }
            }, 1200);
          }
        };
      }
    };

    // Periodically re-bind if speechUtterance gets recreated
    setInterval(checkSpeechOnEnd, 2000);
  }

  // -------------------------------------------------------------
  // 8. DAILY STUDY STREAK & GOALS TRACKER
  // -------------------------------------------------------------
  function initDailyStreak() {
    const todayStr = new Date().toISOString().split("T")[0];
    let data = { count: 1, lastDate: todayStr, chapterDone: false, quizDone: false };

    try {
      const saved = localStorage.getItem("sas_daily_streak_data");
      if (saved) {
        const parsed = JSON.parse(saved);
        const last = new Date(parsed.lastDate);
        const today = new Date(todayStr);
        const diffDays = Math.round((today - last) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
          // Same day
          data = parsed;
        } else if (diffDays === 1) {
          // Next day: keep streak alive!
          data = {
            count: parsed.count + 1,
            lastDate: todayStr,
            chapterDone: false,
            quizDone: false
          };
        } else {
          // Missed more than 1 day: reset streak to 1
          data = { count: 1, lastDate: todayStr, chapterDone: false, quizDone: false };
        }
      }
    } catch (e) {
      console.warn("[SAS Streak] Error loading streak:", e);
    }

    window.SAS_STUDY_TOOLS.streakData = data;
    localStorage.setItem("sas_daily_streak_data", JSON.stringify(data));
    updateStreakUI();
  }

  function updateStreakUI() {
    const data = window.SAS_STUDY_TOOLS.streakData;
    const badge = document.getElementById("streakDaysCount");
    if (badge) badge.textContent = `${data.count} Day${data.count === 1 ? '' : 's'}`;

    const chkChapter = document.getElementById("goalChapterRead");
    if (chkChapter) chkChapter.checked = !!data.chapterDone;

    const chkQuiz = document.getElementById("goalQuizPracticed");
    if (chkQuiz) chkQuiz.checked = !!data.quizDone;
  }

  window.toggleDailyGoal = function(type) {
    const data = window.SAS_STUDY_TOOLS.streakData;
    if (type === "chapter") {
      const chk = document.getElementById("goalChapterRead");
      data.chapterDone = chk ? chk.checked : !data.chapterDone;
    } else if (type === "quiz") {
      const chk = document.getElementById("goalQuizPracticed");
      data.quizDone = chk ? chk.checked : !data.quizDone;
    }
    localStorage.setItem("sas_daily_streak_data", JSON.stringify(data));
    updateStreakUI();
  };

  // -------------------------------------------------------------
  // 9. TEXT HIGHLIGHTING TOOLBAR
  // -------------------------------------------------------------
  function initHighlightToolbar() {
    const container = document.getElementById("wholeContent");
    if (!container) return;

    let selectedRange = null;

    document.addEventListener("selectionchange", () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        hideHighlightMenu();
        return;
      }

      // Check if selection is within #wholeContent
      const range = selection.getRangeAt(0);
      if (container.contains(range.commonAncestorContainer)) {
        selectedRange = range;
        showHighlightMenu(range);
      } else {
        hideHighlightMenu();
      }
    });

    window.applySelectionHighlight = function(color) {
      if (!selectedRange) return;
      const span = document.createElement("mark");
      span.className = `user-highlight highlight-${color}`;
      span.title = "Highlighted by student";

      try {
        selectedRange.surroundContents(span);
        hideHighlightMenu();
        window.getSelection().removeAllRanges();
      } catch (e) {
        // Fallback for complex ranges across tags
        console.log("[Highlight] Non-contiguous selection:", e);
      }
    };
  }

  function showHighlightMenu(range) {
    let menu = document.getElementById("floatingHighlightMenu");
    if (!menu) {
      menu = document.createElement("div");
      menu.id = "floatingHighlightMenu";
      menu.className = "floating-highlight-menu";
      menu.innerHTML = `
        <button class="hl-btn hl-yellow" onclick="applySelectionHighlight('yellow')" title="Highlight Yellow">🟡</button>
        <button class="hl-btn hl-green" onclick="applySelectionHighlight('green')" title="Key Rule (Green)">🟢</button>
        <button class="hl-btn hl-pink" onclick="applySelectionHighlight('pink')" title="High Priority (Pink)">🔴</button>
      `;
      document.body.appendChild(menu);
    }

    const rect = range.getBoundingClientRect();
    menu.style.top = `${window.scrollY + rect.top - 42}px`;
    menu.style.left = `${window.scrollX + rect.left + (rect.width / 2) - 50}px`;
    menu.classList.add("visible");
  }

  function hideHighlightMenu() {
    const menu = document.getElementById("floatingHighlightMenu");
    if (menu) menu.classList.remove("visible");
  }

  // -------------------------------------------------------------
  // 10. CHEAT SHEET HUB & FORMULA REPOSITORY
  // -------------------------------------------------------------
  function renderCheatSheetContent() {
    const panel = document.getElementById("panel_cheatsheet");
    if (!panel) return;

    panel.innerHTML = `
      <div class="cheatsheet-hub-container">
        <!-- Hub Header -->
        <div class="cheatsheet-header-banner">
          <div>
            <h2>📋 SAS Civil Accounts Cheat Sheet & Codal Formula Hub</h2>
            <p>Instant ready-reckoner formulas, codal forms, constitutional articles, and accounting standards for rapid revision.</p>
          </div>
          <div class="cheatsheet-search-filter">
            <input type="text" placeholder="Filter formulas or forms..." oninput="filterCheatSheets(this.value)" class="cheatsheet-filter-input">
          </div>
        </div>

        <!-- 4 Grid Sections -->
        <div class="cheatsheet-cards-grid">
          
          <!-- Card 1: Pension & Gratuity Calculation Engine -->
          <div class="cheatsheet-card" id="cs_pension">
            <div class="cs-card-header">
              <span class="cs-icon">🧮</span>
              <h3>1. CCS (Pension) Rules 2021 & Gratuity Engine</h3>
            </div>
            <div class="cs-card-body">
              <table class="cs-table">
                <tr><th>Benefit</th><th>Formula & Ceiling</th><th>Qualifying Service (QS)</th></tr>
                <tr>
                  <td><strong>Superannuation Pension</strong></td>
                  <td>50% of Average Emoluments (last 10 months) or 50% of Last Basic Pay (whichever is beneficial). Min: ₹9,000, Max: ₹1,25,000.</td>
                  <td>Min 10 years (20 six-monthly half-years).</td>
                </tr>
                <tr>
                  <td><strong>Retirement Gratuity (DCRG)</strong></td>
                  <td>¼ × Emoluments (Basic + DA) × Completed Six-Monthly Periods (Max 66). Max ceiling: <strong>₹20 Lakhs</strong>.</td>
                  <td>Min 5 years QS.</td>
                </tr>
                <tr>
                  <td><strong>Service Gratuity</strong></td>
                  <td>½ × Emoluments × Completed Six-Monthly Periods. (Admissible in lieu of pension when QS < 10 years).</td>
                  <td>Less than 10 years.</td>
                </tr>
                <tr>
                  <td><strong>Death Gratuity</strong></td>
                  <td>
                    • < 1 yr: 2 × Emoluments<br>
                    • 1–5 yrs: 6 × Emoluments<br>
                    • 5–11 yrs: 12 × Emoluments<br>
                    • 11–20 yrs: 20 × Emoluments<br>
                    • 20+ yrs: ½ × Emoluments × Half-years (Max 33 × Emoluments, Cap ₹20L)
                  </td>
                  <td>Death in service.</td>
                </tr>
                <tr>
                  <td><strong>Commutation of Pension</strong></td>
                  <td>Lump-sum = 40% × Commuted Pension × 12 × Commutation Factor (based on age next birthday). Restored after <strong>15 years</strong>.</td>
                  <td>Rule 9 & 10 of Commutation Rules.</td>
                </tr>
              </table>
            </div>
          </div>

          <!-- Card 2: CPWA Code Essential Forms & Works Rules -->
          <div class="cheatsheet-card" id="cs_cpwa">
            <div class="cs-card-header">
              <span class="cs-icon">🏗️</span>
              <h3>2. CPWA Code Essential Forms & Works Accounts</h3>
            </div>
            <div class="cs-card-body">
              <table class="cs-table">
                <tr><th>Form No.</th><th>Title / Nomenclature</th><th>Codal Purpose & Audit Check</th></tr>
                <tr>
                  <td><strong>Form 23</strong></td>
                  <td>Measurement Book (MB)</td>
                  <td>Foundational voucher for all work measurements. Must be in indelible ink, page-numbered, checked 100% by JE, 10% by AE, 5% test checked by EE.</td>
                </tr>
                <tr>
                  <td><strong>Form 24</strong></td>
                  <td>First and Final Bill</td>
                  <td>Used for single-payment contracts or supply orders where no interim running payments occur.</td>
                </tr>
                <tr>
                  <td><strong>Form 26</strong></td>
                  <td>Running Account Bill (Lump-Sum Contracts)</td>
                  <td>Interim payments for lump sum contracts based on percentage progress certificates.</td>
                </tr>
                <tr>
                  <td><strong>Form 27</strong></td>
                  <td>Running Account Bill (Item-Rate Contracts)</td>
                  <td>Most common bill form for measurement-based civil works with previous vs up-to-date quantities.</td>
                </tr>
                <tr>
                  <td><strong>Form 83</strong></td>
                  <td>Monthly Account of Divisional Officer</td>
                  <td>Submitted to the Accountant General (A&E) by 10th of following month with Schedule of Works Expenditure (Form 64) and Cash Account.</td>
                </tr>
                <tr>
                  <td><strong>Form 65</strong></td>
                  <td>Schedule of Deposit Works</td>
                  <td>Accounts for funds deposited by non-governmental bodies or other departments; expenditure cannot exceed deposit received.</td>
                </tr>
              </table>
            </div>
          </div>

          <!-- Card 3: Accounting Standards Master Matrix (AS-1 to AS-29) -->
          <div class="cheatsheet-card" id="cs_as">
            <div class="cs-card-header">
              <span class="cs-icon">📊</span>
              <h3>3. Indian Accounting Standards (AS-1 to AS-29) & IGAS</h3>
            </div>
            <div class="cs-card-body">
              <div class="cs-tags-grid">
                <span class="as-tag"><strong>AS-1:</strong> Disclosure of Accounting Policies</span>
                <span class="as-tag"><strong>AS-2:</strong> Valuation of Inventories (Lower of Cost or NRV)</span>
                <span class="as-tag"><strong>AS-3:</strong> Cash Flow Statements (Operating, Investing, Financing)</span>
                <span class="as-tag"><strong>AS-4:</strong> Contingencies & Events After Balance Sheet</span>
                <span class="as-tag"><strong>AS-5:</strong> Net Profit/Loss, Prior Period & Accounting Changes</span>
                <span class="as-tag"><strong>AS-6:</strong> Depreciation Accounting (Withdrawn, merged into AS-10)</span>
                <span class="as-tag"><strong>AS-9:</strong> Revenue Recognition (Timing of transfer of risks/rewards)</span>
                <span class="as-tag"><strong>AS-10:</strong> Property, Plant & Equipment (PPE)</span>
                <span class="as-tag"><strong>AS-11:</strong> Effects of Changes in Foreign Exchange Rates</span>
                <span class="as-tag"><strong>AS-12:</strong> Accounting for Government Grants</span>
                <span class="as-tag"><strong>AS-13:</strong> Accounting for Investments (Current vs Long-term)</span>
                <span class="as-tag"><strong>AS-15:</strong> Employee Benefits (Actuarial valuation, gratuity)</span>
                <span class="as-tag"><strong>AS-16:</strong> Borrowing Costs (Capitalization criteria)</span>
                <span class="as-tag"><strong>AS-20:</strong> Earnings Per Share (Basic & Diluted EPS)</span>
                <span class="as-tag"><strong>AS-26:</strong> Intangible Assets (Amortization criteria)</span>
                <span class="as-tag"><strong>AS-28:</strong> Impairment of Assets (Recoverable Amount vs Carrying Amt)</span>
                <span class="as-tag"><strong>AS-29:</strong> Provisions, Contingent Liabilities & Contingent Assets</span>
              </div>
              <div style="margin-top:12px; border-top:1px solid var(--border); padding-top:8px;">
                <strong>Government Accounting Standards (GASAB / IGAS):</strong>
                <p style="margin:4px 0 0 0; font-size:0.86rem; color:var(--text-muted);">
                  • <strong>IGAS 1:</strong> Guarantees given by Governments (Disclosure requirements in Finance Accounts)<br>
                  • <strong>IGAS 2:</strong> Accounting & Classification of Grants-in-Aid (Capital vs Revenue treatment)<br>
                  • <strong>IGAS 3:</strong> Loans & Advances made by Governments (Detailed tracking & default reporting)
                </p>
              </div>
            </div>
          </div>

          <!-- Card 4: Constitutional Articles & FRBM Ratios -->
          <div class="cheatsheet-card" id="cs_const">
            <div class="cs-card-header">
              <span class="cs-icon">📜</span>
              <h3>4. Constitutional Articles & Fiscal Deficit Formulas</h3>
            </div>
            <div class="cs-card-body">
              <table class="cs-table">
                <tr><th>Article / Term</th><th>Subject & Codal Provision</th><th>Key Thresholds</th></tr>
                <tr>
                  <td><strong>Art. 112 / 202</strong></td>
                  <td>Annual Financial Statement (Budget)</td>
                  <td>Distinguishes revenue expenditure from capital expenditure; charged vs voted expenditure.</td>
                </tr>
                <tr>
                  <td><strong>Art. 114 / 204</strong></td>
                  <td>Appropriation Bill</td>
                  <td>No money shall be withdrawn from the Consolidated Fund of India/State without legislative enactment.</td>
                </tr>
                <tr>
                  <td><strong>Art. 268–271</strong></td>
                  <td>Tax Sharing & Divisible Pool</td>
                  <td>Central taxes shared with States based on Finance Commission recommendations (excluding cesses and surcharges).</td>
                </tr>
                <tr>
                  <td><strong>Art. 280</strong></td>
                  <td>Finance Commission</td>
                  <td>15th FC: 41% vertical devolution to States; horizontal formula (Income Distance 45%, Area 15%, Population 15%, Forest 10%, Demographic 12.5%, Tax Effort 2.5%).</td>
                </tr>
                <tr>
                  <td><strong>Fiscal Deficit (FD)</strong></td>
                  <td>Total Expenditure − Total Receipts (excluding borrowings). Reflects total net borrowing requirement.</td>
                  <td>FRBM Target: 3.0% of GDP.</td>
                </tr>
                <tr>
                  <td><strong>Revenue Deficit (RD)</strong></td>
                  <td>Revenue Expenditure − Revenue Receipts.</td>
                  <td>FRBM Target: Eliminate RD / Nil.</td>
                </tr>
                <tr>
                  <td><strong>Primary Deficit (PD)</strong></td>
                  <td>Fiscal Deficit − Interest Payments. Reflects current fiscal stance independent of past debt interest.</td>
                  <td>Measures current-year prudence.</td>
                </tr>
                <tr>
                  <td><strong>FRBM Debt Limits</strong></td>
                  <td>N.K. Singh Committee Recommendations.</td>
                  <td>Debt-to-GDP: Centre ≤ 40%, States ≤ 20%, Combined ≤ 60%.</td>
                </tr>
              </table>
            </div>
          </div>

        </div>
      </div>
    `;
  }

  window.filterCheatSheets = function(q) {
    const term = (q || "").toLowerCase().trim();
    const cards = document.querySelectorAll(".cheatsheet-card");
    cards.forEach(card => {
      if (!term) {
        card.style.display = "block";
      } else {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(term) ? "block" : "none";
      }
    });
  };

  // Run initialization when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initStudyTools);
  } else {
    initStudyTools();
  }

})();
