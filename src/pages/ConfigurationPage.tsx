// ConfigurationPage.tsx — Superadmin-only approval workflow settings (horizontal layout)
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sliders,
  Save,
  Package,
  DollarSign,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  Clock,
  Shield,
} from 'lucide-react';
import { getUsers, getWorkflowConfig, updateWorkflowConfig, type WorkflowConfig, type TicketEscalationStage } from '../api';
import { useAuth } from '../context/AuthContext';
import { useVobiSection } from '@/hooks/useVobiSection';
import { useToast } from '@/hooks/use-toast';
import {
  DEFAULT_TICKET_SLA,
  SLA_PRIORITY_META,
  type TicketSlaConfig,
  type TicketSlaPriorityKey,
  type SlaUnit,
} from '@/lib/ticketSla';
import { getWorkflowTimeConfig, saveWorkflowTimeConfig, type WorkflowTimeConfigRow } from '@/api/timeEngine';

type SrSlaFieldUnit = 'minutes' | 'hours' | 'days';
type SrSlaField = { value: number; unit: SrSlaFieldUnit };
interface SrSlaUnitState {
  expected: SrSlaField;
  warning: SrSlaField;
  critical: SrSlaField;
}

/** A Service Request can originate from Design or Sales, so the same real-world stage (e.g.
 *  "Design is working on it") is logged under two different workflow_type chains depending on
 *  which unit started the request — see workflowTimeEngine.js's DEFAULT_CONFIG comment. Each
 *  unit row here edits every underlying (workflow_type, stage_name) pair together so that
 *  duality never has to be explained to whoever is setting these times. */
const SERVICE_REQUEST_SLA_UNITS: { key: string; label: string; hint: string; pairs: [string, string][] }[] = [
  { key: 'design', label: 'Design Unit', hint: 'Surveying the site and preparing the material list', pairs: [['design_request', 'design'], ['sales_request', 'design']] },
  { key: 'sales', label: 'Sales Unit', hint: 'Reviewing a completed design survey before Project', pairs: [['design_request', 'sales']] },
  { key: 'project', label: 'Project Unit', hint: 'Coordinating the confirmed request', pairs: [['sales_request', 'project'], ['service_request', 'project']] },
  { key: 'ts', label: 'TX — Transmission', hint: 'Transmission technical review', pairs: [['service_request', 'ts_review']] },
  { key: 'ip', label: 'IP Unit', hint: 'IP provisioning review', pairs: [['service_request', 'ip_review']] },
  { key: 'noc', label: 'NOC Unit', hint: 'Final integration and approval', pairs: [['service_request', 'noc_review']] },
];

function minutesToSrField(minutes: number | null | undefined): SrSlaField {
  const m = Number(minutes) || 0;
  if (m > 0 && m % 1440 === 0) return { value: m / 1440, unit: 'days' };
  if (m > 0 && m % 60 === 0) return { value: m / 60, unit: 'hours' };
  return { value: m, unit: 'minutes' };
}
function srFieldToMinutes(field: SrSlaField): number {
  const multiplier = field.unit === 'days' ? 1440 : field.unit === 'hours' ? 60 : 1;
  return Math.max(1, Math.round(field.value * multiplier));
}

export default function ConfigurationPage() {
  const { user, isAdminSuper } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [config, setConfig] = useState<WorkflowConfig | null>(null);
  const [allUsers, setAllUsers] = useState<Array<{ id: number; first_name?: string; last_name?: string; username?: string; role?: string; position?: string | null; unit?: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSla, setSavingSla] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [srSla, setSrSla] = useState<Record<string, SrSlaUnitState>>({});
  const [loadingSrSla, setLoadingSrSla] = useState(true);
  const [savingSrSla, setSavingSrSla] = useState(false);

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
    id: 'ticket-sla-config',
    title: 'SLA Configuration',
    help: 'Set default first-response and resolution times by ticket priority. Applied when staff or customers pick a priority.',
    priority: 27,
  });
  useVobiSection({
    id: 'service-request-sla-config',
    title: 'Service Request SLA',
    help: 'Set how long each unit (Design, Sales, Project, TX, IP, NOC) has to act on a service request before it is flagged as breaching its SLA.',
    priority: 25,
  });
  useVobiSection({
    id: 'save-configuration',
    title: 'Save Configuration',
    help: 'Changes do not apply until Save configuration is clicked.',
    priority: 26,
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

  useEffect(() => {
    getUsers()
      .then((users) => setAllUsers(users))
      .catch(() => setAllUsers([]));
  }, []);

  // Only the true System Admin can save this (backend requires it — see timeEngine.js's
  // requireAdmin), so it's loaded/shown only for them rather than the broader company-scoped
  // 'admin' set canManageConfiguration already allows onto the rest of this page.
  useEffect(() => {
    if (!isAdminSuper) {
      setLoadingSrSla(false);
      return;
    }
    setLoadingSrSla(true);
    getWorkflowTimeConfig()
      .then((rows) => {
        const byPair = new Map<string, WorkflowTimeConfigRow>();
        for (const row of rows) byPair.set(`${row.workflow_type}:${row.stage_name}`, row);
        const next: Record<string, SrSlaUnitState> = {};
        for (const unit of SERVICE_REQUEST_SLA_UNITS) {
          const [wt, stage] = unit.pairs[0];
          const row = byPair.get(`${wt}:${stage}`);
          next[unit.key] = {
            expected: minutesToSrField(row?.expected_duration_minutes),
            warning: minutesToSrField(row?.warning_threshold_minutes),
            critical: minutesToSrField(row?.critical_threshold_minutes),
          };
        }
        setSrSla(next);
      })
      .catch(() => setSrSla({}))
      .finally(() => setLoadingSrSla(false));
  }, [isAdminSuper]);

  const updateSrSlaField = (unitKey: string, field: keyof SrSlaUnitState, patch: Partial<SrSlaField>) => {
    setSrSla((prev) => ({
      ...prev,
      [unitKey]: {
        ...prev[unitKey],
        [field]: { ...prev[unitKey]?.[field], ...patch },
      },
    }));
  };

  const handleSaveSrSla = async () => {
    setSavingSrSla(true);
    setError(null);
    setSuccess(null);
    try {
      const calls: Promise<unknown>[] = [];
      for (const unit of SERVICE_REQUEST_SLA_UNITS) {
        const state = srSla[unit.key];
        if (!state) continue;
        const expected = srFieldToMinutes(state.expected);
        const warning = srFieldToMinutes(state.warning);
        const critical = srFieldToMinutes(state.critical);
        for (const [workflow_type, stage_name] of unit.pairs) {
          calls.push(
            saveWorkflowTimeConfig({
              workflow_type,
              stage_name,
              expected_duration_minutes: expected,
              warning_threshold_minutes: warning,
              critical_threshold_minutes: critical,
              is_active: true,
            })
          );
        }
      }
      await Promise.all(calls);
      toast({
        title: 'Service Request SLA saved',
        description: 'Design, Sales, Project, TX, IP, and NOC will now be flagged if they hold a request past these times.',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save Service Request SLA');
    } finally {
      setSavingSrSla(false);
    }
  };

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getWorkflowConfig();
      setConfig({
        ...data,
        transport: data.transport || { approver_ids: [], supervisor_id: null },
        ticket_escalation: data.ticket_escalation || {
          enabled: true,
          stages: [
            { key: 'noc', label: 'NOC Unit', minutes: 30, target_roles: ['noc'] },
            { key: 'noc_manager', label: 'NOC Manager', minutes: 60, target_roles: ['noc_manager'] },
            { key: 'relationship_officer', label: 'Relationship Officer (R.O)', minutes: 120, target_roles: ['relationship_officer'] },
            { key: 'director', label: 'CTO / Directors', minutes: 0, target_roles: ['director', 'cto'] },
          ],
        },
        ticket_sla: (data.ticket_sla as TicketSlaConfig) || DEFAULT_TICKET_SLA,
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
      setSuccess('Configuration saved. Ticket escalation, SLA, and approval workflows now use these settings.');
      toast({ title: 'Configuration saved', description: 'Workflow and SLA settings are live.' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const updateMaterial = (field: 'required_approvers_count', value: number) => {
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

  const slaConfig: TicketSlaConfig = (config?.ticket_sla as TicketSlaConfig) || DEFAULT_TICKET_SLA;

  const updateSlaPriority = (
    key: TicketSlaPriorityKey,
    field: keyof TicketSlaConfig['priorities']['critical'],
    value: number | SlaUnit
  ) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const current = (prev.ticket_sla as TicketSlaConfig) || DEFAULT_TICKET_SLA;
      const rule = { ...current.priorities[key] };
      if (field === 'first_response_value' || field === 'resolution_value') {
        rule[field] = Math.max(1, Number(value) || 1);
      } else {
        rule[field] = value as SlaUnit;
      }
      return {
        ...prev,
        ticket_sla: {
          ...current,
          priorities: { ...current.priorities, [key]: rule },
        },
      };
    });
  };

  const handleSaveSla = async () => {
    if (!config) return;
    try {
      setSavingSla(true);
      setError(null);
      const saved = await updateWorkflowConfig(config);
      setConfig((prev) =>
        prev
          ? {
              ...prev,
              ...saved,
              ticket_sla: (saved.ticket_sla as TicketSlaConfig) || prev.ticket_sla || DEFAULT_TICKET_SLA,
            }
          : prev
      );
      toast({
        title: 'SLA settings saved',
        description: 'New tickets will use these response and resolution times by priority.',
      });
      setSuccess('SLA settings saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save SLA settings');
      toast({
        title: 'Save failed',
        description: e instanceof Error ? e.message : 'Could not save SLA settings',
        variant: 'destructive',
      });
    } finally {
      setSavingSla(false);
    }
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
        <section className="bg-white rounded-xl border border-gray-200 shadow-[var(--shadow-md)] overflow-hidden flex flex-col">
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
              <span className="text-xs text-gray-500">e.g. 2, 3, or 5. Approvers are chosen in Realm.</span>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 shadow-[var(--shadow-md)] overflow-hidden flex flex-col">
          <div className="px-6 py-4 bg-amber-50 border-b border-amber-200 flex items-center gap-2 shrink-0">
            <Shield className="h-5 w-5 text-amber-700" />
            <h2 className="text-lg font-semibold text-gray-900">Requests & Reference Linking</h2>
          </div>
          <div className="p-6 flex flex-col gap-4 text-sm text-gray-600">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Price per Litre (GHC)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 14.50 (Leave blank for manual entry)"
                value={config.transport?.price_per_litre ?? ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? null : parseFloat(e.target.value);
                  setConfig((prev) =>
                    prev
                      ? {
                          ...prev,
                          transport: {
                            ...prev.transport,
                            price_per_litre: val,
                          },
                        }
                      : prev
                  );
                }}
                className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Used to auto-calculate estimated amount in fuel requests (Quantity &times; Price per litre). Leave blank to allow manual entry.
              </p>
            </div>

            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Reference Linking</p>
              <p className="mb-3 text-xs text-gray-500">
                Whether at least one linked reference (a ticket, another request, etc.) must be attached before each form type can be submitted. Default is Optional.
              </p>
              {(
                [
                  { key: 'require_reference_link', label: 'Require reference link on Transport Requests' },
                  { key: 'require_reference_link_fuel', label: 'Require reference link on Fuel Requests' },
                  { key: 'require_reference_link_vehicle', label: 'Require reference link on Vehicle Rental Requests' },
                  { key: 'require_reference_link_cash', label: 'Require reference link on Cash Requests' },
                  { key: 'require_reference_link_material', label: 'Require reference link on Material Requests' },
                ] as const
              ).map(({ key, label }) => (
                <div key={key} className="mb-4 last:mb-0">
                  <label className="block text-sm font-medium text-gray-800">{label}</label>
                  <div className="mt-2 flex gap-2">
                    {(['optional', 'required'] as const).map((mode) => {
                      const selected = Boolean(config.transport?.[key]) === (mode === 'required');
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() =>
                            setConfig((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    transport: {
                                      ...prev.transport,
                                      approver_ids: prev.transport?.approver_ids || [],
                                      supervisor_id: prev.transport?.supervisor_id ?? null,
                                      [key]: mode === 'required',
                                    },
                                  }
                                : prev
                            )
                          }
                          className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize transition ${
                            selected ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {mode}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-gray-100">
              <p className="mb-2 text-xs text-gray-500">
Transport request approvers, supervisors, fuel request approvers, vehicle finance users, and cash/material request approvers are assigned in <span className="font-semibold text-gray-800">Realm</span> so they follow standard approval controls.
              </p>
              <button
                type="button"
                onClick={() => navigate('/realm')}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg text-xs font-semibold hover:bg-amber-200 transition"
              >
                Manage Approvers in Realm &rarr;
              </button>
            </div>
          </div>
        </section>

        {/* Finance Requests — right column */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-[var(--shadow-md)] overflow-hidden flex flex-col">
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

      <section className="mt-6 bg-white rounded-xl border border-gray-200 shadow-[var(--shadow-md)] overflow-hidden">
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

      <section className="mt-6 bg-white rounded-xl border border-gray-200 shadow-[var(--shadow-md)] overflow-hidden">
        <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-400" />
            <div>
              <h2 className="text-lg font-semibold text-white">SLA Configuration</h2>
              <p className="text-xs text-slate-300">
                Default first-response and resolution times by priority — applied when a ticket is created.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSaveSla}
            disabled={savingSla}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-400 disabled:opacity-50"
          >
            {savingSla ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {savingSla ? 'Saving…' : 'Save SLA Settings'}
          </button>
        </div>
        <div className="p-6 space-y-5">
          <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50">
            <input
              type="checkbox"
              checked={slaConfig.enabled !== false}
              onChange={(e) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        ticket_sla: {
                          ...((prev.ticket_sla as TicketSlaConfig) || DEFAULT_TICKET_SLA),
                          enabled: e.target.checked,
                        },
                      }
                    : null
                )
              }
              className="mt-1 rounded border-gray-300 text-emerald-600"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-900">Enable SLA Monitoring</span>
              <span className="block text-xs text-slate-600 mt-0.5">
                When on, tickets are tracked against these deadlines across the ERP. Deadlines are still
                stored on create when off, but monitoring is inactive.
              </span>
            </span>
          </label>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Priority</th>
                  <th className="px-4 py-3 font-semibold">Default First Response</th>
                  <th className="px-4 py-3 font-semibold">Default Resolution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(Object.keys(SLA_PRIORITY_META) as TicketSlaPriorityKey[]).map((key) => {
                  const meta = SLA_PRIORITY_META[key];
                  const rule = slaConfig.priorities[key];
                  return (
                    <tr key={key} className="bg-white">
                      <td className="px-4 py-4 align-middle">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${meta.badgeClass}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            value={rule.first_response_value}
                            onChange={(e) =>
                              updateSlaPriority(key, 'first_response_value', parseInt(e.target.value, 10) || 1)
                            }
                            className="w-20 rounded-lg border border-slate-300 px-2.5 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                          />
                          <select
                            value={rule.first_response_unit}
                            onChange={(e) => updateSlaPriority(key, 'first_response_unit', e.target.value as SlaUnit)}
                            className="rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white"
                          >
                            <option value="minutes">Minutes</option>
                            <option value="hours">Hours</option>
                            <option value="days">Days</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            value={rule.resolution_value}
                            onChange={(e) =>
                              updateSlaPriority(key, 'resolution_value', parseInt(e.target.value, 10) || 1)
                            }
                            className="w-20 rounded-lg border border-slate-300 px-2.5 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                          />
                          <select
                            value={rule.resolution_unit}
                            onChange={(e) => updateSlaPriority(key, 'resolution_unit', e.target.value as SlaUnit)}
                            className="rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white"
                          >
                            <option value="minutes">Minutes</option>
                            <option value="hours">Hours</option>
                            <option value="days">Days</option>
                          </select>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {isAdminSuper && (
        <section className="mt-6 bg-white rounded-xl border border-gray-200 shadow-[var(--shadow-md)] overflow-hidden">
          <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-emerald-400" />
              <div>
                <h2 className="text-lg font-semibold text-white">Service Request SLA</h2>
                <p className="text-xs text-slate-300">
                  How long each unit has to act on a service request — Design → Sales → Project → TX/IP/NOC — before it's flagged as a breach.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSaveSrSla}
              disabled={savingSrSla || loadingSrSla}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-400 disabled:opacity-50"
            >
              {savingSrSla ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {savingSrSla ? 'Saving…' : 'Save Service Request SLA'}
            </button>
          </div>
          <div className="p-6 space-y-5">
            {loadingSrSla ? (
              <div className="flex items-center justify-center py-10 text-slate-500">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Unit</th>
                      <th className="px-4 py-3 font-semibold">Expected time</th>
                      <th className="px-4 py-3 font-semibold">Warn after</th>
                      <th className="px-4 py-3 font-semibold">Breach after</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {SERVICE_REQUEST_SLA_UNITS.map((unit) => {
                      const state = srSla[unit.key];
                      if (!state) return null;
                      const fields: { key: keyof SrSlaUnitState; badge: string }[] = [
                        { key: 'expected', badge: 'bg-slate-100 text-slate-700' },
                        { key: 'warning', badge: 'bg-amber-100 text-amber-800' },
                        { key: 'critical', badge: 'bg-rose-100 text-rose-800' },
                      ];
                      return (
                        <tr key={unit.key} className="bg-white align-top">
                          <td className="px-4 py-4">
                            <span className="block text-sm font-semibold text-slate-900">{unit.label}</span>
                            <span className="block text-xs text-slate-500">{unit.hint}</span>
                          </td>
                          {fields.map(({ key }) => (
                            <td key={key} className="px-4 py-4">
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={1}
                                  value={state[key].value}
                                  onChange={(e) =>
                                    updateSrSlaField(unit.key, key, { value: Math.max(1, parseInt(e.target.value, 10) || 1) })
                                  }
                                  className="w-16 rounded-lg border border-slate-300 px-2.5 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                                />
                                <select
                                  value={state[key].unit}
                                  onChange={(e) => updateSrSlaField(unit.key, key, { unit: e.target.value as SrSlaFieldUnit })}
                                  className="rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white"
                                >
                                  <option value="minutes">Minutes</option>
                                  <option value="hours">Hours</option>
                                  <option value="days">Days</option>
                                </select>
                              </div>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-slate-500">
              Warnings and breaches notify the unit's manager/supervisor and appear on their workspace under "Needs your attention" — same mechanism already used for tickets, material requests, and transport.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
