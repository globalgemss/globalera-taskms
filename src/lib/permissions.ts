import type {Role} from './types'
export const canManageTasks=(role:Role)=>role==='admin'||role==='manager'
export const canManageUsers=(role:Role)=>role==='admin'
export const canReview=(role:Role)=>role==='admin'||role==='manager'
