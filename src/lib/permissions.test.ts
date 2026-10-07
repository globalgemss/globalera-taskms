import {describe,expect,it} from 'vitest'
import {canManageTasks,canManageUsers,canReview} from './permissions'
describe('role affordances (server must independently authorize)',()=>{
 it('staff cannot access admin/manager write controls',()=>{expect(canManageTasks('staff')).toBe(false);expect(canManageUsers('staff')).toBe(false);expect(canReview('staff')).toBe(false)})
 it('manager can manage tasks but not accounts',()=>{expect(canManageTasks('manager')).toBe(true);expect(canManageUsers('manager')).toBe(false)})
 it('admin controls users and reviews',()=>{expect(canManageUsers('admin')).toBe(true);expect(canReview('admin')).toBe(true)})
})
