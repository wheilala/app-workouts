(function () {
  const data = window.WORKOUT_DATA;
  const selectedDay = document.querySelector("#selectedDay");
  const todayLabel = document.querySelector("#todayLabel");
  const daySummary = document.querySelector("#daySummary");
  const sourceNote = document.querySelector("#sourceNote");
  const printButton = document.querySelector("#printButton");
  const printWeekButton = document.querySelector("#printWeekButton");
  const areaGrid = document.querySelector("#areaGrid");
  const weeklySheet = document.querySelector("#weeklySheet");
  const calendarGrid = document.querySelector("#calendarGrid");
  const calendarTitle = document.querySelector("#calendarTitle");
  const previousMonth = document.querySelector("#previousMonth");
  const nextMonth = document.querySelector("#nextMonth");
  const workoutTemplate = document.querySelector("#workoutTemplate");
  const printWeek = document.querySelector("#printWeek");
  const progressPill = document.querySelector("#progressPill");

  const seasonStart = "2026-05-18";
  const seasonEnd = "2026-08-31";
  const storageKey = "finnFitnessProgress";
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const areaCopy = {
    strength: {
      icon: "STR",
      empty: "No strength assignment for this list.",
      rest: "Rest from strength work.",
      missing: "Focus assigned, but no detailed strength routine is in the workbook yet.",
    },
    technical: {
      icon: "TECH",
      empty: "No technical soccer assignment for this list.",
      rest: "Rest from technical soccer work.",
      missing: "Focus assigned, but no detailed technical routine is in the workbook yet.",
    },
    conditioning: {
      icon: "COND",
      empty: "No conditioning assignment for this list.",
      rest: "Rest from conditioning.",
      missing: "Focus assigned, but no detailed conditioning routine is in the workbook yet.",
    },
  };

  const state = {
    selectedDate: clampDate(getInitialDate(), seasonStart, seasonEnd),
    visibleMonth: monthKey(clampDate(getInitialDate(), seasonStart, seasonEnd)),
    printWeekStart: getInitialWeekStart(),
    templateDay: "",
    progress: [],
  };

  init();

  async function init() {
    if (!hasWorkoutData()) {
      selectedDay.textContent = "No workout data";
      daySummary.textContent = "Run refresh-workouts.ps1 to generate the workout data from the workbook.";
      areaGrid.innerHTML = "";
      calendarGrid.innerHTML = "";
      return;
    }

    populateTemplateOptions();
    populateWeekOptions();
    state.templateDay = getInitialTemplateDay();
    workoutTemplate.value = state.templateDay;
    printWeek.value = state.printWeekStart;
    loadProgress();
    bindEvents();
    render();
  }

  function hasWorkoutData() {
    return data && Array.isArray(data.days) && data.days.length > 0;
  }

  function bindEvents() {
    calendarGrid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-date]");
      if (!button || button.disabled) {
        return;
      }

      state.selectedDate = button.dataset.date;
      state.visibleMonth = monthKey(state.selectedDate);
      state.templateDay = getDefaultTemplateDay(state.selectedDate);
      workoutTemplate.value = state.templateDay;
      updateUrl();
      render();
    });

    workoutTemplate.addEventListener("change", () => {
      state.templateDay = workoutTemplate.value;
      updateUrl();
      render();
    });

    areaGrid.addEventListener("change", async (event) => {
      const checkbox = event.target.closest("[data-exercise-id]");
      if (!checkbox) {
        return;
      }

      await setExerciseComplete({
        date: state.selectedDate,
        templateDay: state.templateDay,
        areaKey: checkbox.dataset.areaKey,
        exerciseId: checkbox.dataset.exerciseId,
        completed: checkbox.checked,
      });
    });

    weeklySheet.addEventListener("change", async (event) => {
      const checkbox = event.target.closest("[data-week-exercise-id]");
      if (!checkbox) {
        return;
      }

      await setExerciseComplete({
        date: checkbox.dataset.date,
        templateDay: checkbox.dataset.templateDay,
        areaKey: checkbox.dataset.areaKey,
        exerciseId: checkbox.dataset.weekExerciseId,
        completed: checkbox.checked,
      });
    });

    printWeek.addEventListener("change", () => {
      state.printWeekStart = printWeek.value;
      updateUrl();
      renderWeeklySheet();
    });

    previousMonth.addEventListener("click", () => {
      state.visibleMonth = shiftMonth(state.visibleMonth, -1);
      renderCalendar();
    });

    nextMonth.addEventListener("click", () => {
      state.visibleMonth = shiftMonth(state.visibleMonth, 1);
      renderCalendar();
    });

    printButton.addEventListener("click", () => printWithMode("print-day-mode"));
    printWeekButton.addEventListener("click", () => printWithMode("print-week-mode"));
  }

  function populateTemplateOptions() {
    workoutTemplate.innerHTML = data.days
      .map((day) => `<option value="${escapeText(day.day)}">${escapeText(day.day)} list</option>`)
      .join("");
  }

  function populateWeekOptions() {
    printWeek.innerHTML = getSeasonWeeks()
      .map((weekStart) => {
        const weekEnd = clampDate(addDays(weekStart, 6), seasonStart, seasonEnd);
        const label = `${formatShortDate(parseDate(weekStart))} - ${formatShortDate(parseDate(weekEnd))}`;
        return `<option value="${escapeText(weekStart)}">${escapeText(label)}</option>`;
      })
      .join("");
  }

  function loadProgress() {
    state.progress = readLocalProgress();
  }

  function setExerciseComplete(record) {
    const updatedRecord = {
      ...record,
      completed: Boolean(record.completed),
      updatedAt: new Date().toISOString(),
    };

    upsertProgress(updatedRecord);
    writeLocalProgress();
    render();
  }

  function upsertProgress(record) {
    const index = state.progress.findIndex((item) => isSameProgressTarget(item, record));
    if (index >= 0) {
      state.progress[index] = record;
    } else {
      state.progress.push(record);
    }
  }

  function isSameProgressTarget(a, b) {
    return a.date === b.date
      && a.templateDay === b.templateDay
      && a.areaKey === b.areaKey
      && a.exerciseId === b.exerciseId;
  }

  function readLocalProgress() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "[]");
    } catch {
      return [];
    }
  }

  function writeLocalProgress() {
    localStorage.setItem(storageKey, JSON.stringify(state.progress));
  }

  function render() {
    const template = getTemplateDay(state.templateDay);
    const date = parseDate(state.selectedDate);
    const defaultTemplate = getDefaultTemplateDay(state.selectedDate);
    const totals = getTemplateTotals(state.selectedDate, state.templateDay);

    selectedDay.textContent = formatLongDate(date);
    todayLabel.textContent = state.selectedDate === todayIso() ? "Today" : "Selected date";
    daySummary.textContent = `${state.templateDay} workout list${state.templateDay === defaultTemplate ? "" : ` on a ${defaultTemplate}`}`;
    progressPill.textContent = `${totals.completed} of ${totals.total} complete`;
    sourceNote.textContent = buildSourceNote();

    renderCalendar();
    renderAreas(template);
    renderWeeklySheet();
  }

  function renderCalendar() {
    const [year, month] = state.visibleMonth.split("-").map(Number);
    const firstOfMonth = new Date(year, month - 1, 1);
    const startOffset = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells = [];

    calendarTitle.textContent = firstOfMonth.toLocaleDateString([], { month: "long", year: "numeric" });
    previousMonth.disabled = state.visibleMonth <= monthKey(seasonStart);
    nextMonth.disabled = state.visibleMonth >= monthKey(seasonEnd);

    for (let i = 0; i < startOffset; i++) {
      cells.push('<span class="calendar-spacer"></span>');
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const iso = toIsoDate(new Date(year, month - 1, day));
      const outOfSeason = iso < seasonStart || iso > seasonEnd;
      const selected = iso === state.selectedDate;
      const today = iso === todayIso();
      const status = getDateStatus(iso);
      cells.push(`
        <button
          class="calendar-day ${selected ? "is-selected" : ""} ${today ? "is-today" : ""} status-${status}"
          type="button"
          data-date="${iso}"
          ${outOfSeason ? "disabled" : ""}
          aria-pressed="${selected}">
          <span>${day}</span>
          <small>${statusLabel(status)}</small>
        </button>
      `);
    }

    calendarGrid.innerHTML = cells.join("");
  }

  function renderAreas(template) {
    areaGrid.innerHTML = template.areas.map(renderArea).join("");
  }

  function renderWeeklySheet() {
    const weekDates = getWeekDates(state.printWeekStart);
    const printableDates = weekDates.filter((date) => date >= seasonStart && date <= seasonEnd);
    const rangeStart = printableDates[0] || state.printWeekStart;
    const rangeEnd = printableDates[printableDates.length - 1] || state.printWeekStart;

    weeklySheet.innerHTML = `
      <div class="weekly-print-header">
        <div>
          <p>Finn Fitness</p>
          <h2>Week of ${escapeText(formatShortDate(parseDate(rangeStart)))} - ${escapeText(formatShortDate(parseDate(rangeEnd)))}</h2>
        </div>
        <div class="weekly-print-note">Check exercises as finished. Mark the day complete when everything assigned is done.</div>
      </div>
      <div class="weekly-category-row">
        <div class="weekly-row-label">Day</div>
        ${getWeeklyAreaKeys().map(renderWeeklyCategoryHeader).join("")}
      </div>
      ${weekDates.map(renderWeeklyDayRow).join("")}
    `;
  }

  function renderWeeklyCategoryHeader(areaKey) {
    const sampleArea = data.days
      .map((day) => findAreaForKey(day, areaKey))
      .find(Boolean) || { title: areaKey };
    return `<div class="weekly-category-heading weekly-category-${escapeText(areaKey)}">${escapeText(sampleArea.title)}</div>`;
  }

  function renderWeeklyDayRow(date) {
    const outOfSeason = date < seasonStart || date > seasonEnd;
    const parsed = parseDate(date);
    const templateDay = getDefaultTemplateDay(date);
    const totals = outOfSeason ? { total: 0, completed: 0 } : getTemplateTotals(date, templateDay);
    const complete = totals.total > 0 && totals.completed >= totals.total;
    return `
      <section class="weekly-assignment-row ${outOfSeason ? "is-out" : ""}">
        <div class="weekly-day-heading">
          <span class="paper-box ${complete ? "is-checked" : ""}" aria-label="${complete ? "Complete" : "Not complete"}"></span>
          <span>
            <strong>${escapeText(dayNames[parsed.getDay()])}</strong>
            <em>${escapeText(formatMonthDay(parsed))}</em>
          </span>
        </div>
        ${getWeeklyAreaKeys().map((areaKey) => renderWeeklyAreaDay(areaKey, date)).join("")}
      </section>
    `;
  }

  function renderWeeklyAreaDay(areaKey, date) {
    if (date < seasonStart || date > seasonEnd) {
      return `<div class="weekly-day-cell is-out"></div>`;
    }

    const templateDay = getDefaultTemplateDay(date);
    const area = findAreaForKey(getTemplateDay(templateDay), areaKey);
    if (!area || area.status === "empty") {
      return `
        <div class="weekly-day-cell">
          <div class="weekly-empty-state">None</div>
        </div>
      `;
    }
    if (area.status === "rest") {
      return `
        <div class="weekly-day-cell">
          <div class="weekly-empty-state">Rest</div>
        </div>
      `;
    }
    if (area.status === "no-routine") {
      return `
        <div class="weekly-day-cell">
          <div class="weekly-empty-state">${escapeText(area.focus || "Assigned")}</div>
        </div>
      `;
    }

    return `
      <div class="weekly-day-cell">
        ${area.exercises.map((exercise) => renderWeeklyExercise(date, templateDay, area, exercise)).join("")}
      </div>
    `;
  }

  function renderWeeklyExercise(date, templateDay, area, exercise) {
    const dose = formatDose(exercise);
    const completed = isExerciseComplete(date, templateDay, area.key, exercise.exerciseId);
    return `
      <label class="weekly-exercise ${completed ? "is-complete" : ""}">
        <input
          type="checkbox"
          data-date="${escapeText(date)}"
          data-template-day="${escapeText(templateDay)}"
          data-area-key="${escapeText(area.key)}"
          data-week-exercise-id="${escapeText(exercise.exerciseId)}"
          ${completed ? "checked" : ""}>
        <span>
          <strong>${escapeText(exercise.movement)}</strong>
          ${dose ? `<em>${escapeText(dose)}</em>` : ""}
        </span>
      </label>
    `;
  }

  function renderArea(area) {
    const copy = areaCopy[area.key] || areaCopy.strength;
    const focus = area.focus || "No assignment";

    return `
      <article class="area-card area-${escapeText(area.key)}">
        <header class="area-header">
          <div class="area-mark" aria-hidden="true">${copy.icon}</div>
          <div>
            <h3>${escapeText(area.title)}</h3>
            <p>${escapeText(focus)}</p>
          </div>
        </header>
        ${renderAreaBody(area, copy)}
      </article>
    `;
  }

  function renderAreaBody(area, copy) {
    if (area.status === "empty") {
      return `<div class="state-box">${escapeText(copy.empty)}</div>`;
    }

    if (area.status === "rest") {
      return `<div class="state-box rest-state">${escapeText(copy.rest)}</div>`;
    }

    if (area.status === "no-routine") {
      return `<div class="state-box missing-state">${escapeText(copy.missing)}</div>`;
    }

    return `
      <ol class="exercise-list">
        ${area.exercises.map((exercise) => renderExercise(area, exercise)).join("")}
      </ol>
    `;
  }

  function renderExercise(area, exercise) {
    const dose = formatDose(exercise);
    const hasDetails = exercise.target || dose;
    const completed = isExerciseComplete(state.selectedDate, state.templateDay, area.key, exercise.exerciseId);
    const video = exercise.embedUrl
      ? `
        <details class="video-panel">
          <summary>Video</summary>
          <div class="video-frame">
            <iframe
              src="${escapeText(exercise.embedUrl)}"
              title="${escapeText(exercise.movement)} video"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowfullscreen></iframe>
          </div>
          <a class="video-link" href="${escapeText(exercise.reference)}" target="_blank" rel="noopener noreferrer">
            Open in YouTube
          </a>
        </details>
      `
      : "";

    return `
      <li class="exercise-card ${completed ? "is-complete" : ""}">
        <label class="exercise-main">
          <input
            class="exercise-check"
            type="checkbox"
            data-area-key="${escapeText(area.key)}"
            data-exercise-id="${escapeText(exercise.exerciseId)}"
            ${completed ? "checked" : ""}>
          <span class="sequence">${escapeText(exercise.sequence || "")}</span>
          <span class="exercise-copy">
            <strong>${escapeText(exercise.movement)}</strong>
            ${hasDetails ? `
              <span class="exercise-meta">
                ${exercise.target ? `<span>${escapeText(exercise.target)}</span>` : ""}
                ${dose ? `<span>${escapeText(dose)}</span>` : ""}
              </span>
            ` : ""}
          </span>
        </label>
        ${video}
      </li>
    `;
  }

  function isExerciseComplete(date, templateDay, areaKey, exerciseId) {
    const record = state.progress.find((item) => (
      item.date === date
      && item.templateDay === templateDay
      && item.areaKey === areaKey
      && item.exerciseId === exerciseId
    ));
    return Boolean(record && record.completed);
  }

  function getTemplateTotals(date, templateDay) {
    const template = getTemplateDay(templateDay);
    let total = 0;
    let completed = 0;

    for (const area of template.areas) {
      if (area.status !== "assigned") {
        continue;
      }
      for (const exercise of area.exercises) {
        total += 1;
        if (isExerciseComplete(date, templateDay, area.key, exercise.exerciseId)) {
          completed += 1;
        }
      }
    }

    return { total, completed };
  }

  function getDateStatus(date) {
    const records = state.progress.filter((record) => record.date === date && record.completed);
    if (records.length === 0) {
      return "none";
    }

    const defaultTemplate = getDefaultTemplateDay(date);
    const totals = getTemplateTotals(date, defaultTemplate);
    if (totals.total > 0 && totals.completed >= totals.total) {
      return "complete";
    }
    return "partial";
  }

  function statusLabel(status) {
    if (status === "complete") {
      return "Done";
    }
    if (status === "partial") {
      return "Some";
    }
    return "";
  }

  function getTemplateDay(dayName) {
    return data.days.find((day) => day.day === dayName) || data.days[0];
  }

  function findAreaForKey(template, areaKey) {
    return template.areas.find((area) => area.key === areaKey);
  }

  function getWeeklyAreaKeys() {
    const keys = [];
    for (const day of data.days) {
      for (const area of day.areas) {
        if (!keys.includes(area.key)) {
          keys.push(area.key);
        }
      }
    }
    return keys;
  }

  function getDefaultTemplateDay(dateValue) {
    return dayNames[parseDate(dateValue).getDay()];
  }

  function getInitialDate() {
    const params = new URLSearchParams(window.location.search);
    return params.get("date") || todayIso();
  }

  function getInitialWeekStart() {
    const params = new URLSearchParams(window.location.search);
    const requestedWeek = params.get("week");
    if (requestedWeek) {
      return clampWeekStart(requestedWeek);
    }
    return clampWeekStart(getWeekStart(clampDate(getInitialDate(), seasonStart, seasonEnd)));
  }

  function getInitialTemplateDay() {
    const params = new URLSearchParams(window.location.search);
    const requestedTemplate = params.get("template");
    if (requestedTemplate && data.days.some((day) => day.day === requestedTemplate)) {
      return requestedTemplate;
    }
    return getDefaultTemplateDay(state.selectedDate);
  }

  function updateUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set("date", state.selectedDate);
    url.searchParams.set("template", state.templateDay);
    url.searchParams.set("week", state.printWeekStart);
    window.history.replaceState({}, "", url);
  }

  function printWithMode(mode) {
    document.body.classList.add(mode);
    const clearMode = () => {
      document.body.classList.remove(mode);
      window.removeEventListener("afterprint", clearMode);
    };
    window.addEventListener("afterprint", clearMode);
    window.print();
    window.setTimeout(clearMode, 2000);
  }

  function buildSourceNote() {
    const parts = [];
    if (data.sourceWorkbook) {
      parts.push(`Built from ${data.sourceWorkbook}`);
    }
    if (data.generatedAt) {
      parts.push(`Last refreshed ${formatGeneratedAt(data.generatedAt)}`);
    }
    parts.push("Checkmarks stay on this browser only");
    return `${parts.join(". ")}.`;
  }

  function formatDose(exercise) {
    const sets = exercise.sets;
    const reps = exercise.reps;

    if (sets && reps) {
      return `${sets} sets x ${reps}`;
    }
    if (sets) {
      return `${sets} sets`;
    }
    if (reps) {
      return `${reps} reps`;
    }
    return "";
  }

  function formatGeneratedAt(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value || "recently";
    }
    return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function formatLongDate(date) {
    return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  }

  function formatShortDate(date) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  function formatMonthDay(date) {
    return date.toLocaleDateString([], { month: "numeric", day: "numeric" });
  }

  function clampDate(value, min, max) {
    if (value < min) {
      return min;
    }
    if (value > max) {
      return max;
    }
    return value;
  }

  function shiftMonth(value, delta) {
    const [year, month] = value.split("-").map(Number);
    const date = new Date(year, month - 1 + delta, 1);
    return monthKey(toIsoDate(date));
  }

  function getSeasonWeeks() {
    const weeks = [];
    let cursor = seasonStart;
    while (cursor <= seasonEnd) {
      weeks.push(cursor);
      cursor = addDays(cursor, 7);
    }
    return weeks;
  }

  function getWeekDates(weekStart) {
    return Array.from({ length: 5 }, (_, index) => addDays(weekStart, index));
  }

  function getWeekStart(value) {
    const date = parseDate(value);
    const mondayOffset = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - mondayOffset);
    return toIsoDate(date);
  }

  function clampWeekStart(value) {
    const weekStart = getWeekStart(value);
    if (weekStart < seasonStart) {
      return seasonStart;
    }
    const weeks = getSeasonWeeks();
    if (weekStart > weeks[weeks.length - 1]) {
      return weeks[weeks.length - 1];
    }
    return weekStart;
  }

  function addDays(value, days) {
    const date = parseDate(value);
    date.setDate(date.getDate() + days);
    return toIsoDate(date);
  }

  function monthKey(value) {
    return value.slice(0, 7);
  }

  function todayIso() {
    return toIsoDate(new Date());
  }

  function parseDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function toIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function escapeText(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => {
      const replacements = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return replacements[char];
    });
  }
})();
