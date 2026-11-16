import { FormEvent, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Mail, Pencil, Plus, Search, UserPlus, UserRoundCheck, UserRoundX, Users, X } from "lucide-react";
import { listPlatformCompanies, type PlatformCompany } from "../services/platform";
import {
  addPlatformUser,
  listPlatformUsers,
  updatePlatformUserAccountStatus,
  updatePlatformUserMembership,
  type PlatformAssignableRole,
  type PlatformDirectoryRole,
  type PlatformEditableRole,
  type PlatformUser,
  type PlatformUserFilters,
} from "../services/platformUsers";

const pageSize = 25;
const createRoles: Array<{ value: PlatformAssignableRole; label: string }> = [
  { value: "company_owner", label: "Company Owner" },
  { value: "organization_admin", label: "Organization Admin" },
  { value: "manager", label: "Manager / Team Leader" },
  { value: "agent", label: "Salesperson" },
];
const roleLabels: Record<PlatformDirectoryRole, string> = {
  super_admin: "SaaS Super Admin",
  company_owner: "Company Owner",
  organization_admin: "Organization Admin",
  manager: "Manager / Team Leader",
  agent: "Salesperson",
  auditor: "Auditor",
};

type UserForm = {
  fullName: string;
  email: string;
  phone: string;
  companyId: string;
  role: PlatformAssignableRole;
  isActive: boolean;
  sendInvitation: boolean;
};

const emptyForm = (): UserForm => ({
  fullName: "",
  email: "",
  phone: "",
  companyId: "",
  role: "agent",
  isActive: true,
  sendInvitation: true,
});

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "Never";
}

function statusLabel(user: PlatformUser) {
  if (user.isBanned) return "Suspended account";
  if (!user.membershipActive) return "Inactive in company";
  if (user.status === "invited") return "Email verification pending";
  return "Active";
}

function statusClass(user: PlatformUser) {
  if (user.isBanned || !user.membershipActive) return "inactive";
  return user.status === "invited" ? "pending" : "active";
}

export function PlatformUserManagementView({
  onNotify,
  onOpenCompanies,
}: {
  onNotify: (message: string) => void;
  onOpenCompanies: () => void;
}) {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [companies, setCompanies] = useState<PlatformCompany[]>([]);
  const [filters, setFilters] = useState<Omit<PlatformUserFilters, "page" | "pageSize">>({
    search: "",
    companyId: "",
    role: "",
    status: "",
  });
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<UserForm>(emptyForm);
  const [editing, setEditing] = useState<PlatformUser | null>(null);
  const [editForm, setEditForm] = useState({ fullName: "", phone: "", role: "agent" as PlatformEditableRole, isActive: true });
  const [details, setDetails] = useState<PlatformUser | null>(null);

  const customerCompanies = companies.filter((company) => company.is_active && !company.slug.startsWith("adometa-platform-"));

  useEffect(() => {
    let active = true;
    void listPlatformCompanies().then((result) => {
      if (active) setCompanies(result);
    }).catch((error: unknown) => {
      if (active) onNotify(error instanceof Error ? error.message : "Companies could not be loaded.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setLoadError("");
      void listPlatformUsers({ ...filters, page, pageSize }).then((result) => {
        if (!active) return;
        setUsers(result.users);
        setTotalCount(result.totalCount);
        const lastPage = Math.max(1, Math.ceil(result.totalCount / pageSize));
        if (page > lastPage) setPage(lastPage);
      }).catch((error: unknown) => {
        if (!active) return;
        setUsers([]);
        setTotalCount(0);
        setLoadError(error instanceof Error ? error.message : "Users could not be loaded.");
      }).finally(() => {
        if (active) setLoading(false);
      });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [filters, page, reload]);

  const changeFilter = (patch: Partial<typeof filters>) => {
    setPage(1);
    setFilters((current) => ({ ...current, ...patch }));
  };

  const openAdd = (user?: PlatformUser) => {
    const next = emptyForm();
    if (user) {
      next.fullName = user.fullName;
      next.email = user.email;
      next.phone = user.phone ?? "";
      next.role = user.role === "company_owner" || user.role === "organization_admin" || user.role === "manager" || user.role === "agent"
        ? user.role
        : "agent";
      next.isActive = user.membershipActive;
      next.sendInvitation = false;
    }
    setAddForm(next);
    setShowAdd(true);
  };

  const submitAdd = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await addPlatformUser(addForm);
      setShowAdd(false);
      setFilters((current) => ({ ...current, search: addForm.email }));
      setPage(1);
      setReload((value) => value + 1);
      onNotify(result.assignedExistingUser
        ? "Existing account assigned to the selected company."
        : result.invitationSent
          ? "User created and invitation email requested."
          : "Account created without an invitation; ask the user to use password recovery.");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "User could not be added.");
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (user: PlatformUser) => {
    if (user.role === "super_admin") return;
    setEditing(user);
    setEditForm({ fullName: user.fullName, phone: user.phone ?? "", role: user.role, isActive: user.membershipActive });
  };

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      await updatePlatformUserMembership(editing.userId, editing.organizationId, editForm);
      setEditing(null);
      setReload((value) => value + 1);
      onNotify("User profile and company membership updated.");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "User could not be updated.");
    } finally {
      setBusy(false);
    }
  };

  const toggleAccount = async (user: PlatformUser) => {
    const accountActive = user.isBanned;
    const confirmation = window.confirm(accountActive
      ? `Reactivate ${user.email} across the platform?`
      : `Deactivate ${user.email} across all companies?`);
    if (!confirmation) return;
    setBusy(true);
    try {
      await updatePlatformUserAccountStatus(user.userId, accountActive);
      setReload((value) => value + 1);
      onNotify(accountActive ? "User account reactivated." : "User account deactivated across the platform.");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Account status could not be changed.");
    } finally {
      setBusy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">SAAS ADMINISTRATION</p>
          <h1>Users</h1>
          <p className="muted">Manage Auth accounts and company memberships. Organization access remains tenant-scoped.</p>
        </div>
        <button className="button primary" onClick={() => openAdd()}><Plus size={16} /> Add User</button>
      </div>

      <section className="card platform-users-card">
        <div className="platform-user-filters">
          <label className="platform-user-search"><Search size={16} /><input aria-label="Search users" placeholder="Search name, email or company" value={filters.search} onChange={(event) => changeFilter({ search: event.target.value })} /></label>
          <select aria-label="Filter by company" value={filters.companyId} onChange={(event) => changeFilter({ companyId: event.target.value })}>
            <option value="">All companies</option>
            {customerCompanies.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}
          </select>
          <select aria-label="Filter by role" value={filters.role} onChange={(event) => changeFilter({ role: event.target.value })}>
            <option value="">All roles</option>
            {Object.entries(roleLabels).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
          </select>
          <select aria-label="Filter by status" value={filters.status} onChange={(event) => changeFilter({ status: event.target.value })}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="invited">Invitation pending</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {loadError && <p className="platform-user-error" role="alert">{loadError}</p>}
        <div className="table-scroll">
          <table className="platform-user-table">
            <thead><tr><th>USER</th><th>EMAIL</th><th>COMPANY</th><th>ROLE</th><th>STATUS</th><th>CREATED</th><th>ACTIONS</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7}>Loading users…</td></tr>}
              {!loading && !users.length && <tr><td colSpan={7}><div className="empty-state"><Users size={24} /><strong>No users found</strong><p>Change the filters or add a user to a company.</p></div></td></tr>}
              {!loading && users.map((user) => (
                <tr key={`${user.organizationId}:${user.userId}`}>
                  <td><strong>{user.fullName || "Name not provided"}</strong></td>
                  <td>{user.email}</td>
                  <td>{user.organizationName}</td>
                  <td>{roleLabels[user.role]}</td>
                  <td><span className={`platform-user-status ${statusClass(user)}`}>{statusLabel(user)}</span></td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td><div className="platform-user-actions">
                    <button className="icon-button" title="View user details" aria-label={`View details for ${user.email}`} onClick={() => setDetails(user)}><Eye size={16} /></button>
                    <button className="icon-button" title="Assign to another company" aria-label={`Assign ${user.email} to another company`} onClick={() => openAdd(user)}><UserPlus size={16} /></button>
                    {user.role !== "super_admin" && <button className="icon-button" title="Edit user" aria-label={`Edit ${user.email}`} onClick={() => openEdit(user)}><Pencil size={15} /></button>}
                    <button className="icon-button" disabled={busy} title={user.isBanned ? "Reactivate account" : "Deactivate account globally"} aria-label={`${user.isBanned ? "Reactivate" : "Deactivate"} ${user.email}`} onClick={() => void toggleAccount(user)}>
                      {user.isBanned ? <UserRoundCheck size={16} /> : <UserRoundX size={16} />}
                    </button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="platform-users-pagination">
          <span>{totalCount} membership{totalCount === 1 ? "" : "s"} · Page {page} of {totalPages}</span>
          <div>
            <button className="button secondary" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={15} /> Previous</button>
            <button className="button secondary" disabled={page >= totalPages || loading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next <ChevronRight size={15} /></button>
          </div>
        </div>
      </section>

      {showAdd && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowAdd(false)}>
        <form className="modal platform-user-modal" role="dialog" aria-modal="true" aria-labelledby="platform-user-add-title" onSubmit={(event) => void submitAdd(event)}>
          <div className="modal-head"><div><p className="eyebrow">USER MANAGEMENT</p><h2 id="platform-user-add-title">Add User</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={() => setShowAdd(false)}><X size={18} /></button></div>
          <label>Full name<input required minLength={2} maxLength={100} autoComplete="name" value={addForm.fullName} onChange={(event) => setAddForm({ ...addForm, fullName: event.target.value })} /></label>
          <label>Email address<input required type="email" maxLength={254} autoComplete="email" value={addForm.email} onChange={(event) => setAddForm({ ...addForm, email: event.target.value })} /></label>
          <label>Mobile number <span className="muted">(optional)</span><input type="tel" maxLength={40} autoComplete="tel" value={addForm.phone} onChange={(event) => setAddForm({ ...addForm, phone: event.target.value })} /></label>
          <label>Company<select required value={addForm.companyId} onChange={(event) => setAddForm({ ...addForm, companyId: event.target.value })}><option value="">Select a company</option>{customerCompanies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
          {!customerCompanies.length && <div className="platform-user-help">Create an active company in platform administration before adding a user. <button type="button" className="text-button" onClick={onOpenCompanies}>Open company management</button></div>}
          <label>Role<select value={addForm.role} onChange={(event) => setAddForm({ ...addForm, role: event.target.value as PlatformAssignableRole })}>{createRoles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
          <label className="platform-user-checkbox"><input type="checkbox" checked={addForm.isActive} onChange={(event) => setAddForm({ ...addForm, isActive: event.target.checked })} /> Enable access to this company</label>
          <label className="platform-user-checkbox"><input type="checkbox" checked={addForm.sendInvitation} onChange={(event) => setAddForm({ ...addForm, sendInvitation: event.target.checked })} /><Mail size={15} /> Send invitation email</label>
          {!addForm.sendInvitation && <p className="platform-user-help">No email will be sent. The user must use password recovery to set their password.</p>}
          <p className="platform-user-help">If the email belongs to an existing account, that account will be assigned to this company; a second Auth account will not be created.</p>
          <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setShowAdd(false)}>Cancel</button><button className="button primary" disabled={busy || !customerCompanies.length}>{busy ? "Saving…" : "Add User"}</button></div>
        </form>
      </div>}

      {editing && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setEditing(null)}>
        <form className="modal platform-user-modal" role="dialog" aria-modal="true" aria-labelledby="platform-user-edit-title" onSubmit={(event) => void submitEdit(event)}>
          <div className="modal-head"><div><p className="eyebrow">EDIT MEMBERSHIP</p><h2 id="platform-user-edit-title">{editing.fullName || editing.email}</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={() => setEditing(null)}><X size={18} /></button></div>
          <p className="platform-user-help">{editing.email} · {editing.organizationName}</p>
          <label>Full name<input required minLength={2} maxLength={100} value={editForm.fullName} onChange={(event) => setEditForm({ ...editForm, fullName: event.target.value })} /></label>
          <label>Mobile number <span className="muted">(optional)</span><input type="tel" maxLength={40} value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} /></label>
          <label>Company role<select value={editForm.role} onChange={(event) => setEditForm({ ...editForm, role: event.target.value as PlatformEditableRole })}>
            {createRoles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
            {editForm.role === "auditor" && <option value="auditor">Auditor</option>}
          </select></label>
          <label className="platform-user-checkbox"><input type="checkbox" checked={editForm.isActive} onChange={(event) => setEditForm({ ...editForm, isActive: event.target.checked })} /> Active in this company</label>
          <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setEditing(null)}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></div>
        </form>
      </div>}

      {details && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setDetails(null)}>
        <section className="modal platform-user-modal" role="dialog" aria-modal="true" aria-labelledby="platform-user-details-title">
          <div className="modal-head"><div><p className="eyebrow">USER DETAILS</p><h2 id="platform-user-details-title">{details.fullName || "Name not provided"}</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={() => setDetails(null)}><X size={18} /></button></div>
          <dl className="platform-user-details">
            <div><dt>Email</dt><dd>{details.email}</dd></div>
            <div><dt>Mobile</dt><dd>{details.phone || "Not provided"}</dd></div>
            <div><dt>Company</dt><dd>{details.organizationName}</dd></div>
            <div><dt>Role</dt><dd>{roleLabels[details.role]}</dd></div>
            <div><dt>Status</dt><dd>{statusLabel(details)}</dd></div>
            <div><dt>Account created</dt><dd>{formatDate(details.createdAt)}</dd></div>
            <div><dt>Company membership created</dt><dd>{formatDate(details.membershipCreatedAt)}</dd></div>
            <div><dt>Last sign-in</dt><dd>{formatDate(details.lastSignInAt)}</dd></div>
            <div><dt>Email verified</dt><dd>{details.emailConfirmedAt ? formatDate(details.emailConfirmedAt) : "Not verified"}</dd></div>
          </dl>
          <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setDetails(null)}>Close</button><button type="button" className="button primary" onClick={() => { setDetails(null); openAdd(details); }}><UserPlus size={15} /> Assign to company</button></div>
        </section>
      </div>}
    </>
  );
}
