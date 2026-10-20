import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterTenantPage from './pages/RegisterTenantPage';
import WorkspaceSelectPage from './pages/WorkspaceSelectPage';
import TenantDashboardPage from './pages/TenantDashboardPage';
import UserManagementPage from './pages/UserManagementPage';
import ModuleConfigPage from './pages/ModuleConfigPage';
import GLWorkspacePage from './pages/GLWorkspacePage';
import BillingWorkspacePage from './pages/BillingWorkspacePage';
import TreasuryWorkspacePage from './pages/TreasuryWorkspacePage';
import CommissionsWorkspacePage from './pages/CommissionsWorkspacePage';
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
  CARRIER: { label: 'Carrier', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  MGA: { label: 'MGA', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  BROKER: { label: 'Broker', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  OTHER: { label: 'Enterprise', color: 'bg-slate-500/10 text-slate-400 border-slate-500/30' }
};

export default function App() {
  const { user, currentWorkspace, availableWorkspaces, roles, loading, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [authView, setAuthView] = useState('login'); // 'login' | 'register'
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showWorkspaceSwitcher, setShowWorkspaceSwitcher] = useState(false);
  const [clearingData, setClearingData] = useState(false);

  const handleClearTestData = async () => {
    const confirmed = window.confirm(
      `⚠️ Clear Test Data for "${currentWorkspace?.name || 'this workspace'}"?\n\nThis will remove all test Invoices, Payments, Installment Schedules, Billing Accounts, Journals, and Counterparties for this tenant.\n\nYour user account and workspace login will remain active.`
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
        <p className="text-xs font-mono">Initializing Veridex One SaaS Session...</p>
      </div>
    );
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

  // Core Financial Modules Navigation
  const financialNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'gl', label: 'General Ledger', icon: BookOpen },
    { id: 'inventory', label: 'Inventory & Stock Masters', icon: Boxes },
    { id: 'billing_ar', label: 'Billing & Accounts Receivable', icon: Receipt },
    { id: 'commissions_fiduciary', label: 'Commissions & Settlements', icon: Percent },
    { id: 'treasury_bank_rec', label: 'Treasury & Bank Reconciliation', icon: Landmark },
    { id: 'finance_close', label: 'Finance Close & Financial Reports', icon: CalendarCheck },
    { id: 'counterparties', label: 'Counterparties', icon: Users2 }
  ];

  // Industry & Commercial Workspaces Navigation
  const industryNavItems = [
    { id: 'commercial', label: 'Commercial Invoicing & GST', icon: Receipt },
    { id: 'retail_pos', label: 'Retail POS Checkout', icon: ShoppingCart },
    { id: 'restaurant', label: 'Restaurant & Kitchen Orders', icon: UtensilsCrossed },
    { id: 'hotel', label: 'Hotel PMS & Hospitality', icon: Building },
    { id: 'manufacturing', label: 'Manufacturing & Assembly', icon: Factory }
  ];

  // Accounting Configuration & Rules-Driven Engine Navigation
  const rulesNavItems = [
    { id: 'event_definitions', label: 'Event Definitions', icon: FileCode },
    { id: 'posting_rules', label: 'Journal Entry Rules', icon: Sliders },
    { id: 'dimensions', label: 'Accounting Dimensions', icon: Tags },
    { id: 'event_simulator', label: 'Event Simulator', icon: Play },
    { id: 'event_operations', label: 'Event Operations', icon: Activity },
    { id: 'rule_tests', label: 'Rule Test Cases', icon: FileCheck },
    { id: 'config_bundle', label: 'Configuration Bundle', icon: FolderSync }
  ];

  // Administration Navigation (Role-Guarded)
  const isAdmin = roles.includes('TENANT_ADMIN') || user?.is_platform_admin;
  const adminNavItems = [
    { id: 'users', label: 'Users & Roles', icon: Users },
    { id: 'settings', label: 'Organization Settings', icon: Sliders },
    { id: 'modules', label: 'Module Configuration', icon: Layers },
    ...(isAdmin ? [{ id: 'platform_admin', label: 'Platform Super Admin', icon: ShieldAlert }] : [])
  ];

  const tenantType = currentWorkspace?.tenant_type || 'MGA';
  const typeBadge = TENANT_TYPE_BADGES[tenantType] || TENANT_TYPE_BADGES.MGA;

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
              <span className="font-bold text-sm tracking-tight text-white">Veridex One</span>
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
            title="Reset test data for this tenant workspace (Invoices, Payments, Schedules, Journals, Counterparties)"
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

            {/* Commercial & Industry Workspaces Group */}
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

            {/* Accounting Configuration Group */}
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
          {activeTab === 'dashboard' && <TenantDashboardPage onNavigateTab={setActiveTab} />}
          {activeTab === 'gl' && <GLWorkspacePage />}
          {activeTab === 'inventory' && <InventoryWorkspacePage />}
          {activeTab === 'commercial' && <CommercialWorkspacePage />}
          {activeTab === 'retail_pos' && <RetailPosPage />}
          {activeTab === 'restaurant' && <RestaurantWorkspacePage />}
          {activeTab === 'hotel' && <HotelWorkspacePage />}
          {activeTab === 'manufacturing' && <ManufacturingWorkspacePage />}
          {activeTab === 'billing_ar' && <BillingWorkspacePage />}
          {activeTab === 'commissions_fiduciary' && <CommissionsWorkspacePage />}
          {activeTab === 'treasury_bank_rec' && <TreasuryWorkspacePage />}
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
        </main>
      </div>
    </div>
  );
}
