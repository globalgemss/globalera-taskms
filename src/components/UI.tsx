import * as Dialog from '@radix-ui/react-dialog'
import {X,LoaderCircle,Search,Plus,ArrowRight,Inbox} from 'lucide-react'
import type {ReactNode,ButtonHTMLAttributes,InputHTMLAttributes,SelectHTMLAttributes,TextareaHTMLAttributes} from 'react'
import {labelColor} from '../lib/utils'
export function Btn({children,variant='primary',loading=false,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'secondary'|'ghost'|'danger',loading?:boolean}){
 return <button {...props} disabled={Boolean(props.disabled)||loading} className={`btn btn-${variant} ${props.className||''}`}>{loading?<LoaderCircle size={16} className="spin"/>:null}{children}</button>
}
export function Badge({children,value}:{children?:ReactNode,value?:string}){const str=String(value||children||'');return <span className={`badge badge-${labelColor(str)}`}>{children||value}</span>}
export function Card({children,className=''}:{children:ReactNode,className?:string}){return <div className={`card ${className}`}>{children}</div>}
export function PageTitle({title,description,action}:{title:string,description?:string,action?:ReactNode}){return <div className="page-heading"><div><h1>{title}</h1>{description&&<p>{description}</p>}</div><div className="page-action">{action}</div></div>}
export function Field({label,children,hint}:{label:string,children:ReactNode,hint?:string}){return <label className="field"><span className="field-label">{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
export function TextInput(props:InputHTMLAttributes<HTMLInputElement>){return <input {...props} className={`input ${props.className||''}`}/>}
export function TextArea(props:TextareaHTMLAttributes<HTMLTextAreaElement>){return <textarea {...props} className={`input textarea ${props.className||''}`}/>}
export function Select(props:SelectHTMLAttributes<HTMLSelectElement>){return <select {...props} className={`input select ${props.className||''}`}/>}
export function Surface({open,onOpenChange,title,description,children,footer,size='form'}:{open:boolean,onOpenChange:(v:boolean)=>void,title:string,description?:string,children:ReactNode,footer?:ReactNode,size?:'form'|'compact'|'wide'}){
 return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className={`dialog-content dialog-${size}`} aria-describedby={description?'modal-description':undefined}><div className="dialog-head"><div><Dialog.Title className="dialog-title">{title}</Dialog.Title>{description?<Dialog.Description id="modal-description">{description}</Dialog.Description>:null}</div><Dialog.Close aria-label="Close dialog" className="icon-button"><X size={20}/></Dialog.Close></div><div className="dialog-body">{children}</div>{footer?<div className="dialog-footer">{footer}</div>:null}</Dialog.Content></Dialog.Portal></Dialog.Root>
}
export function Empty({title='Nothing here yet',description='Data will appear here when available',action}:{title?:string,description?:string,action?:ReactNode}){return <div className="empty"><div className="empty-icon"><Inbox size={23}/></div><strong>{title}</strong><p>{description}</p>{action}</div>}
export function Loader(){return <div className="page-loading"><LoaderCircle className="spin" size={22}/><span>Loading…</span></div>}
export function SearchInput({value,onChange,placeholder='Search…'}:{value:string,onChange:(v:string)=>void,placeholder?:string}){return <div className="search-input"><Search size={17}/><input aria-label="Search" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></div>}
export function PrimaryLink({children,onClick}:{children:ReactNode,onClick:()=>void}){return <button className="text-link" type="button" onClick={onClick}>{children}<ArrowRight size={15}/></button>}
export function AddButton({onClick,children}:{onClick:()=>void,children:ReactNode}){return <Btn type="button" onClick={onClick}><Plus size={17}/>{children}</Btn>}
