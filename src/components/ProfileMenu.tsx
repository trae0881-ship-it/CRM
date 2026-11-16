import { useEffect, useState } from "react";
import { Check, ChevronDown, LogOut, UserRound, X } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import type { Membership } from "../services/workspace";
import { getUserProfile, updateUserProfile, type UserProfile } from "../services/auth";

const roleNames: Record<Membership["role"], string> = {
  super_admin: "Super Admin",
  company_owner: "Company Owner",
  organization_admin: "Organization Admin",
  manager: "Sales Manager",
  agent: "Salesperson",
  auditor: "Auditor",
};

type Props = {
  session: Session;
  membership: Membership;
  organizationName: string;
  organizationIsActive: boolean | null;
  teamNames: string[];
  onLogout: () => Promise<void>;
};

export function ProfileMenu({ session, membership, organizationName, organizationIsActive, teamNames, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const user = session.user;
  const metadata = user.user_metadata ?? {};
  const fullName = profile?.full_name || (typeof metadata.full_name === "string" ? metadata.full_name : "");
  const avatarUrl = profile ? profile.avatar_url || "" : typeof metadata.avatar_url === "string" ? metadata.avatar_url : "";
  const email = user.email || "Email unavailable";
  const phone = user.phone || "";
  const initials = (fullName || email).split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const completedFields = [Boolean(fullName.trim()), Boolean(user.email), Boolean(avatarUrl)].filter(Boolean).length;

  useEffect(() => {
    let active = true;
    void getUserProfile()
      .then((currentProfile) => { if (active) setProfile(currentProfile); })
      .catch((error: unknown) => { if (active) setErrorMessage(error instanceof Error ? error.message : "Profile could not be loaded."); });
    return () => { active = false; };
  }, [user.id]);

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setErrorMessage("");
    try {
      const updatedProfile = await updateUserProfile({
        fullName: String(form.get("fullName") || ""),
        avatarUrl: String(form.get("avatarUrl") || ""),
      });
      setProfile(updatedProfile);
      setEditing(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Profile could not be updated.");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    setErrorMessage("");
    try {
      await onLogout();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Sign out failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="profile-menu">
    <button className="profile-trigger" aria-label={`Open profile menu for ${fullName || email}`} aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen((value) => !value); setErrorMessage(""); }}>
      <span className="profile-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials || <UserRound size={17} />}</span>
      <span className="profile-trigger-copy"><strong>{fullName || email}</strong><small>{roleNames[membership.role]}</small></span>
      <ChevronDown size={16} />
    </button>
    {open && <div className="profile-popover" role="menu">
      <div className="profile-popover-heading">
        <span className="profile-avatar large">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials || <UserRound size={19} />}</span>
        <div><strong>{fullName || "Name not provided"}</strong><small>{roleNames[membership.role]}</small></div>
      </div>
      <dl className="profile-details">
        <div><dt>Email</dt><dd>{email}</dd></div>
        <div><dt>Phone</dt><dd>{phone || "Not provided"}</dd></div>
        <div><dt>Organization</dt><dd>{organizationName || "Not available"}</dd></div>
        <div><dt>Team</dt><dd>{teamNames.length ? teamNames.join(", ") : "No team assigned"}</dd></div>
        <div><dt>Account status</dt><dd>{!membership.is_active ? "Inactive membership" : organizationIsActive === false ? "Organization suspended" : organizationIsActive === true ? "Active" : "Status unavailable"}</dd></div>
        <div><dt>Last login</dt><dd>{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : "Unavailable"}</dd></div>
        <div><dt>Profile completion</dt><dd>{completedFields} of 3 fields</dd></div>
      </dl>
      {errorMessage && <p className="profile-error" role="alert">{errorMessage}</p>}
      <button className="profile-action" role="menuitem" onClick={() => { setEditing(true); setErrorMessage(""); }}>Edit profile</button>
      <button className="profile-action danger" role="menuitem" disabled={busy} onClick={() => void logout()}><LogOut size={16} /> Sign out</button>
    </div>}
    {editing && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setEditing(false)}>
      <form className="modal profile-edit-modal" onSubmit={saveProfile} role="dialog" aria-modal="true" aria-labelledby="profile-edit-title">
        <div className="modal-head"><div><p className="eyebrow">ACCOUNT</p><h2 id="profile-edit-title">Edit profile</h2></div><button type="button" className="icon-button" aria-label="Close profile editor" onClick={() => setEditing(false)}><X size={19} /></button></div>
        <p className="muted">Only your name and profile photo can be changed here. Roles and permissions are managed by your organization.</p>
        <label>Full name<input name="fullName" required maxLength={100} defaultValue={fullName} /></label>
        <label>Profile photo URL<input name="avatarUrl" type="url" pattern="https://.*" defaultValue={avatarUrl} placeholder="https://example.com/photo.jpg" /></label>
        {errorMessage && <p className="profile-error" role="alert">{errorMessage}</p>}
        <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setEditing(false)}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving..." : <><Check size={16} /> Save profile</>}</button></div>
      </form>
    </div>}
  </div>;
}
