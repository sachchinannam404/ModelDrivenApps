import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18.2.0";
import { createRoot } from "https://esm.sh/react-dom@18.2.0/client";
import { Gantt, ViewMode } from "https://esm.sh/gantt-task-react@0.3.9";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_DURATION_DAYS = 1;
const DEFAULT_CONFIG = {
  entityName: "new_task",
  nameColumn: "new_name",
  startColumn: "new_startdate",
  endColumn: "new_enddate",
  progressColumn: "new_progress",
  orderBy: "new_startdate asc",
  pageSize: 50,
  recordsPerPage: 50,
  maxRecords: null
};

const getClientUrl = () => window.Xrm?.Utility?.getGlobalContext?.().getClientUrl?.() ?? window.location.origin;
const addDays = (date, days) => new Date(date.getTime() + days * MS_PER_DAY);
const dayDiff = (start, end) => Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
const dateOnly = (date) => date.toISOString().slice(0, 10);

const parseDate = (value) => {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const clampProgress = (value) => {
  const numberValue = Number(value ?? 0);
  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.max(0, Math.min(100, numberValue));
};

const parseConfig = () => {
  const params = new URLSearchParams(window.location.search);
  const rawData = params.get("data");

  if (!rawData) {
    return DEFAULT_CONFIG;
  }

  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(decodeURIComponent(rawData)) };
  } catch (error) {
    throw new Error(`The Gantt web resource data parameter is not valid JSON: ${error.message}`);
  }
};

const buildQuery = (config) => {
  const selectedColumns = [config.nameColumn, config.startColumn, config.endColumn, config.progressColumn]
    .filter(Boolean)
    .join(",");
  const query = new URLSearchParams();
  query.set("$select", selectedColumns);
  if (config.maxRecords) {
    query.set("$top", String(config.maxRecords));
  }

  if (config.filter) {
    query.set("$filter", config.filter);
  }

  if (config.orderBy) {
    query.set("$orderby", config.orderBy);
  }

  return `?${query.toString()}`;
};

const getRecordId = (row, entityName) => {
  const idColumn = `${entityName}id`;
  const rawId = row[idColumn] ?? row[`${idColumn}`.toLowerCase()] ?? row.activityid;
  return String(rawId ?? "").replace(/[{}]/g, "");
};

const mapRowsToTasks = (rows, config) => rows.map((row) => {
  const start = parseDate(row[config.startColumn]) ?? new Date();
  const end = parseDate(row[config.endColumn]) ?? addDays(start, DEFAULT_DURATION_DAYS);

  return {
    id: getRecordId(row, config.entityName),
    name: String(row[config.nameColumn] ?? "Untitled task"),
    type: "task",
    start,
    end: end < start ? addDays(start, DEFAULT_DURATION_DAYS) : end,
    progress: clampProgress(row[config.progressColumn]),
    styles: { progressColor: "#4472c4", progressSelectedColor: "#2f5597" }
  };
}).filter((task) => task.id);

const retrieveTasks = async (config) => {
  const allRows = [];
  let nextQuery = buildQuery(config);

  if (window.Xrm?.WebApi) {
    do {
      const result = await window.Xrm.WebApi.retrieveMultipleRecords(
        config.entityName,
        nextQuery,
        config.pageSize ?? DEFAULT_CONFIG.pageSize
      );
      allRows.push(...result.entities);
      nextQuery = result.nextLink ?? "";
    } while (nextQuery && (!config.maxRecords || allRows.length < config.maxRecords));

    return mapRowsToTasks(config.maxRecords ? allRows.slice(0, config.maxRecords) : allRows, config);
  }

  let nextUrl = `${getClientUrl()}/api/data/v9.2/${config.entitySetName ?? config.entityName}s${nextQuery}`;
  do {
    const response = await fetch(nextUrl, {
      headers: {
        Accept: "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Prefer: `odata.maxpagesize=${config.pageSize ?? DEFAULT_CONFIG.pageSize}`
      }
    });

    if (!response.ok) {
      throw new Error(`Dataverse query failed with HTTP ${response.status}.`);
    }

    const payload = await response.json();
    allRows.push(...payload.value);
    nextUrl = payload["@odata.nextLink"] ?? "";
  } while (nextUrl && (!config.maxRecords || allRows.length < config.maxRecords));

  return mapRowsToTasks(config.maxRecords ? allRows.slice(0, config.maxRecords) : allRows, config);
};

const updateTaskDates = async (config, task) => {
  const payload = {
    [config.startColumn]: dateOnly(task.start),
    [config.endColumn]: dateOnly(task.end)
  };

  if (window.Xrm?.WebApi) {
    await window.Xrm.WebApi.updateRecord(config.entityName, task.id, payload);
    return;
  }

  const response = await fetch(`${getClientUrl()}/api/data/v9.2/${config.entitySetName ?? config.entityName}s(${task.id})`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Dataverse update failed with HTTP ${response.status}.`);
  }
};

const GanttApp = () => {
  const [config] = useState(parseConfig);
  const [tasks, setTasks] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState();
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState(ViewMode.Day);
  const [status, setStatus] = useState("Loading tasks...");
  const [error, setError] = useState("");

  const loadTasks = async () => {
    setError("");
    setStatus("Loading tasks...");
    try {
      const nextTasks = await retrieveTasks(config);
      setTasks(nextTasks);
      setCurrentPage(1);
      setSelectedTaskId((current) => current && nextTasks.some((task) => task.id === current) ? current : nextTasks[0]?.id);
      setStatus(nextTasks.length ? `${nextTasks.length} tasks loaded` : "No tasks found for this view configuration");
    } catch (loadError) {
      setError(loadError.message);
      setStatus("");
    }
  };

  useEffect(() => {
    void loadTasks();
  }, []);

  const recordsPerPage = config.recordsPerPage ?? DEFAULT_CONFIG.recordsPerPage;
  const totalPages = Math.max(1, Math.ceil(tasks.length / recordsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * recordsPerPage;
  const visibleTasks = useMemo(
    () => tasks.slice(pageStartIndex, pageStartIndex + recordsPerPage),
    [pageStartIndex, recordsPerPage, tasks]
  );
  const selectedTask = visibleTasks.find((task) => task.id === selectedTaskId) ?? visibleTasks[0];
  const chartStart = useMemo(
    () => visibleTasks.reduce((min, task) => task.start < min ? task.start : min, visibleTasks[0]?.start ?? new Date()),
    [visibleTasks]
  );
  const maxSliderDays = useMemo(
    () => Math.max(30, ...visibleTasks.map((task) => dayDiff(chartStart, task.end) + 30)),
    [chartStart, visibleTasks]
  );

  const changePage = (nextPage) => {
    const boundedPage = Math.min(Math.max(nextPage, 1), totalPages);
    const firstTaskOnPage = tasks[(boundedPage - 1) * recordsPerPage];
    setCurrentPage(boundedPage);
    setSelectedTaskId(firstTaskOnPage?.id);
  };

  const saveTask = async (task) => {
    setTasks((current) => current.map((item) => item.id === task.id ? task : item));
    setError("");
    setStatus(`Saving ${task.name}...`);

    try {
      await updateTaskDates(config, task);
      setStatus(`Saved ${task.name}`);
    } catch (saveError) {
      setError(saveError.message);
      setStatus("");
      await loadTasks();
    }
  };

  const moveSelectedDate = async (field, dayOffset) => {
    if (!selectedTask) {
      return;
    }

    const nextDate = addDays(chartStart, dayOffset);
    const nextTask = field === "start"
      ? { ...selectedTask, start: nextDate <= selectedTask.end ? nextDate : selectedTask.end }
      : { ...selectedTask, end: nextDate >= selectedTask.start ? nextDate : selectedTask.start };
    await saveTask(nextTask);
  };

  if (error) {
    return React.createElement("section", { className: "gantt-message gantt-error" }, error);
  }

  if (!tasks.length) {
    return React.createElement("section", { className: "gantt-message" }, status);
  }

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "div",
      { className: "gantt-toolbar" },
      React.createElement(
        "label",
        null,
        "View",
        React.createElement(
          "select",
          { value: viewMode, onChange: (event) => setViewMode(event.target.value) },
          React.createElement("option", { value: ViewMode.Day }, "Day"),
          React.createElement("option", { value: ViewMode.Week }, "Week"),
          React.createElement("option", { value: ViewMode.Month }, "Month")
        )
      ),
      React.createElement(
        "label",
        null,
        "Task",
        React.createElement(
          "select",
          { value: selectedTaskId, onChange: (event) => setSelectedTaskId(event.target.value) },
          visibleTasks.map((task) => React.createElement("option", { key: task.id, value: task.id }, task.name))
        )
      ),
      React.createElement("button", { type: "button", onClick: () => changePage(safeCurrentPage - 1), disabled: safeCurrentPage === 1 }, "Previous"),
      React.createElement("span", null, `Page ${safeCurrentPage} of ${totalPages}`),
      React.createElement("button", { type: "button", onClick: () => changePage(safeCurrentPage + 1), disabled: safeCurrentPage === totalPages }, "Next"),
      React.createElement("button", { type: "button", onClick: () => void loadTasks() }, "Refresh"),
      React.createElement("span", null, `${status} (${visibleTasks.length} shown)`)
    ),
    selectedTask && React.createElement(
      "div",
      { className: "gantt-slider-panel", "aria-label": "Selected task date sliders" },
      React.createElement(
        "label",
        null,
        `Start: ${dateOnly(selectedTask.start)}`,
        React.createElement("input", {
          type: "range",
          min: "0",
          max: maxSliderDays,
          value: dayDiff(chartStart, selectedTask.start),
          onChange: (event) => void moveSelectedDate("start", Number(event.target.value))
        })
      ),
      React.createElement(
        "label",
        null,
        `End: ${dateOnly(selectedTask.end)}`,
        React.createElement("input", {
          type: "range",
          min: "0",
          max: maxSliderDays,
          value: dayDiff(chartStart, selectedTask.end),
          onChange: (event) => void moveSelectedDate("end", Number(event.target.value))
        })
      )
    ),
    React.createElement(Gantt, {
      tasks: visibleTasks,
      viewMode,
      onDateChange: saveTask,
      onSelect: (task) => setSelectedTaskId(task.id),
      listCellWidth: "160px",
      columnWidth: viewMode === ViewMode.Month ? 160 : 60,
      ganttHeight: Math.max(360, visibleTasks.length * 50 + 80)
    })
  );
};

createRoot(document.getElementById("root")).render(React.createElement(GanttApp));
