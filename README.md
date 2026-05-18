# Finn Fitness Workout Viewer

This is a static workout viewer generated from `..\Workout Plan Summer 2026.xlsx`.

## Refresh the data

Run this from the `app-workouts` folder after changing the workbook:

```powershell
powershell -ExecutionPolicy Bypass -File .\refresh-workouts.ps1
```

The script reads the `Schedule` and `Exercises` tabs and rewrites `data\workouts.js`.

## Open the viewer

Open `index.html` in a browser. The page defaults to the current date and includes the season calendar plus a workout-list selector.

Checkmarks are stored only in the current browser. There is no server or long-term workbook-backed progress tracking.

The app needs internet only for embedded YouTube videos and YouTube links.

## Hosting

The `app-workouts` folder can be hosted as static files, including on GitHub Pages. Refresh `data\workouts.js` from the workbook before publishing.

## Print a weekly assignment sheet

Use the `Week of` picker in the weekly assignment sheet, then click `Print week`.
The print view is designed for one landscape page with weekday rows, category columns, and checkboxes for each exercise.
