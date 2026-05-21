# Todo Center Implementation Plan

## Goal
Add a Todo Center sidebar page to the Electron file manager with creative dashboard design, category management, priority system, subtasks, 30-minute reminders with sound, and statistics.

## Architecture
- Main process: JSON file persistence + reminder IPC handlers
- Renderer: todo-manager.js module with IIFE pattern
- Data: stored in Electron userData/todos.json

## Design References
- Things 3: category grouping, clean cards
- Linear: priority color coding, minimal aesthetic
- TickTick: statistics dashboard
- Todoist: natural language quick-add
- Microsoft To Do: subtasks (steps)

## Files Modified/Created
1. main.js - Added 8 todo IPC handlers
2. preload.js - Exposed todo API to renderer
3. index.html - Added todo page HTML + sidebar nav entry
4. styles.css - Added 300+ lines of todo styles
5. todo-manager.js - Created complete todo module
6. renderer.js - Added TodoManager.init() call

## Features
- Ring progress chart (today completion rate)
- 4 stat cards: overdue, today, upcoming, completed
- Quick-add input with expandable detail panel
- Priority levels: low/medium/high/urgent
- Category management (add/delete/collapse)
- Filter views: all/today/upcoming/overdue/completed
- Subtask support with individual checkboxes
- 30-second reminder polling with 30-minute threshold
- Web Audio API synthesized notification sound
- System Notification API + in-app toast
- Nav badge for overdue count
- Bottom timeline of recently completed tasks

## Status: COMPLETE