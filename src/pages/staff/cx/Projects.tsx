// src/pages/staff/cx/Projects.tsx
import React, { useEffect, useState } from 'react';
import { Plus, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { getCXProjects, createCXProject } from '../../../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface Project {
  id: number;
  project_name: string;
  project_code: string;
  description: string | null;
  created_at: string;
}

const emptyProjectForm = { project_name: '', description: '' };

const ProjectsPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyProjectForm);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);

  const resetForm = () => {
    setOpen(false);
    setForm(emptyProjectForm);
  };

  const loadProjects = async () => {
    setListLoading(true);
    try {
      const data = await getCXProjects();
      setProjects(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load projects');
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.project_name.trim()) {
      toast.error('Project name is required');
      return;
    }

    setLoading(true);
    try {
      await createCXProject(form.project_name.trim(), form.description.trim());
      toast.success('Project created');
      resetForm();
      await loadProjects();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--content-bg)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">Projects</h1>
            <p className="mt-1 text-[var(--text-muted)]">Organize work under project codes for legacy ticket routing.</p>
          </div>
          <Button
            className="bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]"
            onClick={() => setOpen((v) => !v)}
          >
            <Plus className="mr-2 h-4 w-4" /> {open ? 'Close' : 'Add Project'}
          </Button>
        </div>

        {open && (
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
            <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">Add project</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Project Name *</Label>
                <Input
                  value={form.project_name}
                  onChange={(e) => setForm((f) => ({ ...f, project_name: e.target.value }))}
                  placeholder="e.g. VOBISS SOLUTION"
                  required
                />
              </div>
              <div>
                <Label>Description (optional)</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description"
                  rows={3}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={loading} className="bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]">
                  {loading ? 'Creating…' : 'Save project'}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Reset
                </Button>
              </div>
            </form>
          </div>
        )}

        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">All Projects</h2>
            <span className="text-sm text-[var(--text-muted)]">{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
          </div>
          {listLoading ? (
            <p className="px-5 py-10 text-center text-[var(--text-muted)]">Loading projects…</p>
          ) : projects.length === 0 ? (
            <p className="px-5 py-10 text-center text-[var(--text-muted)]">No projects yet. Add one above.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--border)] text-sm">
                <thead className="bg-[var(--surface-secondary)]">
                  <tr>
                    {['Code', 'Name', 'Description', 'Created'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {projects.map((project) => (
                    <tr key={project.id} className="hover:bg-[var(--surface-hover)]">
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-[var(--accent-green-light)] px-2 py-1 font-mono text-xs font-semibold text-[var(--primary)]">
                          {project.project_code}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{project.project_name}</td>
                      <td className="max-w-xs px-4 py-3 text-[var(--text-secondary)] truncate">
                        {project.description || '—'}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">
                        {new Date(project.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectsPage;
