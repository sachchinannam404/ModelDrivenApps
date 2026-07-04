# Model-driven app Gantt chart web resource

This repository contains a JavaScript/HTML web resource that can be added to a Microsoft Dataverse model-driven app page, dashboard, or form tab. It renders Dataverse task rows as an interactive Gantt chart using [`gantt-task-react`](https://matematuk.github.io/gantt-task-react/).

## Files to upload as web resources

| File | Suggested Dataverse web resource name | Type |
| --- | --- | --- |
| `webresources/ganttchart.html` | `new_/ganttchart.html` | Webpage (HTML) |
| `webresources/ganttchart.js` | `new_/ganttchart.js` | Script (JScript) |
| `webresources/ganttchart.css` | `new_/ganttchart.css` | Style Sheet (CSS) |

If you use different publisher prefixes or folder names, update the relative references in `ganttchart.html` before uploading.

## Dataverse columns

The web resource expects a task-like Dataverse table with these columns:

| Display name | Configuration key | Example logical name |
| --- | --- | --- |
| Name | `nameColumn` | `new_name` |
| Start Date | `startColumn` | `new_startdate` |
| End Date | `endColumn` | `new_enddate` |
| Progress | `progressColumn` | `new_progress` |

`Progress` should be a whole-number percentage from `0` to `100`.

## Configure the web resource data parameter

Pass JSON in the web resource `data` parameter to point the chart at your Dataverse table and columns:

```json
{
  "entityName": "new_task",
  "entitySetName": "new_tasks",
  "nameColumn": "new_name",
  "startColumn": "new_startdate",
  "endColumn": "new_enddate",
  "progressColumn": "new_progress",
  "orderBy": "new_startdate asc",
  "top": 100
}
```

Optional keys:

- `filter`: OData `$filter` expression, for example `statecode eq 0`.
- `orderBy`: OData `$orderby` expression.
- `top`: maximum number of tasks to show.
- `entitySetName`: plural entity set name used only by the fallback REST path. Inside model-driven apps, `Xrm.WebApi` uses `entityName`.

## Behavior

- Loads Dataverse rows through `Xrm.WebApi.retrieveMultipleRecords`.
- Displays rows in a Gantt chart with Day, Week, and Month views.
- Lets users adjust dates by dragging Gantt bars or by using Start and End sliders for the selected task.
- Saves changed dates back to Dataverse with `Xrm.WebApi.updateRecord`.
- Includes a fallback direct Web API path for browser testing when `Xrm.WebApi` is unavailable.

## Local/static smoke test

Open `webresources/ganttchart.html` in a browser to verify that the web resource shell loads. Dataverse data loading requires a model-driven app context or authenticated Dataverse Web API access.
