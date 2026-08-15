// ConfigurationPage.tsx — Superadmin-only approval workflow settings (horizontal layout)
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sliders,
  Save,
  Package,
  DollarSign,
  UserCheck,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  Clock,
} from 'lucide-react';
import { getWorkflowConfig, updateWorkflowConfig, type WorkflowConfig, type TicketEscalationStage } from '../api';
import { useAuth } from '../context/AuthContext';
import { useVobiSection } from '@/hooks/useVobiSection';

const ELIGIBLE_ROLES = [
  { value: 'noc_supervisor', label: 'NOC Supervisor' },
  { value: 'ts_supervisor', label: 'TS Supervisor' },
  { value: 'ip_supervisor', label: 'IP Supervisor' },
  { value: 'noc_manager', label: 'NOC Manager' },
  { value: 'ts_manager', label: 'TS Manager' },
  { value: 'ip_manager', label: 'IP Manager' },
  { value: 'finance_manager', label: 'Finance Manager' },
  { value: 'approver', label: 'Approver (legacy)' },
  { value: 'director', label: 'CTO / Director' },
  { value: 'finance', label: 'Finance' },
  { value: 'superadmin', label: 'System Admin' },
];

export default function ConfigurationPage() {
  const { user, isAdminSuper } = useAuth();
  const navigate = useNavigate();
  const [config, setConfig] = useState<WorkflowConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useVobiSection({
    id: 'material-config',
    title: 'Material Requests',
    help: 'Configure approval count and eligible material approvers. Requests use these rules before stock can be issued.',
    priority: 30,
  });
  useVobiSection({
    id: 'finance-config',
    title: 'Finance Requests',
    help: 'Set amount thresholds, finance approval stages, and when director approval is required.',
    priority: 29,
  });
  useVobiSection({
    id: 'ticket-escalation-config',
    title: 'Ticket Escalation Matrix',
    help: 'Control escalation timing and routing from NOC to managers, Relationship Officer, and Directors.',
    priority: 28,
  });
  useVobiSection({
    id: 'save-configuration',
    title: 'Save Configuration',
    help: 'Changes do not apply until Save configuration is clicked.',
    priority: 27,
  });

  useEffect(() => {
    const role = String(user?.main_role || user?.role || '').trim().toLowerCase();
    const canManageConfiguration = isAdminSuper || ['admin', 'superadmin'].includes(role);
    if (!canManageConfiguration) {
      navigate('/');
      return;
    }
    load();
  }, [navigate, user, isAdminSuper]);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getWorkflowConfig();
      setConfig({
        ...data,
        ticket_escalation: data.ticket_escalation || {
          enabled: true,
          stages: [
            { key: 'noc', label: 'NOC Unit', minutes: 30, target_roles: ['noc'] },
            { key: 'noc_manager', label: 'NOC Manager', minutes: 60, target_roles: ['noc_manager'] },
            { key: 'relationship_officer', label: 'Relationship Officer (R.O)', minutes: 120, target_roles: ['relationship_officer'] },
            { key: 'director', label: 'CTO / Directors', minutes: 0, target_roles: ['director', 'cto'] },
          ],
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      await updateWorkflowConfig(config);
      setSuccess('Configuration saved. Ticket escalation SLAs and approval workflows now use these settings.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const updateMaterial = (field: 'required_approvers_count' | 'eligible_approver_roles', value: number | string[]) => {
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            material: {
              ...prev.material,
              [field]: value,
            },
          }
        : null
    );
  };

  const toggleEligibleRole = (role: string) => {
    if (!config) return;
    const current = config.material.eligible_approver_roles || [];
    const next = current.includes(role)
      ? current.filter((r) => r !== role)
      : [...current, role];
    if (next.length === 0) return;
    updateMaterial('eligible_approver_roles', next);
  };

  const updateFinanceThresholds = (thresholds: WorkflowConfig['finance']['amount_thresholds']) => {
    setConfig((prev) =>
      prev ? { ...prev, finance: { ...prev.finance, amount_thresholds: thresholds } } : null
    );
  };

  const addThreshold = (type: 'below' | 'director') => {
    const thresholds = config?.finance?.amount_thresholds || [];
    if (type === 'below') {
      updateFinanceThresholds([
        ...thresholds,
        { max_amount: 1500, required_approvers: 2 },
      ]);
    } else {
      updateFinanceThresholds([
        ...thresholds,
        { min_amount: 1500, requires_director: true, required_approvers_before_director: 2 },
      ]);
    }
  };

  const removeThreshold = (index: number) => {
    const thresholds = [...(config?.finance?.amount_thresholds || [])];
    thresholds.splice(index, 1);
    updateFinanceThresholds(thresholds);
  };

  const updateThreshold = (
    index: number,
    field: 'max_amount' | 'min_amount' | 'required_approvers' | 'requires_director' | 'required_approvers_before_director',
    value: number | boolean
  ) => {
    const thresholds = [...(config?.finance?.amount_thresholds || [])];
    if (!thresholds[index]) return;
    thresholds[index] = { ...thresholds[index], [field]: value };
    updateFinanceThresholds(thresholds);
  };

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <Sliders className="h-9 w-9 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Configuration</h1>
            <p className="text-sm text-gray-500">
              Approval workflows, ticket escalation matrix, and operational settings (System Admin only).
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {saving ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Save className="h-5 w-5" />
          )}
          {saving ? 'Saving…' : 'Save configuration'}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-800">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="mb-6 p-4 rounded-lg bg-green-50 border border-green-200 text-green-800">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Material Requests — left column */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center gap-2 shrink-0">
            <Package className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Material Requests</h2>
          </div>
          <div className="p-6 flex flex-col gap-6">
            <div className="flex flex-row flex-wrap items-center gap-4">
              <label className="text-sm font-medium text-gray-700 shrink-0">Required approvers</label>
              <input
                type="number"
                min={1}
                max={10}
                value={config.material.required_approvers_count}
                onChange={(e) =>
                  updateMaterial(
                    'required_approvers_count',
                    Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1))
                  )
                }
                className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <span className="text-xs text-gray-500">e.g. 2, 3, or 5</span>
            </div>
            <div className="flex flex-row flex-wrap items-center gap-4">
              <span className="text-sm font-medium text-gray-700 shrink-0 flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                Eligible roles
              </span>
              <div className="flex flex-wrap gap-3">
                {ELIGIBLE_ROLES.map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.material.eligible_approver_roles.includes(value)}
                      onChange={() => toggleEligibleRole(value)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Finance Requests — right column */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center gap-2 shrink-0">
            <DollarSign className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Finance (Cash) Requests</h2>
          </div>
          <div className="p-6 flex flex-col gap-4 overflow-auto">
            <p className="text-sm text-gray-600">
              Amount-based rules. For high amounts you can require N approvers first, then Director. Director must approve last; if another approver approves after Director, Director must approve again.
            </p>
            <div className="space-y-3">
              {(config.finance.amount_thresholds || []).map((rule, index) => (
                <div
                  key={index}
                  className="flex flex-row flex-wrap items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200"
                >
                  {rule.requires_director ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500 whitespace-nowrap">Amount ≥</span>
                        <input
                          type="number"
                          min={0}
                          step={100}
                          value={rule.min_amount ?? ''}
                          onChange={(e) =>
                            updateThreshold(index, 'min_amount', parseFloat(e.target.value) || 0)
                          }
                          className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500 whitespace-nowrap">Approvers before Director</span>
                        <input
                          type="number"
                          min={0}
                          max={10}
                          value={rule.required_approvers_before_director ?? 0}
                          onChange={(e) =>
                            updateThreshold(
                              index,
                              'required_approvers_before_director',
                              Math.max(0, parseInt(e.target.value, 10) || 0)
                            )
                          }
                          className="w-16 rounded border border-gray-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                      <span className="text-xs text-gray-600">→ then Director must approve (last)</span>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500 whitespace-nowrap">Amount &lt;</span>
                        <input
                          type="number"
                          min={0}
                          step={100}
                          value={rule.max_amount ?? ''}
                          onChange={(e) =>
                            updateThreshold(index, 'max_amount', parseFloat(e.target.value) || 0)
                          }
                          className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500 whitespace-nowrap">Approvers</span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={rule.required_approvers ?? 2}
                          onChange={(e) =>
                            updateThreshold(
                              index,
                              'required_approvers',
                              Math.max(1, parseInt(e.target.value, 10) || 1)
                            )
                          }
                          className="w-16 rounded border border-gray-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => removeThreshold(index)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition ml-auto shrink-0"
                    title="Remove rule"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-row flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => addThreshold('below')}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Plus className="h-4 w-4" />
                Below amount
              </button>
              <button
                type="button"
                onClick={() => addThreshold('director')}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Plus className="h-4 w-4" />
                Director required
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2">
          <Clock className="h-5 w-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-gray-900">Ticket Escalation Matrix</h2>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">
            New tickets start at the first stage below. While still unassigned, each stage uses its{' '}
            <strong>Minutes until escalate</strong> value — the backend reads these times from this
            configuration (not hardcoded). Saving updates SLA timers on open unassigned tickets.
          </p>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={config.ticket_escalation?.enabled !== false}
              onChange={(e) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        ticket_escalation: {
                          ...prev.ticket_escalation!,
                          enabled: e.target.checked,
                          stages: prev.ticket_escalation?.stages || [],
                        },
                      }
                    : null
                )
              }
              className="rounded border-gray-300 text-indigo-600"
            />
            Enable automatic ticket escalation
          </label>
          {(config.ticket_escalation?.stages || []).map((stage, index) => (
            <div
              key={stage.key}
              className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 rounded-lg border border-gray-200 bg-gray-50"
            >
              <div>
                <label className="text-xs font-medium text-gray-500">Stage</label>
                <input
                  type="text"
                  value={stage.label}
                  onChange={(e) => {
                    const stages = [...(config.ticket_escalation?.stages || [])];
                    stages[index] = { ...stages[index], label: e.target.value };
                    setConfig((prev) =>
                      prev ? { ...prev, ticket_escalation: { ...prev.ticket_escalation!, stages } } : null
                    );
                  }}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Minutes until escalate</label>
                <input
                  type="number"
                  min={0}
                  value={stage.minutes}
                  onChange={(e) => {
                    const stages = [...(config.ticket_escalation?.stages || [])];
                    stages[index] = {
                      ...stages[index],
                      minutes: Math.max(0, parseInt(e.target.value, 10) || 0),
                    };
                    setConfig((prev) =>
                      prev ? { ...prev, ticket_escalation: { ...prev.ticket_escalation!, stages } } : null
                    );
                  }}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-gray-500">Target roles (comma-separated)</label>
                <input
                  type="text"
                  value={(stage.target_roles || []).join(', ')}
                  onChange={(e) => {
                    const stages = [...(config.ticket_escalation?.stages || [])];
                    stages[index] = {
                      ...stages[index],
                      target_roles: e.target.value.split(',').map((r) => r.trim()).filter(Boolean),
                    };
                    setConfig((prev) =>
                      prev ? { ...prev, ticket_escalation: { ...prev.ticket_escalation!, stages } } : null
                    );
                  }}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}