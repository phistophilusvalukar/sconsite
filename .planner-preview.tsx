import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from './src/context/authContextCore';
import PlannerPage from './src/features/planner/PlannerPage';
import { supabase } from './src/config/database';
import { dateKey, type Snapshot, type Command } from './src/features/planner/model';
import './src/index.css';
import './src/site.css';
const userId='11111111-1111-4111-8111-111111111111';
const spaceId='22222222-2222-4222-8222-222222222222';
const listId='33333333-3333-4333-8333-333333333333';
const today=dateKey(new Date());
const state: Snapshot={ spaces:[{id:spaceId,name:'Everyday life',owner_id:userId,shared:true,invite_code:'44444444-4444-4444-8444-444444444444'}], members:[{space_id:spaceId,user_id:userId,name:'Alex'}],lists:[{id:listId,space_id:spaceId,title:'The grocery run'}],items:[{id:crypto.randomUUID(),list_id:listId,title:'Oat milk',done:true},{id:crypto.randomUUID(),list_id:listId,title:'Fresh fruit',done:false}],tasks:[{id:crypto.randomUUID(),space_id:spaceId,title:'Take a walk outside',starts_on:today,recurrence:'daily'},{id:crypto.randomUUID(),space_id:spaceId,title:'Plan the week ahead',starts_on:today,recurrence:'weekly'},{id:crypto.randomUUID(),space_id:spaceId,title:'Book a haircut',starts_on:today,recurrence:'once'}],completions:[]};
Object.defineProperty(supabase,'rpc',{value:async(name:string,args:{p_command?:Command}={})=>{
 const c=args.p_command;
 if(c?.type==='check_task') {state.completions=state.completions.filter(x=>x.task_id!==c.id || x.occurs_on!==c.date);if(c.done)state.completions.push({task_id:c.id,occurs_on:c.date});}
 if(c?.type==='check_item'){const item=state.items.find(x=>x.id===c.id);if(item)item.done=c.done;}
 if(c?.type==='add_item')state.items.push({id:crypto.randomUUID(),list_id:c.listId,title:c.title,done:false});
 if(c?.type==='create_list')state.lists.push({id:crypto.randomUUID(),space_id:c.spaceId,title:c.title});
 if(c?.type==='save_task')state.tasks.push({id:crypto.randomUUID(),space_id:c.spaceId,title:c.title,starts_on:c.startsOn,recurrence:c.recurrence});
 return {data:structuredClone(state),error:null};
}});
createRoot(document.getElementById('root')!).render(<AuthContext.Provider value={{user:{id:userId,username:'Alex',avatar:'',email:''},isAuthenticated:true,isLoading:false,error:null,login:async()=>{},logout:async()=>{},refreshUserProfile:async()=>{}}}><MemoryRouter><PlannerPage/></MemoryRouter></AuthContext.Provider>);
