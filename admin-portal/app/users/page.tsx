"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users as UsersIcon, Plus, Trash2, Edit2, Mail, Phone, Shield, Check, X, Search } from "lucide-react";
import { apiBase } from "@/lib/api";
import { getTenantSlugFromHost } from "@/lib/tenant";

interface User {
  user_id: string;
  email: string;
  name: string | null;
  cellnumber: string | null;
  role: string;
  team: string | null;
  status: string;
  created_at: string | null;
}

export default function UserManagementPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string>("");
  
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    cellnumber: "",
    role: "Staff",
    team: "",
    password: "",
  });
  const [editFormData, setEditFormData] = useState({
    name: "",
    cellnumber: "",
    role: "Staff",
    team: "",
    status: "active",
  });

  useEffect(() => {
    // Only accessible on apex (SuperAdmin); if on tenant subdomain, bounce to apex
    try {
      const host = window.location.hostname;
      const slug = getTenantSlugFromHost(host);
      if (slug) {
        window.location.href = "https://digitalchain.in/users";
        return;
      }
    } catch {}

    // Check auth
    const role = localStorage.getItem("dc_role");
    const accessToken = localStorage.getItem("dc_access");

    if (!accessToken || role !== "SuperAdmin") {
      // Ensure we don't leave the page stuck on a loading screen while navigating
      setLoading(false);
      router.push("/login");
      return;
    }

    setToken(accessToken);
    fetchUsers(accessToken);
  }, [router]);

  // Watchdog: if we're still loading after 12s, surface a helpful error and a retry button.
  useEffect(() => {
    const watchdog = setTimeout(() => {
      if (loading) {
        setError(
          "The page is taking longer than expected. Client scripts may not have loaded or the API may be unreachable."
        );
        setLoading(false);
      }
    }, 12000);
    return () => clearTimeout(watchdog);
  }, [loading]);

  const fetchUsers = async (accessToken: string) => {
    try {
      const base = apiBase();
      const url = `${base}superadmin/users`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const res = await fetch(url, {
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!res.ok) {
        if (res.status === 401) {
          setError("Unauthorized - please login again");
          router.push("/login");
          return;
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.error("Request timeout - API server is not responding");
        setError("Connection timeout - API server is not responding. Please check your network connection.");
      } else {
        console.error("Error fetching users:", err);
        setError(err.message || "Failed to load users. Please try again later.");
      }
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email || !formData.name || !formData.cellnumber) {
      alert("Please fill all required fields");
      return;
    }

    try {
      const base = apiBase();
      const res = await fetch(`${base}superadmin/users/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...formData,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to create user");
      }
      const payload = await res.json().catch(() => ({}));
      const temp = payload?.temp_password;
      await fetchUsers(token);
  setShowForm(false);
  setFormData({ name: "", email: "", cellnumber: "", role: "Staff", team: "", password: "" });
      if (temp) {
        try {
          await navigator.clipboard.writeText(temp);
          alert(`User created. Temporary password (copied): ${temp}`);
        } catch {
          alert(`User created. Temporary password: ${temp}`);
        }
      } else {
        alert("User created successfully!");
      }
    } catch (err: any) {
      console.error("Error creating user:", err);
      alert(`Error: ${err.message}`);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;

    try {
      const base = apiBase();
      const res = await fetch(`${base}superadmin/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Failed to delete user");
      }

      await fetchUsers(token);
      alert("User deleted successfully!");
    } catch (err: any) {
      console.error("Error deleting user:", err);
      alert(`Error: ${err.message}`);
    }
  };

  const openEditModal = (user: User) => {
    setEditingId(user.user_id);
    setEditFormData({
      name: user.name || "",
      cellnumber: user.cellnumber || "",
      role: user.role || "Staff",
      team: user.team || "",
      status: user.status || "active",
    });
    setShowEditModal(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;

    try {
      const base = apiBase();
      const res = await fetch(`${base}superadmin/users/${editingId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editFormData),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to update user");
      }

      await fetchUsers(token);
      setShowEditModal(false);
      setEditingId(null);
      alert("User updated successfully!");
    } catch (err: any) {
      console.error("Error updating user:", err);
      alert(`Error: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600 mb-2">Loading users...</p>
              <p className="text-sm text-gray-400">Connecting to API server</p>
              <div className="mt-4">
                <button
                  onClick={() => (typeof window !== "undefined" ? window.location.reload() : null)}
                  className="inline-flex items-center px-4 py-2 rounded-md bg-brand-600 text-white hover:bg-brand-700"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
            <div className="flex items-center gap-3">
              <UsersIcon size={32} className="text-brand-600" />
              <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
            </div>
            <div className="w-full md:w-auto flex items-center gap-3 flex-wrap md:flex-nowrap justify-end">
              <div className="relative flex-1 md:flex-none">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email, role, team"
                  aria-label="Search users"
                  className="pl-9 pr-3 py-2 w-full md:w-80 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <button
                onClick={() => setShowForm(!showForm)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md font-semibold text-white bg-green-600 hover:bg-green-700 border border-green-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-auto shrink-0 whitespace-nowrap"
              >
                <Plus size={18} /> Add User
              </button>
            </div>
          </div>

          {/* Add User Form */}
          {showForm && (
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Create New User</h2>
              <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="john@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cell Number *</label>
                  <input
                    type="tel"
                    required
                    value={formData.cellnumber}
                    onChange={(e) => setFormData({ ...formData, cellnumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="Staff">Staff</option>
                    <option value="Admin">Admin</option>
                    <option value="SuperAdmin">SuperAdmin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
                  <select
                    value={formData.team}
                    onChange={(e) => setFormData({ ...formData, team: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Unassigned</option>
                    <option value="Support">Support</option>
                    <option value="Sales">Sales</option>
                    <option value="Operations">Operations</option>
                    <option value="Engineering">Engineering</option>
                    <option value="Management">Management</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password (optional)</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="Set a password or leave blank"
                  />
                </div>

                <div className="flex gap-2 items-end">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700"
                  >
                    Create User
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="flex-1 px-4 py-2 rounded-md bg-gray-300 text-gray-700 hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 m-4">
              <strong>⚠ Error:</strong> {error}
              <p className="text-sm mt-2">Check your network connection and ensure the API server is running.</p>
            </div>
          )}

          {!error && users.length === 0 ? (
            <div className="p-12 text-center">
              <UsersIcon size={48} className="mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600 mb-2">No users found</p>
              <p className="text-sm text-gray-500">Click "Add User" to create your first user</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Phone</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Team</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(search ? users.filter(u => {
                    const q = search.toLowerCase();
                    return (
                      (u.name || "").toLowerCase().includes(q) ||
                      (u.email || "").toLowerCase().includes(q) ||
                      (u.role || "").toLowerCase().includes(q) ||
                      (u.team || "").toLowerCase().includes(q)
                    );
                  }) : users).map((user) => (
                    <tr key={user.user_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900">{user.name || "—"}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Mail size={14} className="text-gray-400" />
                          <span className="text-gray-700">{user.email}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Phone size={14} className="text-gray-400" />
                          <span className="text-gray-700">{user.cellnumber || "—"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Shield size={14} />
                          <span className={`font-semibold ${
                            user.role === "SuperAdmin" ? "text-purple-600" :
                            user.role === "Admin" ? "text-blue-600" :
                            "text-gray-600"
                          }`}>{user.role}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex px-3 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                          {user.team || "Unassigned"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-full ${
                          user.status === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}>
                          {user.status === "active" ? <Check size={12} /> : <X size={12} />}
                          {user.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 space-x-2">
                        <button
                          onClick={() => openEditModal(user)}
                          title="Edit"
                          aria-label="Edit user"
                          className="inline-flex items-center justify-center p-2 rounded-md bg-blue-100 text-blue-600 hover:bg-blue-200"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.user_id)}
                          title="Delete"
                          aria-label="Delete user"
                          className="inline-flex items-center justify-center p-2 rounded-md bg-red-100 text-red-600 hover:bg-red-200"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Total Users */}
        <div className="mt-6 bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-gray-600">Total Users: <strong className="text-lg text-brand-600">{users.length}</strong></p>
        </div>

        {/* Edit Modal */}
        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowEditModal(false)}></div>
            <div className="relative bg-white rounded-lg shadow-lg w-full max-w-xl mx-4">
              <div className="px-6 py-4 border-b">
                <h3 className="text-lg font-semibold">Edit User</h3>
              </div>
              <form onSubmit={handleUpdateUser} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cell Number</label>
                  <input
                    type="tel"
                    value={editFormData.cellnumber}
                    onChange={(e) => setEditFormData({ ...editFormData, cellnumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select
                    value={editFormData.role}
                    onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="Staff">Staff</option>
                    <option value="Admin">Admin</option>
                    <option value="SuperAdmin">SuperAdmin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
                  <select
                    value={editFormData.team}
                    onChange={(e) => setEditFormData({ ...editFormData, team: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Unassigned</option>
                    <option value="Support">Support</option>
                    <option value="Sales">Sales</option>
                    <option value="Operations">Operations</option>
                    <option value="Engineering">Engineering</option>
                    <option value="Management">Management</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={editFormData.status}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </select>
                </div>
                <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-md bg-brand-600 text-white hover:bg-brand-700"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
