import fs from 'fs';
const read=p=>fs.readFileSync(p,'utf8');
const write=(p,d)=>fs.writeFileSync(p,d.replace(/\r\n/g,'\n'),'utf8');

let cats=read('src/renderer/pages/todo/categories.ts');
cats=cats.replace("import { showInputPrompt } from '../../components/modal';", "import { showInputPrompt, showModal } from '../../components/modal';");
cats=cats.replace("      if (catId && confirm('确定删除此分类？')) {\n        await ipcClient.todo.deleteCategory(catId);\n        await onRefresh();\n      }", "      if (catId) {\n        showModal({\n          title: '删除分类',\n          content: '确定要删除这个分类吗？删除后不会影响已有任务。',\n          actions: [\n            { label: '取消', type: 'secondary', onClick: () => {} },\n            { label: '删除', type: 'danger', onClick: async () => { await ipcClient.todo.deleteCategory(catId); await onRefresh(); } },\n          ],\n        });\n      }");
write('src/renderer/pages/todo/categories.ts', cats);

let task=read('src/renderer/pages/todo/task-list.ts');
task=task.replace("(subtasksTotal > 0 ? '<span class=\"todo-subtask-count\" data-action=\"toggle-subtasks\" data-id=\"' + task.id + '\">' + subtasksDone + '/' + subtasksTotal + '</span>' : '') +","(subtasksTotal > 0 ? '<span class=\"todo-subtask-count\" data-action=\"toggle-subtasks\" data-id=\"' + task.id + '\">' + subtasksDone + '/' + subtasksTotal + '</span>' : '') +\n      (subtasksTotal > 0 ? '<div class=\"todo-subtasks\" data-subtasks-of=\"' + task.id + '\">' + task.subtasks.map(st => '<label class=\"todo-subtask-item\"><input type=\"checkbox\" data-action=\"toggle-subtask\" data-task-id=\"' + task.id + '\" data-subtask-id=\"' + st.id + '\" ' + (st.done ? 'checked' : '') + '><span class=\"todo-subtask-text' + (st.done ? ' done' : '') + '\">' + esc(st.text) + '</span></label>').join('') + '</div>' : '')");
task=task.replace("    } else if (action === 'inline-edit') {", "    } else if (action === 'toggle-subtasks') {\n      const subtasksEl = area.querySelector('[data-subtasks-of=\"' + id + '\"]') as HTMLElement | null;\n      if (subtasksEl) subtasksEl.classList.toggle('show');\n    } else if (action === 'toggle-subtask') { const taskId = btn.dataset.taskId; const subtaskId = btn.dataset.subtaskId; if (taskId && subtaskId) { const store = getStore(); const task = store.data.tasks.find(t => t.id === taskId); const subtask = task?.subtasks?.find(s => s.id === subtaskId); if (task && subtask) { const nextDone = !(btn as HTMLInputElement).checked === false ? !(subtask.done) : !(subtask.done); await ipcClient.todo.updateTask(taskId, { subtasks: task.subtasks.map(s => s.id === subtaskId ? { ...s, done: !s.done } : s) }); await onRefresh(); } } } else if (action === 'inline-edit') {");
write('src/renderer/pages/todo/task-list.ts', task);

console.log('patched categories and subtasks');
