import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [currentWorkspace, setCurrentWorkspace] = useState(null);
  const [availableWorkspaces, setAvailableWorkspaces] = useState([]);
  const [currentCompany, setCurrentCompany] = useState(null);
  const [availableCompanies, setAvailableCompanies] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [entitlements, setEntitlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('veridex_token');
    if (token) {
      loadProfile();
    } else {
      setLoading(false);
    }
  }, []);

  async function loadProfile() {
    try {
      setLoading(true);
      const res = await authApi.getMe();
      if (res.success && res.data) {
        setUser(res.data.user);
        setCurrentWorkspace(res.data.current_workspace);
        setAvailableWorkspaces(res.data.available_workspaces || []);
        setCurrentCompany(res.data.current_company || null);
        setAvailableCompanies(res.data.available_companies || []);
        setRoles(res.data.roles || []);
        setPermissions(res.data.permissions || []);
        setEntitlements(res.data.entitlements || []);

        if (res.data.current_workspace) {
          localStorage.setItem('veridex_tenant_id', res.data.current_workspace.id);
        }
        if (res.data.current_company) {
          localStorage.setItem('veridex_company_id', res.data.current_company.id);
        } else if (res.data.available_companies && res.data.available_companies.length > 0) {
          localStorage.setItem('veridex_company_id', res.data.available_companies[0].id);
          setCurrentCompany(res.data.available_companies[0]);
        } else {
          localStorage.removeItem('veridex_company_id');
        }
      }
    } catch (err) {
      console.error('Failed to load user profile:', err);
      // If unauthorized, clear token and state
      localStorage.removeItem('veridex_token');
      localStorage.removeItem('veridex_tenant_id');
      localStorage.removeItem('veridex_company_id');
      setUser(null);
      setCurrentWorkspace(null);
      setCurrentCompany(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(email, password) {
    setError(null);
    try {
      const res = await authApi.login(email, password);
      if (res.success && res.data) {
        localStorage.setItem('veridex_token', res.data.token);
        if (res.data.active_workspace) {
          localStorage.setItem('veridex_tenant_id', res.data.active_workspace.id);
        }
        if (res.data.active_company) {
          localStorage.setItem('veridex_company_id', res.data.active_company.id);
        }
        await loadProfile();
        return res.data;
      }
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  async function registerTenant(payload) {
    setError(null);
    try {
      const res = await authApi.registerTenant(payload);
      if (res.success && res.data) {
        localStorage.setItem('veridex_token', res.data.token);
        localStorage.setItem('veridex_tenant_id', res.data.tenant.id);
        await loadProfile();
        return res.data;
      }
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  async function switchWorkspace(tenantId) {
    try {
      localStorage.removeItem('veridex_company_id');
      const res = await authApi.switchWorkspace(tenantId);
      if (res.success && res.data) {
        localStorage.setItem('veridex_token', res.data.token);
        localStorage.setItem('veridex_tenant_id', res.data.active_workspace.id);
        await loadProfile();
        return res.data;
      }
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  async function switchCompany(companyId, makeDefault = true) {
    try {
      const res = await authApi.switchCompany(companyId, makeDefault);
      if (res.success && res.data) {
        localStorage.setItem('veridex_company_id', res.data.active_company.id);
        setCurrentCompany(res.data.active_company);
        await loadProfile();
        return res.data;
      }
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  async function createCompany(payload) {
    try {
      const res = await authApi.createCompany(payload);
      if (res.success && res.data) {
        const newCmp = res.data.company;
        if (newCmp) {
          const newId = newCmp._id || newCmp.id;
          localStorage.setItem('veridex_company_id', newId);
        }
        await loadProfile();
        return res.data;
      }
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  async function updateCompany(companyId, payload) {
    try {
      const res = await authApi.updateCompany(companyId, payload);
      if (res.success && res.data) {
        await loadProfile();
        return res.data;
      }
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  function logout() {
    localStorage.removeItem('veridex_token');
    localStorage.removeItem('veridex_tenant_id');
    localStorage.removeItem('veridex_company_id');
    setUser(null);
    setCurrentWorkspace(null);
    setAvailableWorkspaces([]);
    setCurrentCompany(null);
    setAvailableCompanies([]);
    setRoles([]);
    setPermissions([]);
    setEntitlements([]);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        currentWorkspace,
        availableWorkspaces,
        currentCompany,
        availableCompanies,
        roles,
        permissions,
        entitlements,
        loading,
        error,
        login,
        registerTenant,
        switchWorkspace,
        switchCompany,
        createCompany,
        updateCompany,
        logout,
        reloadProfile: loadProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
