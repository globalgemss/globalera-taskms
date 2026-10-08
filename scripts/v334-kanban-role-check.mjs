// Run on Node.js 22+ with: node --experimental-strip-types scripts/v334-kanban-role-check.mjs
import assert from 'node:assert/strict'
import {allowedKanbanMoves,canDropTask} from '../src/components/kanbanRules.ts'
const task=(status,ids=['staff-A'])=>({status,task_assignees:ids.map(user_id=>({user_id}))})
const tests=[
 ['staff can drag Assigned to In Progress',()=>assert.deepEqual(allowedKanbanMoves(task('Assigned'),'staff','staff-A'),['In Progress'])],
 ['staff can drag On Hold/Waiting to In Progress',()=>{assert.equal(canDropTask(task('On Hold'),'In Progress','staff','staff-A'),true);assert.equal(canDropTask(task('Waiting'),'In Progress','staff','staff-A'),true)}],
 ['staff can drag In Progress to Review',()=>assert.deepEqual(allowedKanbanMoves(task('In Progress'),'staff','staff-A'),['Review'])],
 ['staff cannot move another staff task',()=>assert.deepEqual(allowedKanbanMoves(task('Assigned'),'staff','staff-B'),[])],
 ['staff cannot approve',()=>assert.equal(canDropTask(task('Review'),'Completed','staff','staff-A'),false)],
 ['staff cannot skip Started/Review steps',()=>assert.equal(canDropTask(task('Assigned'),'Completed','staff','staff-A'),false)],
 ['completed/cancelled tasks cannot move',()=>{assert.deepEqual(allowedKanbanMoves(task('Completed'),'staff','staff-A'),[]);assert.deepEqual(allowedKanbanMoves(task('Cancelled'),'staff','staff-A'),[])}],
 ['manager can drag In Progress to On Hold/Review',()=>assert.deepEqual(allowedKanbanMoves(task('In Progress'),'manager','manager-A'),['Assigned','Review'])],
 ['manager can request Review action',()=>assert.deepEqual(allowedKanbanMoves(task('Review'),'manager','manager-A'),['In Progress','Completed'])],
 ['unrecognized role is read-only',()=>assert.deepEqual(allowedKanbanMoves(task('Assigned'),'viewer','staff-A'),[])]
]
for(const [description,fn] of tests){fn();console.log('PASS',description)}
console.log(`${tests.length} Kanban role rules passed`)