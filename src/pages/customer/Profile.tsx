// src/pages/customer/Profile.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerSidebar from '../../components/customer/CustomerSidebar';
import MobileBottomNav from '../../components/customer/MobileBottomNav';
import { User, Mail, Phone, MapPin, Calendar, Shield, Building2, Hash, Edit3 } from 'lucide-react';
import { API_URL } from '@/lib/api';

const Profile: React.FC = () => {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const token = localStorage.getItem('customer_token');
        if (!token) {
          navigate('/customer/login');
          return;
        }

        const res = await fetch(`${API_URL}/customer/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error('Failed to load profile');
        const data = await res.json();

        // Assuming the response has { customer: { ... } }
        setProfile(data.customer || data);
      } catch (err: any) {
        setError('Unable to load your profile. Please try again.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-600 mx-auto mb-6"></div>
          <p className="text-xl text-gray-700">Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-10 text-center max-w-md">
          <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-3">Access Denied</h2>
          <p className="text-gray-600 mb-8">{error || 'Profile not found'}</p>
          <button
            onClick={() => navigate('/customer/dashboard')}
            className="bg-blue-600 text-white px-8 py-3 rounded-xl hover:bg-blue-700 transition font-medium"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const memberSince = new Date(profile.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-gray-50 flex">
      {/* Desktop Sidebar */}
      <CustomerSidebar />

      {/* Main Content */}
      <div className="flex-1 md:ml-64 pb-20 md:pb-0">
        <div className="p-6 md:p-10">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-8 flex items-center">
              <User className="w-10 h-10 mr-4 text-blue-600" />
              My Profile
            </h1>

            {/* Profile Card */}
            <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
              {/* Header with Avatar */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-8 md:p-12 text-white">
                <div className="flex flex-col md:flex-row items-center md:items-end space-y-6 md:space-y-0">
                  <div className="relative">
                    <div className="w-32 h-32 bg-white/20 backdrop-blur rounded-full flex items-center justify-center border-4 border-white">
                      <User className="w-16 h-16 text-white" />
                    </div>
                    <button className="absolute bottom-0 right-0 bg-blue-500 p-3 rounded-full shadow-lg hover:bg-blue-400 transition">
                      <Edit3 className="w-5 h-5 text-white" />
                    </button>
                  </div>

                  <div className="md:ml-8 text-center md:text-left">
                    <h2 className="text-3xl font-bold">{profile.name}</h2>
                    <p className="text-blue-100 text-lg mt-2 flex items-center justify-center md:justify-start">
                      <Hash className="w-5 h-5 mr-2" />
                      Customer ID: <span className="font-mono font-semibold ml-2">{profile.customer_code}</span>
                    </p>
                    {profile.email && (
                      <p className="text-blue-100 mt-2 flex items-center justify-center md:justify-start">
                        <Mail className="w-5 h-5 mr-2" />
                        {profile.email}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Details Grid */}
              <div className="p-8 md:p-12">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Phone */}
                  {profile.phone && (
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                        <Phone className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-gray-500 text-sm">Phone Number</p>
                        <p className="text-xl font-semibold text-gray-800">{profile.phone}</p>
                      </div>
                    </div>
                  )}

                  {/* Project */}
                  {profile.project && (
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-gray-500 text-sm">Assigned Project</p>
                        <p className="text-xl font-semibold text-gray-800">{profile.project.name}</p>
                        <p className="text-sm text-gray-600 mt-1">Code: {profile.project.code}</p>
                      </div>
                    </div>
                  )}

                  {/* Member Since */}
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                      <Calendar className="w-6 h-6 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-gray-500 text-sm">Member Since</p>
                      <p className="text-xl font-semibold text-gray-800">{memberSince}</p>
                    </div>
                  </div>

                  {/* Account Status */}
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                      <Shield className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <p className="text-gray-500 text-sm">Account Status</p>
                      <p className="text-xl font-semibold text-green-600">Active & Verified</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Call to Action */}
            <div className="mt-10 text-center">
              <p className="text-gray-600 text-lg">
                Need to update your information? Contact support at{' '}
                <a href="mailto:support@company.com" className="text-blue-600 font-semibold hover:underline">
                  support@company.com
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
};

export default Profile;