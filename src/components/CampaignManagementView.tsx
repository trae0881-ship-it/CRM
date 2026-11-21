import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowUpRight, FileSpreadsheet, Plus, Search, Target, Users, X } from "lucide-react";
import { createOrganizationCampaign, listCampaignAccess, listCampaignLeads, listOrganizationCampaigns, searchCampaignLeadCandidates, setCampaignAccess, setLeadCampaign } from "../services/campaigns";
import type { CampaignAccessRecord, CampaignLead, OrganizationCampaign } from "../services/campaigns";
import { listOrganizationMembers } from "../services/workspace";
import type { Membership, OrganizationMember } from "../services/workspace";

const GoogleSheetsView = lazy(() => import("./GoogleSheetsView").then((module) => ({ default: module.GoogleSheetsView })));

export function CampaignManagementView({ membership, onNotify }: { membership: Membership; onNotify: (message: string) => void }) {
  const [campaigns, setCampaigns] = useState<OrganizationCampaign[]>([]);
  const [people, setPeople] = useState<OrganizationMember[]>([]);
  const [access, setAccess] = useState<CampaignAccessRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingAccess, setEditingAccess] = useState<OrganizationCampaign | null>(null);
  const [managingLeads, setManagingLeads] = useState<OrganizationCampaign | null>(null);
  const [sheetsCampaign, setSheetsCampaign] = useState<OrganizationCampaign | null>(null);
  const [campaignLeads, setCampaignLeads] = useState<CampaignLead[]>([]);
  const [leadCandidates, setLeadCandidates] = useState<CampaignLead[]>([]);
  const [leadSearch, setLeadSearch] = useState("");
  const [loadingCampaignLeads, setLoadingCampaignLeads] = useState(false);
  const [searchingCandidates, setSearchingCandidates] = useState(false);
  const [addingLeadId, setAddingLeadId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const isAdmin = membership.role === "company_owner" || membership.role === "organization_admin";

  const refresh = useCallback(async () => {
    const [nextCampaigns, nextPeople] = await Promise.all([
      listOrganizationCampaigns(membership.organization_id),
      listOrganizationMembers(membership.organization_id).then((members) => members.filter((member) => member.is_active)),
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

  const openLeadManager = async (campaign: OrganizationCampaign) => {
    setManagingLeads(campaign);
    setLeadSearch("");
    setLoadingCampaignLeads(true);
    setSearchingCandidates(isAdmin);
    try {
      const [currentLeads, candidates] = await Promise.all([
        listCampaignLeads(campaign.id),
        isAdmin ? searchCampaignLeadCandidates(membership.organization_id) : Promise.resolve([]),
      ]);
      setCampaignLeads(currentLeads);
      setLeadCandidates(candidates);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Campaign leads could not be loaded.");
    } finally {
      setLoadingCampaignLeads(false);
      setSearchingCandidates(false);
    }
  };

  const refreshCampaignLeads = useCallback(async () => {
    const campaign = managingLeads || sheetsCampaign;
    if (!campaign) return;
    setLoadingCampaignLeads(true);
    try {
      setCampaignLeads(await listCampaignLeads(campaign.id));
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Campaign leads could not be refreshed.");
    } finally {
      setLoadingCampaignLeads(false);
    }
  }, [managingLeads, onNotify, sheetsCampaign]);

  const searchCandidates = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchingCandidates(true);
    try {
      setLeadCandidates(await searchCampaignLeadCandidates(membership.organization_id, leadSearch));
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Available leads could not be loaded.");
    } finally {
      setSearchingCandidates(false);
    }
  };

  const addLead = async (lead: CampaignLead) => {
    if (!managingLeads) return;
    setAddingLeadId(lead.id);
    try {
      await setLeadCampaign(lead.external_id, managingLeads.id);
      setCampaignLeads((current) => [{ ...lead, campaign_id: managingLeads.id }, ...current]);
      setLeadCandidates((current) => current.filter((candidate) => candidate.id !== lead.id));
      onNotify(`${lead.full_name} added to ${managingLeads.name}.`);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Lead could not be added to this campaign.");
    } finally {
      setAddingLeadId(null);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingAccess) {
        await setCampaignAccess(editingAccess.id, selectedMembers);
      } else {
        await createOrganizationCampaign({
          organizationId: membership.organization_id,
          name,
          description,
          memberIds: selectedMembers,
        });
      }
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Campaign could not be saved.");
      setSaving(false);
      return;
    }
    setSaving(false);
    closeModal();
    onNotify(editingAccess ? "Campaign access updated." : "Campaign created.");
    try {
      await refresh();
    } catch (error) {
      onNotify(error instanceof Error ? `Saved, but campaign list could not be refreshed: ${error.message}` : "Saved, but campaign list could not be refreshed.");
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
            <div className="campaign-card-actions">
              <button className="button secondary" onClick={() => void openLeadManager(campaign)}><Users size={15} /> Leads</button>
              {isAdmin && <button className="button secondary" onClick={() => setSheetsCampaign(campaign)}><FileSpreadsheet size={15} /> Google Sheet</button>}
              {isAdmin && <button className="text-button campaign-link" onClick={() => openAccessEditor(campaign)}>Manage access <ArrowUpRight size={15} /></button>}
            </div>
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

    {managingLeads && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setManagingLeads(null)}>
      <section className="modal campaign-leads-modal" role="dialog" aria-modal="true" aria-labelledby="campaign-leads-title">
        <div className="modal-head"><div><p className="eyebrow">CAMPAIGN LEADS</p><h2 id="campaign-leads-title">{managingLeads.name}</h2><p className="muted">View leads in this campaign and add unassigned organization leads.</p></div><button type="button" className="icon-button" aria-label="Close campaign leads" onClick={() => setManagingLeads(null)}><X size={19} /></button></div>
        {isAdmin && <form className="campaign-lead-search" onSubmit={(event) => void searchCandidates(event)}>
          <label><Search size={16} /><input value={leadSearch} onChange={(event) => setLeadSearch(event.target.value)} placeholder="Search unassigned leads by name, phone or email" /></label>
          <button className="button secondary" disabled={searchingCandidates}>{searchingCandidates ? "Searching…" : "Search"}</button>
        </form>}
        <div className="campaign-lead-sections">
          <section><h3>Leads in campaign <span>{campaignLeads.length}{campaignLeads.length === 100 ? "+" : ""}</span></h3>
            {loadingCampaignLeads ? <p className="muted" role="status">Loading campaign leads…</p>
              : campaignLeads.length ? <div className="campaign-lead-list">{campaignLeads.map((lead) => <article className="campaign-lead-row" key={lead.id}>
                <div><strong>{lead.full_name}</strong><small>{[lead.phone, lead.company, lead.source].filter(Boolean).join(" · ") || "No contact details"}</small></div>
                <span className={`status ${lead.status.replace(/_/g, "-")}`}>{lead.status.replace(/_/g, " ")}</span>
              </article>)}</div>
                : <p className="muted">No leads are linked to this campaign yet.</p>}
          </section>
          {isAdmin && <section><h3>Add an existing lead</h3>
            {searchingCandidates ? <p className="muted" role="status">Loading available leads…</p>
              : leadCandidates.length ? <div className="campaign-lead-list">{leadCandidates.map((lead) => <article className="campaign-lead-row" key={lead.id}>
                <div><strong>{lead.full_name}</strong><small>{[lead.phone, lead.company, lead.source].filter(Boolean).join(" · ") || "No contact details"}</small></div>
                <button className="button secondary" disabled={addingLeadId === lead.id} onClick={() => void addLead(lead)}>{addingLeadId === lead.id ? "Adding…" : "Add"}</button>
              </article>)}</div>
                : <p className="muted">No unassigned leads match your search.</p>}
          </section>}
        </div>
      </section>
    </div>}

    {sheetsCampaign && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSheetsCampaign(null)}>
      <section className="modal campaign-sheets-modal" role="dialog" aria-modal="true" aria-labelledby="campaign-sheets-title">
        <div className="modal-head"><div><p className="eyebrow">CAMPAIGN SOURCE</p><h2 id="campaign-sheets-title">Google Sheet · {sheetsCampaign.name}</h2><p className="muted">Add a sheet link and sync its rows directly into this campaign.</p></div><button type="button" className="icon-button" aria-label="Close campaign sheets" onClick={() => setSheetsCampaign(null)}><X size={19} /></button></div>
        <Suspense fallback={<p className="muted" role="status">Loading Google Sheets…</p>}>
          <GoogleSheetsView membership={membership} campaignId={sheetsCampaign.id} campaignName={sheetsCampaign.name} onNotify={onNotify} onDataChanged={refreshCampaignLeads} />
        </Suspense>
      </section>
    </div>}
  </>;
}
