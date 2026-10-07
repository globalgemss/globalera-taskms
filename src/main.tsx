import React from 'react'
import ReactDOM from 'react-dom/client'
import {BrowserRouter} from 'react-router-dom'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {Toaster} from 'sonner'
import App from './App'
import './style.css'
const queryClient=new QueryClient({defaultOptions:{queries:{staleTime:20_000,refetchOnWindowFocus:true,retry:1}}})
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><App/></BrowserRouter><Toaster position="top-right" richColors closeButton/></QueryClientProvider></React.StrictMode>)
