import React, { useState } from 'react';
import { ArrowLeft, UserCheck, Building2, UserPlus, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AssignUser: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleAssign = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 md:p-10 flex items-center justify-center">
      <div className="max-w-xl w-full">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-400 hover:text-blue-600 font-bold text-xs uppercase tracking-widest mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Cancel Assignment
        </button>

        <div className="bg-white rounded-[32px] border border-slate-200 shadow-2xl overflow-hidden">
          <div className="bg-slate-900 p-10 text-white relative overflow-hidden">
            <div className="relative z-10">
              <UserCheck className="w-12 h-12 text-blue-400 mb-4" />
              <h2 className="text-3xl font-black tracking-tight">Assign Manager</h2>
              <p className="text-slate-400 mt-2 font-medium">Link a CX Staff member to a Customer Site.</p>
            </div>
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-blue-600/20 rounded-full blur-3xl"></div>
          </div>

          <form onSubmit={handleAssign} className="p-10 space-y-6">
            {success && (
              <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-2xl animate-in fade-in slide-in-from-top-2">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-bold text-sm">Assignment successfully saved!</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Select Staff Member</label>
              <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:bg-white transition-all font-semibold text-slate-700">
                <option>Choose CX Agent...</option>
                <option>Sarah Jenkins (Lead)</option>
                <option>Michael Chen (Agent)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Assign to Project/Site</label>
              <select className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:bg-white transition-all font-semibold text-slate-700">
                <option>Choose Site...</option>
                <option>MTN Data Center (VOB-992)</option>
                <option>Airtel HQ (VOB-112)</option>
              </select>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-lg tracking-tight transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <div className="h-6 w-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>Confirm Assignment <UserPlus className="w-5 h-5" /></>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AssignUser;