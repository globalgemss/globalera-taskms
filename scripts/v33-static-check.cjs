const fs=require('fs'),path=require('path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');let checked=0,errors=[];
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,ent.name);if(ent.isDirectory())walk(f);else if(/\.tsx?$/.test(f)&&!f.endsWith('.d.ts')){checked++;const text=fs.readFileSync(f,'utf8'),file=ts.createSourceFile(f,text,ts.ScriptTarget.Latest,true,f.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);for(const diag of file.parseDiagnostics)errors.push(`${f}: ${ts.flattenDiagnosticMessageText(diag.messageText,' ')}`);}}}
walk(path.join(root,'src'));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const checks=[
 ['Work Updates route',read('src/App.tsx').includes('path="/work-updates"')],
 ['Holiday Admin only route',read('src/App.tsx').includes('path="/holidays" element={<Protected roles={[\'admin\']}')],
 ['Work Updates feed',read('src/pages/WorkUpdates.tsx').includes("kind:'Achievement'")],
 ['Kanban drag and drop',read('src/components/SmartKanbanBoard.tsx').includes('onDragStart')&&read('src/components/SmartKanbanBoard.tsx').includes('onDrop')],
 ['Mobile move to',read('src/components/SmartKanbanBoard.tsx').includes('availableMoves(t).map')],
 ['Unified task timeline',read('src/components/TaskActivity.tsx').includes('task_note_edits')],
 ['Task notes API',read('supabase/functions/task-api/index.ts').includes("case 'edit_task_note':")],
 ['Work Updates API',read('supabase/functions/task-api/index.ts').includes("case 'create_achievement':")],
 ['Notes RLS migration',read('supabase/migrations/202610080011_v33_work_updates_notes.sql').includes('task_note_edits_read')],
 ['Dashboard preview',read('src/pages/Dashboard.tsx').includes('Recently Completed Work')],
];
for(const [name,pass] of checks)if(!pass)errors.push('FAILED: '+name);
console.log(JSON.stringify({result:errors.length?'FAIL':'PASS',typescriptFiles:checked,featureChecks:checks.length,errors},null,2));process.exitCode=errors.length?1:0;