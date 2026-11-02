import { useEffect, useState } from "react";
import { ShieldCheck, Users } from "lucide-react";
import { listPlatformMembers, updatePlatformMembership, type PlatformMember } from "../services/platform";

export function PlatformUserManagementView({ onNotify }: { onNotify: (message: string) => void }) {
  const [members, setMembers] = useState<PlatformMember[]>([]);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try { setMembers(await listPlatformMembers()); } catch (error) { onNotify(error instanceof Error ? error.message : "Platform users could not be loaded."); }
  };
  useEffect(() => { void load(); }, []);
  return <section className="card table-card"><div className="card-header"><div><h2>Platform user access</h2><p>Role changes are server-authorized; Super Admin assignment is bootstrap-only.</p></div><Users size={18} /></div><table><thead><tr><th>USER</th><th>COMPANY</th><th>ROLE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{members.map((member) => <tr key={`${member.organization_id}:${member.user_id}`}><td>{member.profiles?.full_name || member.user_id.slice(0, 8)}</td><td>{member.organizations?.name || member.organization_id.slice(0, 8)}</td><td>{member.role}</td><td>{member.is_active ? "Active" : "Inactive"}</td><td>{member.role === "super_admin" ? <span className="pending-pill"><ShieldCheck size={14} /> Protected</span> : <button className="button secondary" disabled={busy} onClick={async () => { setBusy(true); try { await updatePlatformMembership(member.organization_id, member.user_id, member.role, !member.is_active); await load(); onNotify("Platform membership updated."); } catch (error) { onNotify(error instanceof Error ? error.message : "Membership update failed."); } finally { setBusy(false); } }}>{member.is_active ? "Deactivate" : "Activate"}</button>}</td></tr>)}</tbody></table></section>;
}
