import {Navigate,Route,Routes} from 'react-router-dom'
import {AuthProvider,useAuth} from './lib/auth'
import {configured} from './lib/supabase'
import {Shell} from './components/Shell'
import {Loader} from './components/UI'
import {Login,StaffLogin} from './pages/Login'
import Dashboard from './pages/Dashboard'
import Tasks,{TaskDetails} from './pages/Tasks'
import Users from './pages/Users'
import Projects from './pages/Projects'
import Followups from './pages/Followups'
import Notices from './pages/Notices'
import Reports from './pages/Reports'
import {ActivityLog,Settings} from './pages/Other'
function Protected({children,roles}:{children:React.ReactNode,roles?:string[]}){const{loading,profile}=useAuth();if(loading)return <Loader/>;if(!profile)return <Navigate replace to="/login"/>;if(roles&&!roles.includes(profile.role))return <Navigate replace to="/dashboard"/>;return <Shell>{children}</Shell>}
function RoutesImpl(){const{profile}=useAuth();return <Routes><Route path="/login" element={profile?<Navigate to="/dashboard"/>:<Login/>}/><Route path="/u/:token" element={<StaffLogin/>}/><Route path="/dashboard" element={<Protected><Dashboard/></Protected>}/><Route path="/tasks" element={<Protected><Tasks/></Protected>}/><Route path="/tasks/:id" element={<Protected><TaskDetails/></Protected>}/><Route path="/users" element={<Protected roles={['admin']}><Users/></Protected>}/><Route path="/projects" element={<Protected><Projects/></Protected>}/><Route path="/followups" element={<Protected><Followups/></Protected>}/><Route path="/notices" element={<Protected><Notices/></Protected>}/><Route path="/reports" element={<Protected roles={['admin','manager']}><Reports/></Protected>}/><Route path="/activity" element={<Protected roles={['admin']}><ActivityLog/></Protected>}/><Route path="/settings" element={<Protected><Settings/></Protected>}/><Route path="*" element={<Navigate to="/dashboard" replace/>}/></Routes>}
export default function App(){if(!configured)return <div className="setup-warning"><div className="brandmark">GE</div><h1>Global Era TaskMS</h1><p>Frontend is ready. Add Supabase configuration in <code>.env.local</code> to connect the database and authentication.</p><pre>VITE_SUPABASE_URL=...{'\n'}VITE_SUPABASE_PUBLISHABLE_KEY=...</pre><small>See README.md for new project setup.</small></div>;return <AuthProvider><RoutesImpl/></AuthProvider>}
