// src/pages/cx/ProjectsPage.tsx
import React, { useEffect, useState } from 'react';
import { getCXProjects, createCXProject } from '../../../api';

interface Project {
  id: number;
  project_name: string;
  project_code: string;
  description: string | null;
  created_at: string;
}

const ProjectsPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const data = await getCXProjects();
      setProjects(data);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load projects' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    setLoading(true);
    setMessage(null);

    try {
      await createCXProject(projectName.trim(), description.trim());
      setProjectName('');
      setDescription('');
      setMessage({ type: 'success', text: 'Project created successfully!' });
      loadProjects();
      setTimeout(() => setMessage(null), 5000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to create project' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-6">Projects & Sites</h1>

      {message && (
        <div
          className={`px-5 py-4 rounded-lg mb-8 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Create Project Form */}
      <div className="bg-white rounded-xl shadow border border-gray-200 p-6 mb-10 shadow-[var(--shadow-md)]">
        <h2 className="text-2xl font-semibold text-gray-800 mb-5">Create New Project</h2>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project Name *
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Downtown Site, Warehouse B"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the project or site"
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-6 rounded-lg disabled:opacity-60 transition"
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>

      {/* Projects Table */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold text-gray-800">All Projects</h2>
          <span className="text-sm text-gray-500">{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
        </div>

        {projects.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center shadow-sm">
            <p className="text-gray-500">No projects yet. Create one above!</p>
          </div>
        ) : (
          <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl shadow-[var(--shadow-md)]">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {projects.map((project) => (
                  <tr key={project.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-mono font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded">
                        {project.project_code}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">{project.project_name}</td>
                    <td className="px-6 py-4 max-w-xs">
                      <div className="text-sm text-gray-700 truncate">
                        {project.description || <span className="text-gray-400">—</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
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
  );
};

export default ProjectsPage;