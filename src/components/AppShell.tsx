import React, { ReactNode, useState } from 'react';
import { 
  Building2, 
  TerminalSquare, 
  Settings, 
  Cpu, 
  BrainCircuit, 
  RadioTower,
  LineChart,
  LogOut,
  ChevronRight,
  Database,
  Waves,
  Sparkles,
  Dna,
  GraduationCap,
  LayoutGrid,
  Menu,
  Lock,
  X,
  SlidersHorizontal,
  Home
} from 'lucide-react';
import { BrandHeader } from './BrandLogo';
import { useContractStore } from '../lib/store';

interface AppShellProps {
  children: ReactNode;
  session: any;
  onLogout: () => void;
  tierInfo: any;
  onUpgradeClick: () => void;
  setShowAuthModal: (open: boolean) => void;
}

// Dynamic nav context. NavItem is hoisted to module scope (a stable component
// identity) and reads live values from here, so AppShell re-renders re-render the
// nav buttons instead of unmounting + remounting them (which restarted their
// transitions/focus every time the active tab changed).
interface NavCtxValue {
  activeTab: string;
  setActiveTab: (id: any) => void;
  isSidebarExpanded: boolean;
  closeMobile: () => void;
  session: any;
}
const NavCtx = React.createContext<NavCtxValue>({
  activeTab: 'home', setActiveTab: () => {}, isSidebarExpanded: false, closeMobile: () => {}, session: null,
});

function NavItem({ id, label, icon: Icon, adminOnly = false, activeColor = 'text-white', isMobile = false }: any) {
  const { activeTab, setActiveTab, isSidebarExpanded, closeMobile, session } = React.useContext(NavCtx);
  if (adminOnly && !(session?.is_super_admin || ['super_admin', 'owner', 'admin'].includes(session?.admin_role || ''))) {
    return null;
  }

  const isActive = activeTab === id;

  return (
    <button
      onClick={() => {
        setActiveTab(id);
        closeMobile();
      }}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-sm text-[10px] font-bold uppercase tracking-wider transition-colors border ${
        isActive
          ? adminOnly
            ? 'bg-rose-950/40 text-[#E5E5E5] border-rose-500/50'
            : 'bg-[#111] text-[#E5E5E5] border-zinc-700/50 shadow-[0_0_15px_rgba(255,255,255,0.03)]'
          : 'border-transparent text-zinc-500 hover:bg-[#111] hover:text-[#E5E5E5]'
      }`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${isActive ? (adminOnly ? 'text-rose-500' : activeColor) : ''}`} />
      <span className={`flex-1 text-left whitespace-nowrap overflow-hidden transition-all duration-300 ${isSidebarExpanded || isMobile ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0'}`}>{label}</span>
      {isActive && (isSidebarExpanded || isMobile) && <ChevronRight className="w-3 h-3 opacity-50 shrink-0" />}
    </button>
  );
}

export function AppShell({ children, session, onLogout, tierInfo, onUpgradeClick, setShowAuthModal }: AppShellProps) {
  const activeTab = useContractStore(s => s.activeTab);
  const setActiveTab = useContractStore(s => s.setActiveTab);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);

  const navCtxValue = React.useMemo<NavCtxValue>(() => ({
    activeTab,
    setActiveTab,
    isSidebarExpanded,
    closeMobile: () => setIsMobileMenuOpen(false),
    session,
  }), [activeTab, setActiveTab, isSidebarExpanded, session]);

  return (
    <NavCtx.Provider value={navCtxValue}>
    <div className="flex w-full h-full min-h-screen font-mono text-[#E5E5E5] bg-[#000000] overflow-hidden select-none antialiased">
      {/* Desktop Sidebar */}
      <aside 
        onMouseEnter={() => setIsSidebarExpanded(true)}
        onMouseLeave={() => setIsSidebarExpanded(false)}
        className={`bg-[#050505] border-r border-[#1F1F1F] flex-col hidden md:flex shrink-0 z-[100] h-full relative transition-[width] duration-300 ease-in-out ${isSidebarExpanded ? 'w-64' : 'w-16'}`}
      >
        <div className="p-4 border-b border-[#1F1F1F] h-[73px] flex items-center overflow-hidden">
          <div className="origin-left cursor-pointer transition-transform duration-300" style={{ transform: isSidebarExpanded ? 'scale(0.9)' : 'scale(0.9) translateX(-4px)' }} onClick={() => setActiveTab('home')}>
             <BrandHeader />
          </div>
        </div>
        
        <div 
          className="flex-1 overflow-y-auto px-2 py-4 flex flex-col gap-1.5 scrollbar-none scroll-smooth touch-pan-y overflow-x-hidden"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className={`text-[8px] text-zinc-600 font-black tracking-widest px-2 py-1 uppercase mb-1 whitespace-nowrap overflow-hidden transition-all duration-300 ${isSidebarExpanded ? 'opacity-100' : 'opacity-0 h-0 py-0 mb-0 pointer-events-none'}`}>
            Main Views
          </div>
          
          <NavItem id="home" label="Home" icon={Home} activeColor="text-[#F4F5F6]" />
          <NavItem id="skyvision" label="SkyVision" icon={Sparkles} activeColor="text-[#6A93B5]" />
          <NavItem id="pinpoint" label="Pinpoint GEX" icon={Dna} activeColor="text-[#C79350]" />
          <NavItem id="quant" label="Quant Lab" icon={LineChart} activeColor="text-[#D9A15C]" />
          <NavItem id="auditor" label="Trade History" icon={Database} />
          
          <div className={`text-[8px] text-zinc-600 font-black tracking-widest px-2 py-1 uppercase mt-4 mb-1 whitespace-nowrap overflow-hidden transition-all duration-300 ${isSidebarExpanded ? 'opacity-100' : 'opacity-0 h-0 py-0 mb-0 mt-0 pointer-events-none'}`}>
            Tools
          </div>

          <NavItem id="workspace" label="Workspace" icon={LayoutGrid} />
          <NavItem id="community" label="Community" icon={GraduationCap} activeColor="text-[#3F9C79]" />
          
          <div className="mt-auto pt-4 flex flex-col gap-1.5 border-t border-[#1F1F1F] mt-2">
            <NavItem id="settings" label="Settings" icon={SlidersHorizontal} />
            <NavItem id="admin" label="Admin Panel" icon={Lock} adminOnly />
          </div>
        </div>

        <div className={`p-4 border-t border-[#1F1F1F] bg-[#020202] overflow-hidden whitespace-nowrap transition-[padding] duration-300 ${isSidebarExpanded ? 'px-4' : 'px-2'}`}>
           {/* Tier Info */}
           <div 
             onClick={onUpgradeClick}
             className={`flex items-center gap-2.5 px-3 py-2 mb-3 bg-[#111] border border-[#1f1f1f] rounded-md cursor-pointer hover:border-zinc-700 transition-all font-mono mx-auto ${isSidebarExpanded ? 'w-full justify-start' : 'w-max justify-center'}`}
             title={!isSidebarExpanded ? tierInfo?.label : undefined}
           >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${tierInfo?.dotColor}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${tierInfo?.dotColor}`}></span>
              </span>
              <div className={`flex flex-col text-left transition-all duration-300 ${isSidebarExpanded ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0 overflow-hidden'}`}>
                <span className="text-[10px] font-black tracking-wider text-[#E5E5E5] truncate">{tierInfo?.label}</span>
                <span className="text-[8px] text-zinc-500 font-bold tracking-wider uppercase truncate">{tierInfo?.desc}</span>
              </div>
           </div>

           {session?.authenticated ? (
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 overflow-hidden flex-1">
                   {session.avatar && (
                     <img src={session.avatar} alt="Avatar" className="w-6 h-6 shrink-0 rounded-xs border border-[#1f1f1f]" referrerPolicy="no-referrer" />
                   )}
                   <span className={`text-[10px] font-black uppercase truncate text-zinc-400 transition-all duration-300 ${isSidebarExpanded ? 'opacity-100 max-w-[120px]' : 'opacity-0 max-w-0'}`}>{session.name}</span>
                </div>
                {isSidebarExpanded && (
                  <button onClick={onLogout} className="text-zinc-500 hover:text-amber-500 transition-colors p-1" title="Logout">
                    <LogOut className="w-4 h-4 shrink-0" />
                  </button>
                )}
             </div>
           ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className={`w-full px-3 py-2 border border-[#1f1f1f] hover:border-[#333] bg-black text-[#4ADE80] hover:text-[#E5E5E5] uppercase font-black transition-all flex items-center justify-center gap-1.5 text-[9px] rounded-xs cursor-pointer active:scale-95 ${isSidebarExpanded ? '' : 'px-0'}`}
                title="LOGIN"
              >
                {isSidebarExpanded ? 'LOGIN / CREATE ACCOUNT' : <Lock className="w-4 h-4" />}
              </button>
           )}
        </div>
      </aside>

      {/* Mobile Nav */}
      <div className="md:hidden fixed top-0 left-0 w-full z-[100] bg-[#050505] border-b border-[#1F1F1F] px-4 py-3 flex items-center justify-between">
         <div className="cursor-pointer scale-[0.85] origin-left" onClick={() => setActiveTab('home')}>
             <BrandHeader />
         </div>
         <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-zinc-400 p-1">
             {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
         </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 top-[57px] z-[90] bg-black/95 backdrop-blur-xl border-t border-[#1F1F1F] overflow-y-auto pb-20 touch-pan-y scroll-smooth"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="p-4 flex flex-col gap-2">
            <div className="text-[8px] text-zinc-600 font-black tracking-widest px-2 py-1 uppercase mb-2">
              Main Views
            </div>
            <NavItem id="home" label="Home" icon={Home} activeColor="text-[#F4F5F6]" isMobile />
            <NavItem id="skyvision" label="SkyVision" icon={Sparkles} activeColor="text-[#6A93B5]" isMobile />
            <NavItem id="pinpoint" label="Pinpoint GEX" icon={Dna} activeColor="text-[#C79350]" isMobile />
            <NavItem id="quant" label="Quant Lab" icon={LineChart} activeColor="text-[#D9A15C]" isMobile />
            <NavItem id="auditor" label="Trade History" icon={Database} isMobile />

            <div className="text-[8px] text-zinc-600 font-black tracking-widest px-2 py-1 uppercase mt-6 mb-2">
              Tools
            </div>

            <NavItem id="workspace" label="Workspace" icon={LayoutGrid} isMobile />
            <NavItem id="community" label="Community" icon={GraduationCap} activeColor="text-[#3F9C79]" isMobile />
            <NavItem id="settings" label="Settings" icon={SlidersHorizontal} isMobile />
            <NavItem id="admin" label="Admin Panel" icon={Lock} adminOnly isMobile />
            
            {session?.authenticated ? (
              <button 
                onClick={() => { onLogout(); setIsMobileMenuOpen(false); }} 
                className="w-full flex items-center gap-3 px-3 py-3 rounded-sm text-[10px] font-bold uppercase tracking-wider text-amber-500 bg-amber-500/10 border border-amber-500/20 mt-6 justify-center"
              >
                <LogOut className="w-4 h-4" /> LOGOUT
              </button>
            ) : (
              <button
                onClick={() => { setShowAuthModal(true); setIsMobileMenuOpen(false); }}
                className="w-full px-3 py-3 mt-6 border border-[#1f1f1f] bg-[#111] text-[#4ADE80] uppercase font-black transition-all flex items-center justify-center gap-1.5 text-[10px] rounded-sm tracking-widest"
              >
                LOGIN / CREATE ACCOUNT
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative bg-black md:pt-0 pt-[57px]">
        {children}
      </div>
    </div>
    </NavCtx.Provider>
  );
}
