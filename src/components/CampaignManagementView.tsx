import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowUpRight, Plus, Target, Users, X } from "lucide-react";
import { createOrganizationCampaign, listCampaignAccess, listOrganizationCampaigns, setCampaignAccess } from "../services/campaigns";
import type { CampaignAccessRecord, OrganizationCampaign } from "../services/campaigns";
import { listOrganizationSalespeople } from "../services/leads";
import type { Membership } from "../services/workspace";

type Salesperson = { user_id: string; role: string; profiles: { full_name: string } | null };

export function CampaignManagementView({ membership, onNotify }: { membership: Membership; onNotify: (message: string) => void }) {
  const [campaigns, setCampaigns] = useState<OrganizationCampaign[]>([]);
  const [people, setPeople] = useState<Salesperson[]>([]);
  const [access, setAccess] = useState<CampaignAccessRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingAccess, setEditingAccess] = useState<OrganizationCampaign | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const isAdmin = membership.role === "company_owner" || membership.role === "organization_admin";

  const refresh = useCallback(async () => {
    const [nextCampaigns, nextPeople] = await Promise.all([
      listOrganizationCampaigns(membership.organization_id),
      listOrganizationSalespeople(membership.organization_id),
    ]);
    const nextAccess = await listCampaignAccess(nextCampaigns.map((campaign) => campaign.id));
    setCampaigns(nextCampaigns);
    setPeople(nextPeople);
    setAccess(nextAccess);
  }, [membership.organization_id]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void refresh().catch((error) => {
      if (active) onNotify(error instanceof Error ? error.message : "Campaigns could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [refresh, onNotify]);

  const accessNames = useMemo(() => {
    const names = new Map(people.map((person) => [person.user_id, person.profiles?.full_name || "Organization member"]));
    return (campaignId: string) => access
      .filter((record) => record.campaign_id === campaignId)
      .map((record) => names.get(record.user_id) || "Organization member");
  }, [access, people]);

  const openAccessEditor = (campaign: OrganizationCampaign) => {
    setEditingAccess(campaign);
    setSelectedMembers(access.filter((record) => record.campaign_id === campaign.id).map((record) => record.user_id));
  };

  const closeModal = () => {
    setShowCreate(false);
    setEditingAccess(null);
    setName("");
    setDescription("");
    setSelectedMembers([]);
  };

  const toggleMember = (userId: string) => {
    setSelectedMembers((current) => current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId]);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingAccess) {
        await setCampaignAccess(editingAccess.id, selectedMembers);
        onNotify("Campaign access updated.");
      } else {
        await createOrganizationCampaign({
          organizationId: membership.organization_id,
          name,
          description,
          memberIds: selectedMembers,
        });
        onNotify("Campaign created.");
      }
      closeModal();
      await refresh();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Campaign could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return <>
    <header className="page-header">
      <div><p className="eyebrow">GROWTH</p><h1>Campaigns</h1><p className="muted">Manage campaigns and choose which organization members can see each campaign's leads.</p></div>
      {isAdmin && <button className="button primary" onClick={() => setShowCreate(true)}><Plus size={17} /> New campaign</button>}
    </header>
    {loading ? <section className="card route-loading" role="status">Loading campaigns…</section>
      : campaigns.length ? <div className="campaign-grid">
        {campaigns.map((campaign) => {
          const names = accessNames(campaign.id);
          const hasAccess = isAdmin || access.some((record) => record.campaign_id === campaign.id && record.user_id === membership.user_id);
          return <article className="card campaign-card" key={campaign.id}>
            <div className="campaign-title">
              <div className="campaign-icon purple"><Target size={19} /></div>
              <div><h2>{campaign.name}</h2><p>{campaign.description || "No description"}</p></div>
            </div>
            <div className="campaign-status"><span className={`dot ${campaign.status === "active" ? "dot-green" : "dot-orange"}`} />{campaign.status}</div>
            <div className="campaign-access-summary">
              <Users size={15} />
              <span>{isAdmin ? names.length ? names.join(", ") : "No members assigned" : hasAccess ? "You have access" : "Access not assigned"}</span>
            </div>
            {isAdmin && <button className="text-button campaign-link" onClick={() => openAccessEditor(campaign)}>Manage access <ArrowUpRight size={15} /></button>}
          </article>;
        })}
      </div>
      : <section className="card empty-state"><Target size={24} /><strong>No campaigns yet</strong><p>{isAdmin ? "Create a campaign and select who can access its leads." : "Campaigns shared with you will appear here."}</p></section>}

    {(showCreate || editingAccess) && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeModal()}>
      <form className="modal campaign-modal" onSubmit={submit}>
        <div className="modal-head"><div><p className="eyebrow">{editingAccess ? "CAMPAIGN PERMISSIONS" : "NEW CAMPAIGN"}</p><h2>{editingAccess ? `Access · ${editingAccess.name}` : "Create campaign"}</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={closeModal}><X size={19} /></button></div>
        {!editingAccess && <>
          <label>Campaign name<input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Summer launch" /></label>
          <label>Description<textarea maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Campaign goals and source" /></label>
        </>}
        <fieldset className="campaign-member-picker">
          <legend>Who can access this campaign's leads?</legend>
          <p>Only active members of this organization can be selected.</p>
          <div className="campaign-member-list">
            {people.map((person) => <label key={person.user_id}>
              <input type="checkbox" checked={selectedMembers.includes(person.user_id)} onChange={() => toggleMember(person.user_id)} />
              <span>{person.profiles?.full_name || "Organization member"}</span>
              <small>{person.role.replace(/_/g, " ")}</small>
            </label>)}
          </div>
        </fieldset>
        <div className="modal-actions"><button type="button" className="button secondary" onClick={closeModal}>Cancel</button><button className="button primary" disabled={saving} type="submit">{saving ? "Saving…" : editingAccess ? "Save access" : "Create campaign"}</button></div>
      </form>
    </div>}
  </>;
}
