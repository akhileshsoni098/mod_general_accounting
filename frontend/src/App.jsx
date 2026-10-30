import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterTenantPage from './pages/RegisterTenantPage';
import WorkspaceSelectPage from './pages/WorkspaceSelectPage';
import TenantDashboardPage from './pages/TenantDashboardPage';
import UserManagementPage from './pages/UserManagementPage';
import ModuleConfigPage from './pages/ModuleConfigPage';
import GLWorkspacePage from './pages/GLWorkspacePage';

import FinanceCloseWorkspacePage from './pages/FinanceCloseWorkspacePage';
import CounterpartiesPage from './pages/CounterpartiesPage';
import OrganizationSettingsPage from './pages/OrganizationSettingsPage';
import EventDefinitionsPage from './pages/EventDefinitionsPage';
import PostingRulesPage from './pages/PostingRulesPage';
import EventSimulatorPage from './pages/EventSimulatorPage';
import RuleTestCasesPage from './pages/RuleTestCasesPage';
import ConfigBundlePage from './pages/ConfigBundlePage';
import EventOperationsPage from './pages/EventOperationsPage';
import DimensionsPage from './pages/DimensionsPage';
import InventoryWorkspacePage from './pages/InventoryWorkspacePage';
import CommercialWorkspacePage from './pages/CommercialWorkspacePage';
import RetailPosPage from './pages/RetailPosPage';
import RestaurantWorkspacePage from './pages/RestaurantWorkspacePage';
import KioskOrderingPage from './pages/KioskOrderingPage';
import HotelWorkspacePage from './pages/HotelWorkspacePage';
import ManufacturingWorkspacePage from './pages/ManufacturingWorkspacePage';
import PlatformAdminPage from './pages/PlatformAdminPage';
import CompanySelector from './components/CompanySelector';

import { useTheme } from './context/ThemeContext';
import {
  Boxes,
  ShieldCheck,
  Building2,
  Users,
  Sliders,
  LogOut,
  LayoutDashboard,
  BookOpen,
  Receipt,
  Percent,
  Landmark,
  CalendarCheck,
  ChevronDown,
  Layers,
  Users2,
  Shield,
  FileCode,
  Play,
  FileCheck,
  FolderSync,
  Activity,
  RotateCcw,
  Tags,
  Sun,
  Moon,
  ShoppingCart,
  UtensilsCrossed,
  Building,
  Factory,
  ShieldAlert
} from 'lucide-react';
import { authApi } from './services/api';

const TENANT_TYPE_BADGES = {
  ENTERPRISE: { label: 'Enterprise', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  RETAIL: { label: 'Retail & POS', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  HOSPITALITY: { label: 'Hospitality', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  MANUFACTURING: { label: 'Manufacturing', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  SERVICES: { label: 'Services', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
  WHOLESALE: { label: 'Wholesale', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' },
  OTHER: { label: 'General ERP', color: 'bg-slate-500/10 text-slate-400 border-slate-500/30' },
  CARRIER: { label: 'Enterprise', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  MGA: { label: 'Trading & Services', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  BROKER: { label: 'Retail & Agency', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' }
};

export default function App() {
  const { user, currentWorkspace, availableWorkspaces, currentCompany, roles, loading, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [authView, setAuthView] = useState('login'); // 'login' | 'register'
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showWorkspaceSwitcher, setShowWorkspaceSwitcher] = useState(false);
  const [clearingData, setClearingData] = useState(false);

  // Dynamic module enablement check for the active company set of books
  const isModuleEnabled = (moduleKey) => {
    if (!moduleKey) return true;
    const core = ['GL', 'BANKING_CASH', 'PARTIES', 'REPORTS'];
    if (core.includes(moduleKey)) return true;
    const companyModules = currentCompany?.enabled_modules;
    if (!Array.isArray(companyModules)) return false;
    return companyModules.includes(moduleKey);
  };

  // Redirect to dashboard if currently viewing a disabled module tab
  React.useEffect(() => {
    const tabModuleMap = {
      commercial: 'COMMERCIAL_BILLING',
      inventory: 'INVENTORY',
      finance_close: 'FINANCE_CLOSE',
      retail_pos: 'RETAIL_POS',
      restaurant: 'RESTAURANT',
      hotel: 'HOTEL_PMS',
      manufacturing: 'MANUFACTURING',
      event_definitions: 'RULES_ENGINE',
      posting_rules: 'RULES_ENGINE',
      event_simulator: 'RULES_ENGINE',
      event_operations: 'RULES_ENGINE',
      rule_tests: 'RULES_ENGINE',
      config_bundle: 'RULES_ENGINE',
      dimensions: 'DIMENSIONS'
    };

    const requiredModule = tabModuleMap[activeTab];
    if (requiredModule && !isModuleEnabled(requiredModule)) {
      setActiveTab('dashboard');
    }
  }, [currentCompany, activeTab]);

  const handleClearTestData = async () => {
    const confirmed = window.confirm(
      `⚠️ Clear Test Data for "${currentWorkspace?.name || 'this workspace'}"?\n\nThis will remove all test commercial vouchers, sales & purchase invoices, stock movements, bills, journals, and balances for this tenant.\n\nYour user account and workspace login will remain active.`
    );
    if (!confirmed) return;

    setClearingData(true);
    try {
      await authApi.resetDevData();
      alert('✅ Test data cleared successfully! Reloading clean workspace.');
      window.location.reload();
    } catch (err) {
      alert(`❌ Failed to clear test data: ${err.message}`);
    } finally {
      setClearingData(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-xs font-mono">Initializing TallyVeridex Cloud ERP Session...</p>
      </div>
    );
  }

  // Handle public customer-facing kiosk and table QR routes without authentication
  const currentPath = window.location.pathname;
  if (currentPath.startsWith('/kiosk/') || currentPath.startsWith('/order/table/')) {
    return <KioskOrderingPage />;
  }

  // Not authenticated
  if (!user) {
    if (authView === 'register') {
      return <RegisterTenantPage onSwitchToLogin={() => setAuthView('login')} />;
    }
    return <LoginPage onSwitchToRegister={() => setAuthView('register')} />;
  }

  // Modal for Workspace Switcher
  if (showWorkspaceSwitcher) {
    return (
      <WorkspaceSelectPage
        onProceed={() => {
          setShowWorkspaceSwitcher(false);
          setActiveTab('dashboard');
        }}
      />
    );
  }

  // Core Financial Modules Navigation (dynamically filtered by company configuration)
  const financialNavItems = [
    { id: 'dashboard', label: 'Dashboard & Business KPIs', icon: LayoutDashboard, module: 'GL' },
    { id: 'gl', label: 'General Ledger & Double-Entry', icon: BookOpen, module: 'GL' },
    { id: 'counterparties', label: 'Customers & Vendors', icon: Users2, module: 'PARTIES' },
    { id: 'commercial', label: 'Commercial Sales & Purchases (GST)', icon: Receipt, module: 'COMMERCIAL_BILLING' },
    { id: 'inventory', label: 'Inventory & Stock Masters', icon: Boxes, module: 'INVENTORY' },
    { id: 'finance_close', label: 'Finance Close & Period Lock', icon: CalendarCheck, module: 'FINANCE_CLOSE' }
  ].filter(item => isModuleEnabled(item.module));

  // Industry & Commercial Workspaces Navigation (conditionally visible)
  const industryNavItems = [
    { id: 'retail_pos', label: 'Retail POS Checkout', icon: ShoppingCart, module: 'RETAIL_POS' },
    { id: 'restaurant', label: 'Restaurant & Kitchen Orders', icon: UtensilsCrossed, module: 'RESTAURANT' },
    { id: 'hotel', label: 'Hotel PMS & Hospitality', icon: Building, module: 'HOTEL_PMS' },
    { id: 'manufacturing', label: 'Manufacturing & Assembly', icon: Factory, module: 'MANUFACTURING' }
  ].filter(item => isModuleEnabled(item.module));

  // Accounting Configuration & Rules-Driven Engine Navigation (conditionally visible)
  const rulesNavItems = [
    { id: 'posting_rules', label: 'Journal Entry Rules', icon: Sliders, module: 'RULES_ENGINE' },
    { id: 'dimensions', label: 'Accounting Dimensions', icon: Tags, module: 'DIMENSIONS' },
    { id: 'event_simulator', label: 'Event Simulator', icon: Play, module: 'RULES_ENGINE' },
    { id: 'event_definitions', label: 'Event Definitions', icon: FileCode, module: 'RULES_ENGINE' },
    { id: 'event_operations', label: 'Event Operations', icon: Activity, module: 'RULES_ENGINE' },
    { id: 'rule_tests', label: 'Rule Test Cases', icon: FileCheck, module: 'RULES_ENGINE' },
    { id: 'config_bundle', label: 'Configuration Bundle', icon: FolderSync, module: 'RULES_ENGINE' }
  ].filter(item => isModuleEnabled(item.module));

  // Administration Navigation (Role-Guarded)
  const isAdmin = roles.includes('TENANT_ADMIN') || user?.is_platform_admin;
  const adminNavItems = [
    { id: 'users', label: 'Users & Roles', icon: Users },
    { id: 'settings', label: 'Organization Settings', icon: Sliders },
    { id: 'modules', label: 'Business Modules & Setup', icon: Layers },
    ...(isAdmin ? [{ id: 'platform_admin', label: 'Platform Super Admin', icon: ShieldAlert }] : [])
  ];

  const tenantType = currentWorkspace?.tenant_type || 'ENTERPRISE';
  const typeBadge = TENANT_TYPE_BADGES[tenantType] || TENANT_TYPE_BADGES.ENTERPRISE;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-5 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2.5">
            <div className="h-8 w-8 bg-brand-600 rounded-lg flex items-center justify-center text-white font-bold shadow-md shadow-brand-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-white">TallyVeridex ERP</span>
              <span className="text-[10px] ml-2 px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">v4.6</span>
            </div>
          </div>

          {/* Active Tenant Display & Switcher */}
          <div className="relative">
            <button
              onClick={() => setShowWorkspaceSwitcher(true)}
              className="flex items-center space-x-2.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs transition"
              title="Click to switch active organization"
            >
              <Building2 className="w-3.5 h-3.5 text-brand-400" />
              <span className="font-semibold text-slate-200">{currentWorkspace?.name || 'Select Workspace'}</span>
              <span className={`px-1.5 py-0.2 text-[10px] font-mono font-semibold rounded border ${typeBadge.color}`}>
                {typeBadge.label}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </div>

          {/* Active Company Selector */}
          <CompanySelector />
        </div>

        {/* User Profile, Test Tools & Logout */}
        <div className="flex items-center space-x-3">
          {/* Day / Night Theme Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-medium transition cursor-pointer text-slate-200"
            title={theme === 'dark' ? 'Switch to Day Mode (Light Theme)' : 'Switch to Night Mode (Dark Theme)'}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[11px] font-medium text-slate-200">Day Mode</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-[11px] font-medium text-slate-700">Night Mode</span>
              </>
            )}
          </button>

          <button
            onClick={handleClearTestData}
            disabled={clearingData}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:text-rose-300 text-xs font-medium transition cursor-pointer"
            title="Reset test transactional data for this tenant workspace (Commercial documents, stock movements, journals, bills)"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${clearingData ? 'animate-spin' : ''}`} />
            <span>{clearingData ? 'Clearing...' : 'Clear Test Data'}</span>
          </button>

          <div className="text-right">
            <div className="text-xs font-semibold text-slate-200">
              {user.first_name} {user.last_name}
            </div>
            <div className="text-[11px] text-brand-400 font-mono font-medium">
              {roles.join(', ') || 'Staff Member'}
            </div>
          </div>
          <button
            onClick={logout}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/40 hover:text-rose-400 border border-slate-700 text-slate-400 transition"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Layout Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-64 border-r border-slate-800 bg-slate-900/40 p-4 space-y-6 shrink-0 flex flex-col justify-between">
          <div className="space-y-4">
            {/* Financial Modules Group */}
            <div className="space-y-1">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 px-3 mb-2">
                Financial Operations
              </div>
              {financialNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                      isActive
                        ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30 font-semibold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Commercial & Industry Workspaces Group (Only if any industry module enabled) */}
            {industryNavItems.length > 0 && (
              <div className="space-y-1 pt-2 border-t border-slate-800/80">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 px-3 mb-2">
                  Commercial & Industry
                </div>
                {industryNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                        isActive
                          ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30 font-semibold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Accounting Configuration Group (Only if rules engine or dimensions enabled) */}
            {rulesNavItems.length > 0 && (
              <div className="space-y-1 pt-2 border-t border-slate-800/80">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 px-3 mb-2">
                  Accounting Configuration
                </div>
                {rulesNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                        isActive
                          ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30 font-semibold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Administration Group (Role-Guarded) */}
            {isAdmin && (
              <div className="space-y-1 pt-2 border-t border-slate-800/80">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 px-3 mb-2">
                  Administration
                </div>
                {adminNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                        isActive
                          ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30 font-semibold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sidebar Footer: Active Workspace Badge */}
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs">
            <div className="text-slate-400 font-medium mb-1">Active Organization</div>
            <div className="text-[11px] text-brand-300 font-mono font-semibold flex items-center space-x-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400"></span>
              <span>{currentWorkspace?.tenant_code}</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1 capitalize">
              {typeBadge.label} Environment
            </div>
          </div>
        </aside>

        {/* Content View */}
        <main className="flex-1 p-8 overflow-y-auto max-w-7xl">
          {(() => {
            const tabModuleMap = {
              commercial: { key: 'COMMERCIAL_BILLING', name: 'Commercial Sales & Purchases (GST)' },
              inventory: { key: 'INVENTORY', name: 'Inventory & Stock Masters' },
              finance_close: { key: 'FINANCE_CLOSE', name: 'Finance Close & Period Lock' },
              retail_pos: { key: 'RETAIL_POS', name: 'Retail POS Checkout' },
              restaurant: { key: 'RESTAURANT', name: 'Restaurant & Kitchen Orders' },
              hotel: { key: 'HOTEL_PMS', name: 'Hotel PMS & Hospitality' },
              manufacturing: { key: 'MANUFACTURING', name: 'Manufacturing & Assembly' },
              event_definitions: { key: 'RULES_ENGINE', name: 'Event Definitions' },
              posting_rules: { key: 'RULES_ENGINE', name: 'Journal Entry Rules' },
              dimensions: { key: 'DIMENSIONS', name: 'Accounting Dimensions' },
              event_simulator: { key: 'RULES_ENGINE', name: 'Event Simulator' },
              event_operations: { key: 'RULES_ENGINE', name: 'Event Operations' },
              rule_tests: { key: 'RULES_ENGINE', name: 'Rule Test Cases' },
              config_bundle: { key: 'RULES_ENGINE', name: 'Configuration Bundle' }
            };

            const required = tabModuleMap[activeTab];
            if (required && !isModuleEnabled(required.key)) {
              return (
                <div className="p-8 max-w-xl mx-auto my-12 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-4 shadow-xl">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <h2 className="text-base font-bold text-white">Module Not Active</h2>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    The <strong className="text-slate-200">{required.name}</strong> module is currently disabled for <strong className="text-slate-200">{currentCompany?.company_name || 'this company'}</strong>.
                  </p>
                  <p className="text-[11px] text-slate-500">
                    You can enable this module anytime from Business Modules & Setup. Historical accounting data and records remain safely stored in the database.
                  </p>
                  <div className="pt-2 flex items-center justify-center space-x-3">
                    <button
                      onClick={() => setActiveTab('modules')}
                      className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition cursor-pointer"
                    >
                      Configure Business Modules
                    </button>
                    <button
                      onClick={() => setActiveTab('dashboard')}
                      className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer border border-slate-700"
                    >
                      Return to Dashboard
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <>
                {activeTab === 'dashboard' && <TenantDashboardPage onNavigateTab={setActiveTab} />}
                {activeTab === 'gl' && <GLWorkspacePage />}
                {activeTab === 'inventory' && <InventoryWorkspacePage />}
                {activeTab === 'commercial' && <CommercialWorkspacePage />}
                {activeTab === 'retail_pos' && <RetailPosPage />}
                {activeTab === 'restaurant' && <RestaurantWorkspacePage />}
                {activeTab === 'hotel' && <HotelWorkspacePage />}
                {activeTab === 'manufacturing' && <ManufacturingWorkspacePage />}

                {activeTab === 'finance_close' && <FinanceCloseWorkspacePage />}
                {activeTab === 'counterparties' && <CounterpartiesPage />}
                {activeTab === 'event_definitions' && <EventDefinitionsPage />}
                {activeTab === 'posting_rules' && <PostingRulesPage />}
                {activeTab === 'dimensions' && <DimensionsPage />}
                {activeTab === 'event_simulator' && <EventSimulatorPage />}
                {activeTab === 'event_operations' && <EventOperationsPage />}
                {activeTab === 'rule_tests' && <RuleTestCasesPage />}
                {activeTab === 'config_bundle' && <ConfigBundlePage />}
                {activeTab === 'users' && <UserManagementPage />}
                {activeTab === 'settings' && <OrganizationSettingsPage />}
                {activeTab === 'modules' && <ModuleConfigPage />}
                {activeTab === 'platform_admin' && <PlatformAdminPage />}
              </>
            );
          })()}
        </main>
      </div>
    </div>
  );
}
