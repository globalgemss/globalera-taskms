import {useQuery} from '@tanstack/react-query'
import {supabase} from './supabase'
import type {Profile,Project,Task,Notice,Followup} from './types'
export const keys={tasks:['tasks'],profiles:['profiles'],projects:['projects'],notices:['notices'],followups:['followups'],notifications:['notifications'],departments:['departments']}
export function useTasks(){return useQuery({queryKey:keys.tasks,queryFn:async()=>{const {data,error}=await supabase.from('tasks').select('*,projects(name),task_assignees(user_id,progress,profiles!task_assignees_user_id_fkey(full_name))').order('created_at',{ascending:false}).limit(300);if(error)throw error;return(data||[]) as Task[]}})}
export function useProfiles(){return useQuery({queryKey:keys.profiles,queryFn:async()=>{const {data,error}=await supabase.from('profiles').select('*,departments(name)').order('full_name').limit(300);if(error)throw error;return (data||[]) as Profile[]}})}
export function useProjects(){return useQuery({queryKey:keys.projects,queryFn:async()=>{const{data,error}=await supabase.from('projects').select('*').order('created_at',{ascending:false}).limit(300);if(error)throw error;return(data||[]) as Project[]}})}
export function useNotices(){return useQuery({queryKey:keys.notices,queryFn:async()=>{const{data,error}=await supabase.from('notices').select('*,notice_reads(user_id)').order('created_at',{ascending:false}).limit(200);if(error)throw error;return(data||[]) as Notice[]}})}
export function useFollowups(){return useQuery({queryKey:keys.followups,queryFn:async()=>{const{data,error}=await supabase.from('task_followups').select('*,tasks(task_no,title)').order('followup_at').limit(300);if(error)throw error;return(data||[]) as Followup[]}})}
export function useDepartments(){return useQuery({queryKey:keys.departments,queryFn:async()=>{const{data,error}=await supabase.from('departments').select('id,name').order('name');if(error)throw error;return data||[]}})}
export function useNotifications(){return useQuery({queryKey:keys.notifications,queryFn:async()=>{const{data,error}=await supabase.from('notifications').select('*').order('created_at',{ascending:false}).limit(60);if(error)throw error;return data||[]}})}
