import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight, BarChart3, Bell, CalendarDays, Check, ChevronDown, CircleHelp,
  ClipboardList, Clock3, Filter, LayoutDashboard, Menu, MoreHorizontal, Phone,
  Plus, Search, Settings, Target, TrendingUp, Users, X, Zap, Headphones, LogOut,
  UsersRound, PieChart, Plug, ShieldCheck, MessageCircle, Upload,
  Building2, UserPlus, Wrench, Bot, Database, Globe2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { isSupabaseConfigured, supabase, supabaseConfigError } from "./lib/supabase";
import { createLead, getLeadByExternalId, getOrganizationLeadTrend, listLeadTimeline, listOrganizationSalespeople, listLeadsPage, shareLead, transferLead, updateLeadStatus } from "./services/leads";
import type { LeadTrendPoint } from "./services/leads";
import { saveCall, skipLead } from "./services/calling";
import { personalWhatsAppUrl, recordWhatsAppOpened, renderWhatsAppTemplate } from "./services/whatsapp";
import { requestPasswordReset, signIn, signOut, signUp, updatePassword } from "./services/auth";
import type { LeadEvent, LeadRecord, LeadStatus } from "./types/database";
import type { Session } from "@supabase/supabase-js";
import { createTeam, getCurrentMembership, getOrganizationProfile, getPersonalPerformance, inviteMember, listCurrentMemberships, listOrganizationMembers, listTeamMembers, listTeams, listUserTeamNames, setTeamMember } from "./services/workspace";
import type { Membership, MembershipOption, OrganizationProfile, PersonalPerformance, Team, WorkspaceSummary } from "./services/workspace";
import { DashboardLayout } from "./components/DashboardLayout";
import { PublicLayout } from "./components/PublicLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PublicRoute } from "./components/PublicRoute";
import { LeadTrendChart } from "./components/LeadTrendChart";
const BookingsView = lazy(() => import("./components/OperationsViews").then((module) => ({ default: module.BookingsView })));
const FollowUpsView = lazy(() => import("./components/OperationsViews").then((module) => ({ default: module.FollowUpsView })));
const NotificationsView = lazy(() => import("./components/OperationsViews").then((module) => ({ default: module.NotificationsView })));
const ReportsView = lazy(() => import("./components/OperationsViews").then((module) => ({ default: module.ReportsView })));
const SiteVisitsView = lazy(() => import("./components/OperationsViews").then((module) => ({ default: module.SiteVisitsView })));
const StatusSettingsView = lazy(() => import("./components/OperationsViews").then((module) => ({ default: module.StatusSettingsView })));
const PlatformAdminView = lazy(() => import("./components/PlatformAdminView").then((module) => ({ default: module.PlatformAdminView })));
const PlatformUserManagementView = lazy(() => import("./components/PlatformUserManagementView").then((module) => ({ default: module.PlatformUserManagementView })));
const CompanyAdminView = lazy(() => import("./components/CompanyAdminView").then((module) => ({ default: module.CompanyAdminView })));
const GoogleSheetsView = lazy(() => import("./components/GoogleSheetsView").then((module) => ({ default: module.GoogleSheetsView })));
const GrowthToolsView = lazy(() => import("./components/GrowthToolsView").then((module) => ({ default: module.GrowthToolsView })));
const LicenseRegisterView = lazy(() => import("./components/GrowthToolsView").then((module) => ({ default: module.LicenseRegisterView })));
const AutomationView = lazy(() => import("./components/AutomationView").then((module) => ({ default: module.AutomationView })));
const Customer360View = lazy(() => import("./components/SalesOperationsView").then((module) => ({ default: module.Customer360View })));
const SalesPipelineView = lazy(() => import("./components/SalesOperationsView").then((module) => ({ default: module.SalesPipelineView })));
import { countUnreadNotifications } from "./services/operations";
import { ProfileMenu } from "./components/ProfileMenu";
import { OrganizationAdminControls } from "./components/OrganizationAdminControls";
import { LeadCsvImportModal } from "./components/LeadCsvImportModal";
const DocumentationCenter = lazy(() => import("./components/DocumentationCenter").then((module) => ({ default: module.DocumentationCenter })));
import { canAccessDocumentation, getDocumentationCenter, getDocumentationRedirectPath } from "./lib/documentationAccess";
const DatabaseMonitoringView = lazy(() => import("./components/DatabaseMonitoringView").then((module) => ({ default: module.DatabaseMonitoringView })));
import { applyRouteMetadata, getAppUrl, redirectToCanonicalDomain } from "./lib/appUrls";
import { canAccessDashboardRoute, getRoleDashboardPath, isMalformedOrganizationPath, isOrganizationPath, isSaasAdminPath, normalizePathname, resolveDashboardRoute, type DashboardView } from "./lib/roleRoutes";
const DomainLinksView = lazy(() => import("./components/DomainManagementView").then((module) => ({ default: module.DomainLinksView })));
const DomainManagementView = lazy(() => import("./components/DomainManagementView").then((module) => ({ default: module.DomainManagementView })));
const MarketingPublicPage = lazy(() => import("./components/PublicPages").then((module) => ({ default: module.PublicPage })));
import { PublicLoading } from "./components/PublicLoading";
const WorkspaceOnboardingView = lazy(() => import("./components/WorkspaceOnboardingView").then((module) => ({ default: module.WorkspaceOnboardingView })));

const LEAD_PAGE_SIZE = 50;
type View = DashboardView;
const leadLoadingViews = new Set<View>(["Overview", "Leads", "Calling", "Follow-ups", "Site Visits", "Bookings"]);
type Status = "New" | "Contacted" | "Qualified" | "Follow-up" | "Won";
type Lead = { id: string; dbId?: string; phone?: string | null; name: string; company: string; source: string; status: Status; score: number; owner: string; date: string; color: string };

const initialLeads: Lead[] = [
  { id: "AD-1048", name: "Rohan Mehta", company: "Mehta Developers", source: "Website", status: "Qualified", score: 92, owner: "AS", date: "Today, 10:42 AM", color: "#e1f4ec" },
  { id: "AD-1047", name: "Priya Sharma", company: "Aster Living", source: "Meta Ads", status: "Contacted", score: 78, owner: "RK", date: "Today, 09:18 AM", color: "#fff1dd" },
  { id: "AD-1046", name: "Arjun Kapoor", company: "Kapoor & Sons", source: "Referral", status: "New", score: 61, owner: "—", date: "Yesterday, 04:32 PM", color: "#e8e4ff" },
  { id: "AD-1045", name: "Sneha Iyer", company: "Iyer Enterprises", source: "Google Search", status: "Follow-up", score: 84, owner: "AS", date: "Yesterday, 02:06 PM", color: "#fde2e3" },
  { id: "AD-1044", name: "Vikram Singh", company: "Northstar Homes", source: "Website", status: "Won", score: 97, owner: "RK", date: "Oct 28, 2024", color: "#dceefd" },
];

const publicMarketingPaths = new Set(["/", "/features", "/pricing", "/about", "/contact", "/integrations", "/faq", "/privacy", "/terms", "/cookies"]);
const publicApplicationPaths = new Set([...publicMarketingPaths, "/login", "/super-admin/login", "/saas/admin/login", "/signup", "/reset-password", "/workspace/create"]);
const platformNavigation: { path: string; label: string; icon: LucideIcon }[] = [
  { path: "/saas/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/saas/admin/users", label: "Users", icon: UserPlus },
  { path: "/saas/admin/companies", label: "Companies", icon: Building2 },
  { path: "/saas/admin/workspaces", label: "Workspace Requests", icon: ClipboardList },
  { path: "/saas/admin/plans", label: "Subscription Plans", icon: BarChart3 },
  { path: "/saas/admin/subscriptions", label: "Subscriptions", icon: PieChart },
  { path: "/saas/admin/domains", label: "Custom Domains", icon: Globe2 },
  { path: "/saas/admin/growth-tools", label: "Growth Tools", icon: Wrench },
  { path: "/saas/admin/security", label: "Security & License Register", icon: ShieldCheck },
  { path: "/saas/admin/settings", label: "Platform Settings", icon: Settings },
];
const organizationNavigation: { path: string; label: string; icon: LucideIcon }[] = [
  { path: "/org/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/org/leads", label: "Leads", icon: Users },
  { path: "/org/users", label: "Sales Team / Users", icon: UserPlus },
  { path: "/org/teams", label: "Teams", icon: UsersRound },
  { path: "/org/calling", label: "Calling", icon: Headphones },
  { path: "/org/campaigns", label: "Campaigns", icon: Target },
  { path: "/org/follow-ups", label: "Follow-ups", icon: ClipboardList },
  { path: "/org/pipeline", label: "Pipeline", icon: Target },
  { path: "/org/reports", label: "Reports", icon: PieChart },
  { path: "/org/automations", label: "Automations", icon: Bot },
  { path: "/org/integrations", label: "Integrations", icon: Plug },
  { path: "/org/settings", label: "Organization Settings", icon: Settings },
  { path: "/org/site-visits", label: "Site Visits", icon: CalendarDays },
  { path: "/org/bookings", label: "Bookings", icon: Target },
  { path: "/org/customer-360", label: "Customer 360", icon: UsersRound },
  { path: "/org/notifications", label: "Notifications", icon: Bell },
];

function App() {
  const [session, setSession] = useState<Session | null | undefined>(isSupabaseConfigured ? undefined : null);
  const [routePath, setRoutePath] = useState(() => window.location.pathname);
  const [view, setView] = useState<View>(() => resolveDashboardRoute(window.location.pathname)?.view ?? "Overview");
  const [leads, setLeads] = useState<Lead[]>(isSupabaseConfigured ? [] : initialLeads);
  const [totalLeadCount, setTotalLeadCount] = useState(isSupabaseConfigured ? 0 : initialLeads.length);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isLoadingMoreLeads, setIsLoadingMoreLeads] = useState(false);
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [showLeadImport, setShowLeadImport] = useState(false);
  const [leadImportRefresh, setLeadImportRefresh] = useState(0);
  const [toast, setToast] = useState("");
  const [membership, setMembership] = useState<Membership | null>(null);
  const [membershipOptions, setMembershipOptions] = useState<MembershipOption[]>([]);
  const [organizationProfile, setOrganizationProfile] = useState<OrganizationProfile | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadRecord | null>(null);
  const [timeline, setTimeline] = useState<LeadEvent[]>([]);
  const [salespeople, setSalespeople] = useState<Array<{ user_id: string; role: string; profiles: { full_name: string } | null }>>([]);
  const [leadDetailsMode, setLeadDetailsMode] = useState<"share" | "transfer">("share");
  const [performance, setPerformance] = useState<PersonalPerformance | null>(null);
  const [leadTrend, setLeadTrend] = useState<LeadTrendPoint[]>([]);
  const [isLoadingLeadTrend, setIsLoadingLeadTrend] = useState(false);
  const [operationLeads, setOperationLeads] = useState<LeadRecord[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [membershipLoaded, setMembershipLoaded] = useState(false);
  const [membershipError, setMembershipError] = useState("");
  const [membershipRefresh, setMembershipRefresh] = useState(0);
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const authUserId = useRef<string | null>(null);
  const logoutInProgress = useRef(false);
  const leadPageAbort = useRef<AbortController | null>(null);
  const loadMoreAbort = useRef<AbortController | null>(null);

  const navigateToPath = useCallback((path: string, replace = false) => {
    const normalizedPath = normalizePathname(path);
    if (isMalformedOrganizationPath(normalizedPath)) {
      setToast("This organization link is incomplete. Your workspace was not changed.");
      return;
    }
    if (replace) window.history.replaceState({}, "", normalizedPath);
    else if (window.location.pathname !== normalizedPath) window.history.pushState({}, "", normalizedPath);
    setRoutePath(normalizedPath);
    const route = resolveDashboardRoute(normalizedPath);
    if (route) setView(route.view);
    setSidebarOpen(false);
  }, []);

  const chooseMembership = useCallback((option: MembershipOption) => {
    if (session) sessionStorage.setItem(`adometa-organization:${session.user.id}`, option.organization_id);
    setMembership(option);
    setMembershipOptions([]);
    navigateToPath(getRoleDashboardPath(option.role), true);
  }, [navigateToPath, session]);

  useEffect(() => {
    const handlePopState = () => {
      const path = normalizePathname(window.location.pathname);
      setRoutePath(path);
      const route = resolveDashboardRoute(path);
      if (route) setView(route.view);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    void redirectToCanonicalDomain().catch(() => {
      console.warn("Canonical domain redirect could not be checked.");
    });
  }, []);

  useEffect(() => {
    void applyRouteMetadata(routePath, Boolean(session))
      .catch(() => console.warn("Page metadata could not be updated."));
  }, [routePath, session]);

  useEffect(() => {
    if (session === undefined) return;
    const path = normalizePathname(routePath);
    const isLegacyDashboard = path === "/dashboard" || path === "/super-admin/dashboard";
    if (!session) {
      if (getDocumentationCenter(path)) navigateToPath(path === "/saas/admin/docs" ? "/super-admin/login" : "/login", true);
      else if (isSaasAdminPath(path)) navigateToPath("/super-admin/login", true);
      else if (isOrganizationPath(path) || isLegacyDashboard) navigateToPath("/login", true);
      return;
    }
    if (!membershipLoaded || membershipOptions.length || membershipError || !membership) return;
    if (getDocumentationCenter(path) || path === "/reset-password") return;
    if (path === "/saas/admin") {
      navigateToPath("/saas/admin/dashboard", true);
      return;
    }
    if (path === "/org") {
      navigateToPath("/org/dashboard", true);
      return;
    }
    if (
      isLegacyDashboard || path === "/" || path === "/login" || path === "/signup"
      || path === "/super-admin/login" || path === "/saas/admin/login"
      || publicMarketingPaths.has(path) || path === "/workspace/create"
    ) {
      navigateToPath(getRoleDashboardPath(membership.role), true);
      return;
    }
    const route = resolveDashboardRoute(path);
    if (route) {
      if (!canAccessDashboardRoute(path, membership.role, membership.is_active)) {
        navigateToPath(getRoleDashboardPath(membership.role), true);
        return;
      }
      setView(route.view);
      return;
    }
    if ((isSaasAdminPath(path) && membership.role !== "super_admin") || (isOrganizationPath(path) && membership.role === "super_admin")) {
      navigateToPath(getRoleDashboardPath(membership.role), true);
    }
  }, [membership, membershipError, membershipLoaded, membershipOptions.length, navigateToPath, routePath, session]);

  const clearWorkspaceState = useCallback(() => {
    setMembership(null);
    setMembershipOptions([]);
    setOrganizationProfile(null);
    setTeams([]);
    setSelectedLead(null);
    setTimeline([]);
    setSalespeople([]);
    setPerformance(null);
    setLeadTrend([]);
    setIsLoadingLeadTrend(false);
    setOperationLeads([]);
    setUnreadNotifications(0);
    setLeads(isSupabaseConfigured ? [] : initialLeads);
    setTotalLeadCount(isSupabaseConfigured ? 0 : initialLeads.length);
    setTeamNames([]);
    setMembershipError("");
    setQuery("");
    setView("Overview");
    setSidebarOpen(false);
    setShowLeadForm(false);
    leadPageAbort.current?.abort();
    loadMoreAbort.current?.abort();
    setIsLoadingMoreLeads(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        authUserId.current = null;
        clearWorkspaceState();
        setSession(null);
        setMembershipLoaded(true);
        setMembershipError("Your secure session could not be restored. Please sign in again.");
        const loginPath = isSaasAdminPath(window.location.pathname) ? "/super-admin/login" : "/login";
        navigateToPath(`${loginPath}?reason=session-expired`, true);
        return;
      }
      authUserId.current = data.session?.user.id ?? null;
      setSession(data.session);
    }).catch(() => {
      if (!active) return;
      authUserId.current = null;
      clearWorkspaceState();
      setSession(null);
      setMembershipLoaded(true);
      setMembershipError("Your secure session could not be restored. Please sign in again.");
      const loginPath = isSaasAdminPath(window.location.pathname) ? "/super-admin/login" : "/login";
      navigateToPath(`${loginPath}?reason=session-expired`, true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const previousUserId = authUserId.current;
      const nextUserId = nextSession?.user.id ?? null;
      authUserId.current = nextUserId;
      if (previousUserId !== nextUserId) {
        if (previousUserId && !nextUserId) sessionStorage.removeItem(`adometa-organization:${previousUserId}`);
        clearWorkspaceState();
        setMembershipLoaded(!nextUserId);
      }
      setSession(nextSession);
      if (previousUserId && !nextUserId) {
        const loginPath = isSaasAdminPath(window.location.pathname) || window.location.pathname.startsWith("/super-admin") ? "/super-admin/login" : "/login";
        const reason = logoutInProgress.current ? "" : "?reason=session-expired";
        navigateToPath(`${loginPath}${reason}`, true);
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [clearWorkspaceState, navigateToPath]);

  useEffect(() => {
    if (!supabase || !session) {
      setMembership(null);
      setMembershipOptions([]);
      setMembershipLoaded(true);
      return;
    }
    let active = true;
    setMembershipLoaded(false);
    setMembershipError("");
    void listCurrentMemberships().then((currentMemberships) => {
      if (!active) return;
      const platformMembership = currentMemberships.find((option) => option.role === "super_admin");
      if (platformMembership) {
        setMembership(platformMembership);
        setMembershipOptions([]);
        setOrganizationProfile(null);
        setTeamNames([]);
      } else {
        const selectedOrganizationId = sessionStorage.getItem(`adometa-organization:${session.user.id}`);
        const selectedMembership = currentMemberships.find((option) => option.organization_id === selectedOrganizationId);
        if (selectedMembership) {
          setMembership(selectedMembership);
          setMembershipOptions([]);
        } else if (currentMemberships.length > 1) {
          setMembership(null);
          setMembershipOptions(currentMemberships);
        } else {
          setMembership(currentMemberships[0] ?? null);
          setMembershipOptions([]);
        }
      }
      setMembershipLoaded(true);
    }).catch((error: Error) => {
      if (!active) return;
      setMembership(null);
      setMembershipLoaded(true);
      setMembershipError(error.message || "Organization access could not be verified.");
    });
    return () => { active = false; };
  }, [session?.user.id, membershipRefresh]);

  useEffect(() => {
    if (!membership || membership.role === "super_admin" || getDocumentationCenter(routePath) || isSaasAdminPath(routePath)) return;
    let active = true;
    void Promise.all([
      getOrganizationProfile(membership.organization_id),
      listUserTeamNames(membership.organization_id, membership.user_id),
    ]).then(([profile, names]) => {
      if (!active) return;
      setOrganizationProfile(profile);
      setTeamNames(names);
    }).catch((error) => {
      if (active) notify(error instanceof Error ? error.message : "Workspace details could not be loaded.");
    });
    return () => { active = false; };
  }, [membership?.organization_id, membership?.user_id, membership?.role, routePath]);

  useEffect(() => {
    if (!membership || membership.role !== "agent" || view !== "Overview") {
      setPerformance(null);
      return;
    }
    let active = true;
    void getPersonalPerformance(membership.organization_id, membership.user_id)
      .then((currentPerformance) => { if (active) setPerformance(currentPerformance); })
      .catch((error) => { if (active) notify(error instanceof Error ? error.message : "Performance data could not be loaded."); });
    return () => { active = false; };
  }, [membership?.organization_id, membership?.user_id, membership?.role, view]);

  useEffect(() => {
    if (!supabase || !session || !membership || membership.role === "super_admin" || view !== "Overview") {
      setLeadTrend([]);
      setIsLoadingLeadTrend(false);
      return;
    }
    let active = true;
    setIsLoadingLeadTrend(true);
    void getOrganizationLeadTrend(membership.organization_id).then((points) => {
      if (active) setLeadTrend(points);
    }).catch((error) => {
      if (active) notify(error instanceof Error ? error.message : "Lead growth data could not be loaded.");
    }).finally(() => {
      if (active) setIsLoadingLeadTrend(false);
    });
    return () => { active = false; };
  }, [membership?.organization_id, membership?.role, session?.user.id, view]);

  useEffect(() => {
    if (!membership || view !== "Teams" || !["company_owner", "organization_admin", "manager"].includes(membership.role)) return;
    let active = true;
    void listTeams(membership.organization_id)
      .then((currentTeams) => { if (active) setTeams(currentTeams); })
      .catch((error) => { if (active) notify(error instanceof Error ? error.message : "Teams could not be loaded."); });
    return () => { active = false; };
  }, [membership?.organization_id, membership?.role, view]);

  useEffect(() => {
    const path = routePath;
    if (!getDocumentationCenter(path) || session === undefined) return;
    if (!session) {
      navigateToPath(path === "/saas/admin/docs" ? "/super-admin/login" : "/login", true);
      return;
    }
    if (!membershipLoaded) return;
    if (membershipOptions.length > 1 && !membership) return;
    const redirectPath = getDocumentationRedirectPath(path, membership);
    if (redirectPath) navigateToPath(redirectPath, true);
  }, [session, membershipLoaded, membership, membershipOptions.length, navigateToPath, routePath]);

  useEffect(() => {
    if (!supabase || !session || !membership || membership.role === "super_admin" || getDocumentationCenter(routePath) || isSaasAdminPath(routePath)) return;
    let active = true;
    void countUnreadNotifications(membership.organization_id, membership.user_id)
      .then((count) => { if (active) setUnreadNotifications(count); })
      .catch((error: Error) => { if (active) notify(error.message || "Notifications could not be loaded."); });
    return () => { active = false; };
  }, [session?.user.id, membership?.organization_id, membership?.role, routePath]);

  useEffect(() => {
    leadPageAbort.current?.abort();
    loadMoreAbort.current?.abort();
    setIsLoadingMoreLeads(false);
    if (!supabase || !session || !membership || membership.role === "super_admin" || !leadLoadingViews.has(view) || getDocumentationCenter(routePath) || isSaasAdminPath(routePath)) {
      setIsLoadingLeads(false);
      return;
    }
    let active = true;
    const controller = new AbortController();
    leadPageAbort.current = controller;
    setIsLoadingLeads(true);
    void listLeadsPage(debouncedQuery, { offset: 0, limit: LEAD_PAGE_SIZE, includeTotal: true, signal: controller.signal }).then((page) => {
      if (!active) return;
      setOperationLeads(page.records);
      setLeads(page.records.map(toUiLead));
      setTotalLeadCount(page.totalCount ?? page.records.length);
      setIsLoadingLeads(false);
    }).catch((error: Error) => {
      if (active && !controller.signal.aborted) notify(error.message || "Leads could not be loaded.");
      if (active) setIsLoadingLeads(false);
    });
    return () => {
      active = false;
      controller.abort();
      loadMoreAbort.current?.abort();
    };
  }, [debouncedQuery, leadImportRefresh, session?.user.id, membership?.organization_id, membership?.role, routePath, view]);

  const loadMoreLeads = async (): Promise<boolean> => {
    if (!supabase || !membership || isLoadingMoreLeads || operationLeads.length >= totalLeadCount) return false;
    loadMoreAbort.current?.abort();
    const controller = new AbortController();
    loadMoreAbort.current = controller;
    setIsLoadingMoreLeads(true);
    try {
      const page = await listLeadsPage(debouncedQuery, {
        offset: operationLeads.length,
        limit: LEAD_PAGE_SIZE,
        includeTotal: false,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setOperationLeads((current) => [...current, ...page.records]);
        setLeads((current) => [...current, ...page.records.map(toUiLead)]);
        if (page.records.length < LEAD_PAGE_SIZE) setTotalLeadCount(operationLeads.length + page.records.length);
      }
      return !controller.signal.aborted && page.records.length > 0;
    } catch (error) {
      if (!controller.signal.aborted) notify(error instanceof Error ? error.message : "More leads could not be loaded.");
      return false;
    } finally {
      if (!controller.signal.aborted) setIsLoadingMoreLeads(false);
    }
  };

  const filteredLeads = useMemo(() => isSupabaseConfigured ? leads : leads.filter((lead) =>
    `${lead.name} ${lead.company} ${lead.id} ${lead.source}`.toLowerCase().includes(query.toLowerCase()),
  ), [leads, query]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  useEffect(() => {
    if (!isMalformedOrganizationPath(routePath) || !membershipLoaded || !membership) return;
    notify("This organization link was incomplete. Opening your authorized dashboard.");
    navigateToPath(getRoleDashboardPath(membership.role), true);
  }, [membership, membershipLoaded, navigateToPath, notify, routePath]);

  const addLead = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    if (!name) return;
    if (supabase) {
      try {
        const saved = await createLead({ full_name: name, company: String(form.get("company") || "New account"), phone: String(form.get("phone") || "") || null });
        const uiLead = toUiLead(saved);
        if (!debouncedQuery) {
          setLeads((current) => [uiLead, ...current]);
          setOperationLeads((current) => [saved, ...current]);
          setTotalLeadCount((current) => current + 1);
        }
      } catch (error) {
        notify(error instanceof Error ? error.message : "Could not create lead");
        return;
      }
    } else setLeads((current) => [{
      id: `AD-${1049 + current.length}`, name, company: String(form.get("company") || "New account"),
      source: "Manual", status: "New", score: 50, owner: "—", date: "Just now", color: "#e8e4ff",
    }, ...current]);
    setShowLeadForm(false);
    notify("Lead created successfully");
  };

  const loadLeadDetails = async (externalId: string, mode: "share" | "transfer" = "share") => {
    if (!supabase || !membership) return;
    try {
      const record = await getLeadByExternalId(externalId);
      const [events, people] = await Promise.all([
        listLeadTimeline(record.id),
        listOrganizationSalespeople(membership.organization_id),
      ]);
      setSelectedLead(record);
      setLeadDetailsMode(mode);
      setTimeline(events);
      setSalespeople(people);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not open lead");
    }
  };

  const handleLogout = async () => {
    if (!window.confirm("Sign out of Adometa CRM?")) return;
    logoutInProgress.current = true;
    try {
      await signOut();
      const loginPath = membership?.role === "super_admin" || window.location.pathname.startsWith("/super-admin")
        ? "/super-admin/login"
        : "/login";
      if (session) sessionStorage.removeItem(`adometa-organization:${session.user.id}`);
      authUserId.current = null;
      clearWorkspaceState();
      setMembershipLoaded(true);
      setSession(null);
      navigateToPath(loginPath, true);
    } catch (error) {
      notify(error instanceof Error ? `Sign out failed: ${error.message}` : "Sign out failed. Please try again.");
      throw error;
    } finally {
      logoutInProgress.current = false;
    }
  };

  useEffect(() => {
    if (!sidebarOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [sidebarOpen]);

  if (supabaseConfigError && !publicMarketingPaths.has(routePath)) return <section className="auth-page"><div className="modal auth-card"><div className="brand auth-brand"><div className="brand-mark">A</div><span>adometa</span></div><p className="eyebrow">APPLICATION CONFIGURATION</p><h1>Workspace unavailable</h1><p className="muted" role="alert">{supabaseConfigError}</p><p className="muted">Configure the frontend settings in the deployment environment, then reload this page. No demo records are shown.</p></div></section>;
  if (routePath === "/reset-password") return <PublicLayout><ResetPasswordScreen /></PublicLayout>;
  if (isSupabaseConfigured && session === undefined) return <PublicLoading message="Loading secure workspace" />;
  const documentationCenter = getDocumentationCenter(routePath);
  if (documentationCenter) {
    if (!session) return <PublicLayout>{routePath === "/saas/admin/docs" ? <SuperAdminLoginScreen /> : <LoginScreen />}</PublicLayout>;
    if (!membershipLoaded) {
      return <PublicLoading message="Verifying documentation access" />;
    }
    if (membershipOptions.length > 1 && !membership) return <OrganizationSelectionView memberships={membershipOptions} onSelect={chooseMembership} onSignOut={() => void handleLogout().catch(() => undefined)} />;
    if (!membership || !canAccessDocumentation(routePath, membership)) return <RouteAccessDenied homePath={membership ? getRoleDashboardPath(membership.role) : "/login"} />;
    return <Suspense fallback={<PublicLoading message="Loading documentation" />}><DocumentationCenter centerId={documentationCenter} membership={membership} /></Suspense>;
  }
  if (!session && (isSupabaseConfigured && (isSaasAdminPath(routePath) || isOrganizationPath(routePath) || routePath === "/dashboard" || routePath === "/super-admin/dashboard") || isSaasAdminPath(routePath))) {
    return <PublicLayout>{isSaasAdminPath(routePath) || routePath === "/super-admin/dashboard" ? <SuperAdminLoginScreen /> : <LoginScreen />}</PublicLayout>;
  }
  if (!session && routePath === "/saas/admin/login") return <PublicLayout><SuperAdminLoginScreen /></PublicLayout>;
  if (!session && !publicApplicationPaths.has(routePath)) return <NotFoundView />;
  if (!session) return <PublicRoute session={session}><PublicLayout><PublicPage path={routePath} /></PublicLayout></PublicRoute>;
  if (isSupabaseConfigured && !membershipLoaded) return <div className="public-loading"><div className="muted">Verifying organization access...</div></div>;
  if (membershipOptions.length > 1 && !membership) {
    return <OrganizationSelectionView
      memberships={membershipOptions}
      onSelect={chooseMembership}
      onSignOut={() => void handleLogout().catch(() => undefined)}
    />;
  }
  if (isSupabaseConfigured && !membership && !membershipError) return <Suspense fallback={<PublicLoading message="Loading workspace setup" />}><WorkspaceOnboardingView
    onRefreshMembership={() => setMembershipRefresh((value) => value + 1)}
    onSignOut={() => void handleLogout().catch(() => undefined)}
    onNotify={notify}
  /></Suspense>;
  if (isSupabaseConfigured && (!membership || membershipError)) return <section className="auth-page"><div className="modal auth-card"><div className="brand auth-brand"><div className="brand-mark">A</div><span>adometa</span></div><p className="eyebrow">WORKSPACE ACCESS</p><h1>{membershipError ? "Access could not be verified" : "No active organization"}</h1><p className="muted">{membershipError || "Your account does not have an active organization membership."}</p>{membershipError && <button className="button secondary auth-submit" onClick={() => setMembershipRefresh((value) => value + 1)}>Try again</button>}<button className="button primary auth-submit" onClick={() => void handleLogout().catch(() => undefined)}>Sign out</button></div></section>;
  const currentDashboardRoute = resolveDashboardRoute(routePath);
  if (currentDashboardRoute && membership && !canAccessDashboardRoute(routePath, membership.role, membership.is_active)) {
    return <RouteAccessDenied homePath={getRoleDashboardPath(membership.role)} />;
  }
  if (membership && ((isSaasAdminPath(routePath) && membership.role !== "super_admin") || (isOrganizationPath(routePath) && membership.role === "super_admin"))) {
    return <RouteAccessDenied homePath={getRoleDashboardPath(membership.role)} />;
  }
  if (!isSupabaseConfigured && currentDashboardRoute?.area === "saas") return <NotFoundView />;
  if (!currentDashboardRoute && !publicApplicationPaths.has(routePath) && routePath !== "/dashboard" && routePath !== "/super-admin/dashboard") {
    return <NotFoundView />;
  }
  return <ProtectedRoute session={session ?? null} allowAnonymous={!isSupabaseConfigured}><DashboardLayout>{(
    <div className="app-shell">
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside id="workspace-navigation" className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`} onClick={(event) => {
        if (event.target instanceof Element && event.target.closest(".nav-item")) setSidebarOpen(false);
      }}>
        <div className="brand"><div className="brand-mark">A</div><span>adometa</span><button className="close-menu" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
        <div className="workspace-switcher"><div className="workspace-avatar">{membership?.role === "super_admin" ? "AD" : organizationProfile?.name?.slice(0, 2).toUpperCase() || "OR"}</div><div><strong>{membership?.role === "super_admin" ? "Adometa Platform" : organizationProfile?.name || "Organization"}</strong><small>{membership?.role === "super_admin" ? "SaaS administration" : "Workspace"}</small></div><ChevronDown size={16} /></div>
        <p className="nav-heading">{membership?.role === "super_admin" ? "PLATFORM" : "WORKSPACE"}</p>
        <nav aria-label={membership?.role === "super_admin" ? "SaaS administration" : "Organization workspace"}>
          {(membership?.role === "super_admin" ? platformNavigation : organizationNavigation)
            .filter((item) => membership?.role === "super_admin" || Boolean(membership && canAccessDashboardRoute(item.path, membership.role, membership.is_active)))
            .map(({ path, label, icon: Icon }) => {
              const active = routePath === path || path === "/saas/admin/domains" && routePath.startsWith("/saas/admin/domains/");
              return <button key={path} className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => navigateToPath(path)}><Icon size={18} /><span>{label}</span>{label === "Leads" && <em>{isSupabaseConfigured ? leads.length : "Demo"}</em>}</button>;
            })}
          {membership?.role === "super_admin" && <button className={`nav-item ${routePath === "/saas/admin/database" ? "active" : ""}`} onClick={() => navigateToPath("/saas/admin/database")}><Database size={18} /><span>Database Monitoring</span></button>}
        </nav>
        <p className="nav-heading">HELP</p>
        <nav>
          <a className="nav-item documentation-workspace-link" href={membership?.role === "super_admin" ? "/saas/admin/docs" : membership?.role === "company_owner" || membership?.role === "organization_admin" ? "/admin/docs" : "/docs"}><CircleHelp size={18} /><span>{membership?.role === "super_admin" ? "Platform guide" : membership?.role === "company_owner" || membership?.role === "organization_admin" ? "Admin guide" : "Help center"}</span></a>
        </nav>
        <button className="nav-item mobile-signout" onClick={() => void handleLogout().catch(() => undefined)}><LogOut size={18} /><span>Sign out</span></button>
        {membership?.role !== "super_admin" && <div className="sidebar-bottom"><div className="upgrade-card"><Zap size={17} /><strong>Make more happen</strong><p>Unlock advanced analytics and automation.</p><button onClick={() => navigateToPath("/org/settings")}>Explore plans <ArrowUpRight size={14} /></button></div></div>}
      </aside>
      <main className="main-content">
        <header className="topbar"><button className="mobile-menu" aria-label="Open navigation" aria-expanded={sidebarOpen} aria-controls="workspace-navigation" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button><div className="breadcrumbs"><span>{membership?.role === "super_admin" ? "Platform" : organizationProfile?.name || "Workspace"}</span><span>/</span><strong>{currentDashboardRoute?.label || view}</strong></div><div className="topbar-actions"><div className="global-search"><Search size={17} /><input placeholder="Search anything..." value={query} onChange={(e) => setQuery(e.target.value)} /><kbd>⌘ K</kbd></div><a className="icon-button" aria-label="Help center" title="Help center" href={membership?.role === "super_admin" ? "/saas/admin/docs" : membership?.role === "company_owner" || membership?.role === "organization_admin" ? "/admin/docs" : "/docs"}><CircleHelp size={19} /></a>{membership?.role !== "super_admin" && <button className="icon-button notification" aria-label={`Notifications${unreadNotifications ? ` (${unreadNotifications} unread)` : ""}`} onClick={() => navigateToPath("/org/notifications")}><Bell size={19} />{unreadNotifications > 0 && <span className="notification-count">{unreadNotifications}</span>}</button>}{membership && <ProfileMenu session={session} membership={membership} organizationName={organizationProfile?.name || ""} organizationIsActive={organizationProfile?.is_active ?? null} teamNames={teamNames} onLogout={handleLogout} />}</div></header>
        <div className="page-content">
          <Suspense fallback={<div className="route-loading" role="status">Loading this view…</div>}>
          {view === "Platform" && membership && currentDashboardRoute?.section && <PlatformAdminView membership={membership} section={currentDashboardRoute.section} onNotify={notify} />}
          {view === "Users" && membership?.role === "super_admin" && <PlatformUserManagementView onNotify={notify} onOpenCompanies={() => navigateToPath("/saas/admin/companies")} />}
          {routePath === "/saas/admin/domains" && membership?.role === "super_admin" && <DomainManagementView onOpenLinks={() => navigateToPath("/saas/admin/domains/links")} />}
          {routePath === "/saas/admin/domains/links" && membership?.role === "super_admin" && <DomainLinksView />}
          {view === "Database Monitoring" && membership && <DatabaseMonitoringView membership={membership} session={session ?? null} onNotify={notify} />}
          {view === "Growth Tools" && membership && <GrowthToolsView membership={membership} />}
          {view === "License Register" && membership && <LicenseRegisterView membership={membership} />}
          {view === "Platform Settings" && <PlatformSettingsView onOpenDomains={() => navigateToPath("/saas/admin/domains")} onOpenDatabase={() => navigateToPath("/saas/admin/database")} />}
          {view === "Automation" && membership && <AutomationView membership={membership} onNotify={notify} />}
          {view === "Sales Pipeline" && membership && <SalesPipelineView membership={membership} onNotify={notify} />}
          {view === "Customer 360" && membership && <Customer360View membership={membership} onNotify={notify} />}
          {view === "Overview" && <Overview leads={leads} totalLeadCount={totalLeadCount} trend={leadTrend} isLoadingTrend={isLoadingLeadTrend} performance={performance} role={membership?.role} organizationName={organizationProfile?.name || ""} teamNames={teamNames} userName={String(session.user.user_metadata?.full_name || session.user.email || "").split("@")[0].split(/\s+/)[0]} onAdd={() => setShowLeadForm(true)} onViewLeads={() => navigateToPath("/org/leads")} onOpenLead={(id) => void loadLeadDetails(id)} />}
          {view === "Leads" && <LeadsView leads={filteredLeads} totalCount={totalLeadCount} isLoading={isLoadingLeads} isSearchPending={query.trim() !== debouncedQuery} isLoadingMore={isLoadingMoreLeads} hasMore={Boolean(supabase) && operationLeads.length < totalLeadCount} onLoadMore={() => void loadMoreLeads()} query={query} onAdd={() => setShowLeadForm(true)} canImport={membership?.role === "company_owner" || membership?.role === "organization_admin"} onImport={() => setShowLeadImport(true)} onOpen={(externalId) => void loadLeadDetails(externalId)} onTransfer={(externalId) => void loadLeadDetails(externalId, "transfer")} onStatusChange={async (id, status) => { try { if (supabase) await updateLeadStatus(id, status.toLowerCase().replace("-", "_") as LeadStatus); setLeads((all) => all.map((lead) => lead.id === id ? { ...lead, status } : lead)); notify("Lead status updated"); } catch (error) { notify(error instanceof Error ? error.message : "Could not update lead"); } }} />}
          {view === "Campaigns" && (isSupabaseConfigured ? <ModulePending eyebrow="CAMPAIGN MANAGEMENT" title="Campaigns" description="Campaign records will appear here after the campaign repository is connected." icon={<Target size={24} />} /> : <Campaigns onNotify={notify} />)}
          {view === "Follow-ups" && (membership ? <FollowUpsView membership={membership} leads={operationLeads} onNotify={notify} /> : <ModulePending eyebrow="FOLLOW-UP QUEUE" title="Follow-ups" description="An authenticated organization membership is required." icon={<ClipboardList size={24} />} />)}
          {view === "Calling" && <CallingWorkspace leads={filteredLeads} membership={membership} hasMore={Boolean(supabase) && operationLeads.length < totalLeadCount} isLoadingMore={isLoadingMoreLeads} onLoadMore={loadMoreLeads} onNotify={notify} />}
          {view === "Site Visits" && (membership ? <SiteVisitsView membership={membership} leads={operationLeads} onNotify={notify} /> : <ModulePending eyebrow="FIELD WORK" title="Site visits" description="An authenticated organization membership is required." icon={<CalendarDays size={24} />} />)}
          {view === "Bookings" && (membership ? <BookingsView membership={membership} leads={operationLeads} onNotify={notify} /> : <ModulePending eyebrow="REVENUE" title="Bookings" description="An authenticated organization membership is required." icon={<Target size={24} />} />)}
          {view === "Teams" && (membership?.role === "company_owner" || membership?.role === "organization_admin" || membership?.role === "manager" ? <TeamsView membership={membership} teams={teams} onCreated={(team) => setTeams((current) => [team, ...current])} onNotify={notify} /> : <ModulePending eyebrow="TEAM MANAGEMENT" title="Teams & roles" description="Your current role does not have access to team management." icon={<UsersRound size={24} />} />)}
          {view === "Company" && membership && <CompanyAdminView membership={membership} onNotify={notify} />}
          {view === "Organization Settings" && membership && <><PageHeader eyebrow="ORGANIZATION" title="Organization settings" description="Manage organization contact details and audit history." /><OrganizationAdminControls organizationId={membership.organization_id} onNotify={notify} /></>}
          {view === "Reports" && (membership ? <ReportsView membership={membership} onNotify={notify} /> : <ModulePending eyebrow="ANALYTICS" title="Reports & analytics" description="An authenticated organization membership is required." icon={<PieChart size={24} />} />)}
          {view === "Notifications" && (membership ? <NotificationsView membership={membership} onNotify={notify} onUnreadCount={setUnreadNotifications} /> : <ModulePending eyebrow="ACTIVITY CENTER" title="Notifications" description="An authenticated organization membership is required." icon={<Bell size={24} />} />)}
          {view === "Statuses" && (membership?.role === "company_owner" || membership?.role === "organization_admin" ? <StatusSettingsView membership={membership} onNotify={notify} /> : <ModulePending eyebrow="WORKSPACE SETTINGS" title="Lead statuses" description="Only company owners and organization admins can manage statuses." icon={<Settings size={24} />} />)}
          {view === "Integrations" && membership && <Integrations membership={membership} onNotify={notify} />}
          </Suspense>
        </div>
      </main>
      {showLeadForm && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowLeadForm(false)}><form className="modal" onSubmit={addLead}><div className="modal-head"><div><p className="eyebrow">NEW RECORD</p><h2>Create a lead</h2></div><button type="button" className="icon-button" onClick={() => setShowLeadForm(false)}><X size={19} /></button></div><label>Full name<input name="name" required placeholder="e.g. Rohan Mehta" autoFocus /></label><label>Company<input name="company" placeholder="e.g. Acme Pvt. Ltd." /></label><label>Phone number<input name="phone" type="tel" placeholder="+91 98765 43210" /></label><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setShowLeadForm(false)}>Cancel</button><button className="button primary" type="submit">Create lead</button></div></form></div>}
      {showLeadImport && membership && <LeadCsvImportModal organizationId={membership.organization_id} onClose={() => setShowLeadImport(false)} onImported={(result) => {
        setShowLeadImport(false);
        if (result.imported) setLeadImportRefresh((current) => current + 1);
        notify(`${result.imported} leads imported; ${result.duplicates} existing duplicates and ${result.invalidRows} invalid rows skipped.${result.error ? ` ${result.error}` : ""}`);
      }} onNotify={notify} />}
      {selectedLead && <LeadDetails lead={selectedLead} events={timeline} salespeople={salespeople} initialMode={leadDetailsMode} onClose={() => setSelectedLead(null)} onNotify={notify} onRefresh={async () => setTimeline(await listLeadTimeline(selectedLead.id))} />}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  )}</DashboardLayout></ProtectedRoute>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div>{action}</div>;
}

function toUiLead(record: LeadRecord): Lead {
  const statusMap: Record<LeadStatus, Status> = { new: "New", contacted: "Contacted", qualified: "Qualified", follow_up: "Follow-up", won: "Won", lost: "Follow-up" };
  return { id: record.external_id, dbId: record.id, phone: record.phone, name: record.full_name, company: record.company || "New account", source: record.source, status: statusMap[record.status], score: record.score, owner: record.assigned_to ? record.assigned_to.slice(0, 2).toUpperCase() : "—", date: new Date(record.created_at).toLocaleString(), color: "#e1f4ec" };
}

function ModulePending({ eyebrow, title, description, icon }: { eyebrow: string; title: string; description: string; icon: React.ReactNode }) {
  return <><PageHeader eyebrow={eyebrow} title={title} description={description} /><section className="card pending-module"><div className="pending-icon">{icon}</div><h2>Ready for configuration</h2><p>This workspace is intentionally not showing demo data. Connect the required backend workflow to enable this module.</p><span className="pending-pill"><ShieldCheck size={14} /> Secure by default</span></section></>;
}

function OrganizationSelectionView({ memberships, onSelect, onSignOut }: { memberships: MembershipOption[]; onSelect: (membership: MembershipOption) => void; onSignOut: () => void }) {
  const roleLabels: Record<Membership["role"], string> = {
    super_admin: "SaaS Super Admin",
    company_owner: "Company Owner",
    organization_admin: "Organization Admin",
    manager: "Sales Manager",
    agent: "Salesperson",
    auditor: "Auditor",
  };
  return <main className="auth-page"><section className="modal auth-card"><div className="brand auth-brand"><div className="brand-mark">A</div><span>adometa</span></div><p className="eyebrow">ORGANIZATION ACCESS</p><h1>Choose a workspace</h1><p className="muted">Your account has access to more than one organization. Select which workspace to open.</p><div className="organization-choice-list">{memberships.map((option) => <button className="button secondary" key={option.organization_id} onClick={() => onSelect(option)}><Building2 size={17} /><span><strong>{option.organization_name}</strong><small>{roleLabels[option.role]}</small></span><ArrowUpRight size={16} /></button>)}</div><button className="text-button auth-toggle" onClick={onSignOut}>Sign out</button></section></main>;
}

function RouteAccessDenied({ homePath }: { homePath: string }) {
  return <section className="auth-page"><div className="modal auth-card"><div className="brand auth-brand"><div className="brand-mark">A</div><span>adometa</span></div><p className="eyebrow">403 · ACCESS DENIED</p><h1>This page is not available for your role</h1><p className="muted">Your verified membership does not have permission to open this route.</p><a className="button primary auth-submit" href={homePath}>Go to your dashboard</a></div></section>;
}

function NotFoundView() {
  return <section className="auth-page"><div className="modal auth-card"><div className="brand auth-brand"><div className="brand-mark">A</div><span>adometa</span></div><p className="eyebrow">404 · NOT FOUND</p><h1>This page does not exist</h1><p className="muted">Check the URL or return to the Adometa home page.</p><a className="button primary auth-submit" href="/">Go to home</a></div></section>;
}

function PlatformSettingsView({ onOpenDomains, onOpenDatabase }: { onOpenDomains: () => void; onOpenDatabase: () => void }) {
  return <><PageHeader eyebrow="PLATFORM CONFIGURATION" title="Platform settings" description="Platform-level settings remain protected and are changed only through verified administration workflows." /><section className="card pending-module"><h2>Configuration ownership</h2><p className="muted">Custom-domain and canonical URL settings are managed in Domain Management. Database connection credentials are deployment-managed and are not exposed in the browser.</p><div className="integration-actions"><button className="button secondary" onClick={onOpenDomains}><Globe2 size={16} /> Custom Domains</button><button className="button secondary" onClick={onOpenDatabase}><Database size={16} /> Database Monitoring</button></div></section></>;
}

function Integrations({ membership, onNotify }: { membership: Membership; onNotify: (message: string) => void }) {
  return <>
    <PageHeader eyebrow="CONNECTED SYSTEMS" title="Integrations" description="Manage the available lead import and messaging workflows for this organization." />
    <GoogleSheetsView membership={membership} onNotify={onNotify} />
    <section className="card integration-whatsapp" aria-labelledby="whatsapp-integration-title">
      <div className="card-header">
        <div className="integration-card-head">
          <div className="integration-small-icon"><MessageCircle size={18} /></div>
          <div><h2 id="whatsapp-integration-title">WhatsApp</h2><p>Organization messaging options</p></div>
        </div>
        <div className="whatsapp-status-stack"><span className="status qualified">Personal click-to-chat active</span><span className="status pending">Business API setup required</span></div>
      </div>
      <p className="muted">Personal click-to-chat is active from lead records. Techaasvik API sending and delivery tracking will show active only after a real server-side connection test succeeds.</p>
      <div className="whatsapp-api-requirements">
        <div><p className="eyebrow">TECHAASVIK API SETUP</p><h3>What is needed to connect</h3></div>
        <ul>
          <li>Techaasvik API documentation or Postman collection, including base URL, authentication header, and connection-check endpoint.</li>
          <li>API key stored only as a server-side Supabase secret—never in this page, browser storage, or lead notes.</li>
          <li>Provider account and verified sender/number ID, plus approved template names or IDs and their variable format.</li>
          <li>Test recipient and documented send/status responses; webhook URL, signature rules, and status events if delivery tracking is required.</li>
        </ul>
        <p>Number and template approval happen in Techaasvik. Adometa must verify the account through its API before showing the Business API as active.</p>
        <a href="https://bulkmarketing.techaasvik.in/" target="_blank" rel="noreferrer">Open Techaasvik <ArrowUpRight size={14} /></a>
      </div>
      <div className="integration-actions">
        <a className="button secondary" href="/org/leads"><Users size={16} /> Open lead records</a>
        <a className="button secondary" href="/admin/docs#whatsapp-business-setup"><ArrowUpRight size={16} /> Business API setup guide</a>
      </div>
    </section>
    <div className="integration-hero"><div><span className="integration-badge"><span /> COMING SOON — NOT CONNECTED</span><h2>Meta Lead Ads</h2><p>Meta Lead Ads is intentionally disabled. Google Sheets is the approved external lead-import method for this phase.</p><div className="integration-actions"><button className="button secondary" disabled onClick={() => onNotify("Meta Lead Ads is not available")}>Connect Meta account</button><button className="button secondary" disabled>Test connection</button></div></div><div className="meta-mark">f</div></div>
    <div className="integration-grid"><div className="card integration-card"><div className="integration-card-head"><div className="integration-small-icon"><Users size={18} /></div><div><h3>Facebook Pages</h3><p>Not connected</p></div></div><strong>—</strong><small>Meta integration is deferred.</small></div><div className="card integration-card"><div className="integration-card-head"><div className="integration-small-icon"><ClipboardList size={18} /></div><div><h3>Instant Forms</h3><p>Not connected</p></div></div><strong>—</strong><small>Meta integration is deferred.</small></div><div className="card integration-card"><div className="integration-card-head"><div className="integration-small-icon"><TrendingUp size={18} /></div><div><h3>Leads received</h3><p>Not connected</p></div></div><strong>—</strong><small>No Meta data is imported.</small></div></div>
    <section className="card integration-log"><div className="card-header"><div><h2>Webhook health</h2><p>Meta Lead Ads is not enabled in this phase.</p></div><span className="status pending">Not connected</span></div><div className="empty-state"><Plug size={24} /><strong>Coming Soon — Not Connected</strong><p>No Meta account, token or webhook has been requested.</p></div></section>
  </>;
}

function PublicPage({ path }: { path: string }) {
  if (path === "/login") return <LoginScreen />;
  if (path === "/super-admin/login") return <SuperAdminLoginScreen />;
  if (path === "/super-admin/dashboard") {
    window.history.replaceState({}, "", "/super-admin/login");
    return <SuperAdminLoginScreen />;
  }
  if (path === "/signup") return <SignupScreen />;
  if (path === "/workspace/create") return <div className="auth-card workspace-signin-prompt"><p className="eyebrow">WORKSPACE SETUP</p><h1>Sign in to set up your workspace</h1><p className="muted">Confirm your email address and sign in to submit a company workspace request.</p><a className="button primary auth-submit" href="/login">Sign in</a></div>;
  if (path === "/reset-password") return <ResetPasswordScreen />;
  return <Suspense fallback={<div className="route-loading" role="status">Loading page…</div>}><MarketingPublicPage path={path} /></Suspense>;
}

function SuperAdminLoginScreen() {
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(() => new URLSearchParams(window.location.search).get("reason") === "session-expired" ? "Your session expired. Sign in again to continue." : "");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "reset") {
        await requestPasswordReset(email);
        setMessage("If the account exists, a reset email has been sent.");
      } else {
        const { user } = await signIn(email, password);
        if (!user) throw new Error("Authentication did not return a user.");
        const current = await getCurrentMembership();
        if (!current || current.role !== "super_admin") {
          await signOut();
          throw new Error("This account is not authorized for Super Admin access.");
        }
        window.location.assign(await getAppUrl("/saas/admin/dashboard"));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Super Admin authentication failed");
    } finally { setBusy(false); }
  };
  return <div className="auth-page"><form className="modal auth-card" onSubmit={submit}><div className="brand auth-brand"><div className="brand-mark">A</div><span>adometa</span></div><p className="eyebrow">PLATFORM SECURITY</p><h1>{mode === "login" ? "Super Admin sign in" : "Reset Super Admin password"}</h1><p className="muted">{mode === "login" ? "Use your verified SaaS platform administrator account." : "We’ll send a secure reset link if the account exists."}</p><label>Email address<input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label>{mode === "login" && <label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>}{message && <p className="auth-message">{message}</p>}<button className="button primary auth-submit" disabled={busy}>{busy ? "Please wait..." : mode === "login" ? "Sign in securely" : "Send reset link"}</button><button type="button" className="text-button auth-toggle" onClick={() => { setMode(mode === "login" ? "reset" : "login"); setMessage(""); }}>{mode === "login" ? "Forgot password?" : "Back to sign in"}</button><a className="text-button auth-toggle" href="/login">Workspace sign in</a></form></div>;
}

function LoginScreen() {
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(() => new URLSearchParams(window.location.search).get("reason") === "session-expired" ? "Your session expired. Sign in again to continue." : "");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "reset") { await requestPasswordReset(email); setMessage("If the account exists, a reset email has been sent."); }
      else { await signIn(email, password); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Authentication failed"); }
    finally { setBusy(false); }
  };
  return <div className="auth-page"><form className="modal auth-card" onSubmit={submit}><div className="brand auth-brand"><div className="brand-mark">A</div><span>adometa</span></div><p className="eyebrow">SECURE WORKSPACE</p><h1>{mode === "login" ? "Welcome back" : "Reset your password"}</h1><p className="muted">{mode === "login" ? "Sign in to access your organization." : "We’ll send a secure reset link if the account exists."}</p><label>Email address<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>{mode === "login" && <label>Password<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>}{message && <p className="auth-message">{message}</p>}<button className="button primary auth-submit" disabled={busy}>{busy ? "Please wait..." : mode === "login" ? "Sign in" : "Send reset link"}</button><button type="button" className="text-button auth-toggle" onClick={() => { setMode(mode === "login" ? "reset" : "login"); setMessage(""); }}>{mode === "login" ? "Forgot password?" : "Back to sign in"}</button></form></div>;
}

function SignupScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try { await signUp(email, password, fullName, phone); setMessage("Check your email to confirm your account. After confirmation, sign in to submit your company and workspace request."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not create account"); }
    finally { setBusy(false); }
  };
  return <form className="modal auth-card" onSubmit={submit}><div className="brand auth-brand"><div className="brand-mark">A</div><span>adometa</span></div><p className="eyebrow">GET STARTED</p><h1>Create your workspace</h1><p className="muted">Create an account first, then submit your company details for approval.</p><label>Full name<input required minLength={2} maxLength={100} autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} /></label><label>Mobile number<input required type="tel" autoComplete="tel" pattern="[+0-9 ()-]{7,32}" value={phone} onChange={(event) => setPhone(event.target.value)} /></label><label>Email address<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{message && <p className="auth-message">{message}</p>}<button className="button primary auth-submit" disabled={busy}>{busy ? "Creating..." : "Create account"}</button><a className="text-button auth-toggle" href="/login">Already have an account? Sign in</a></form>;
}

function ResetPasswordScreen() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try { await updatePassword(password); setMessage("Password updated. You can now sign in."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not update password"); }
    finally { setBusy(false); }
  };
  return <form className="modal auth-card" onSubmit={submit}><div className="brand auth-brand"><div className="brand-mark">A</div><span>adometa</span></div><p className="eyebrow">PASSWORD RESET</p><h1>Choose a new password</h1><p className="muted">Use a strong password for your secure workspace.</p><label>New password<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{message && <p className="auth-message">{message}</p>}<button className="button primary auth-submit" disabled={busy}>{busy ? "Saving..." : "Update password"}</button><a className="text-button auth-toggle" href="/login">Back to sign in</a></form>;
}

function Overview({ leads, totalLeadCount, trend, isLoadingTrend, performance, role, organizationName, teamNames, onAdd, onViewLeads, onOpenLead, userName }: {
  leads: Lead[];
  totalLeadCount: number;
  trend: LeadTrendPoint[];
  isLoadingTrend: boolean;
  performance: PersonalPerformance | null;
  role?: "super_admin" | "company_owner" | "organization_admin" | "manager" | "agent" | "auditor";
  organizationName: string;
  teamNames: string[];
  onAdd: () => void;
  onViewLeads: () => void;
  onOpenLead: (id: string) => void;
  userName: string;
}) {
  const statuses = trend[0]?.status_counts ?? {};
  const total = totalLeadCount || trend[trend.length - 1]?.cumulative_leads || 0;
  const newThisWeek = trend.slice(-7).reduce((sum, point) => sum + point.new_leads, 0);
  const qualified = statuses.qualified ?? 0;
  const won = statuses.won ?? 0;
  const stats: Array<{ label: string; value: string | number; icon: LucideIcon; tone: string; note: string }> = [
    { label: "Total leads", value: total.toLocaleString(), icon: Users, tone: "purple", note: "All active organization leads" },
    { label: "New this week", value: newThisWeek.toLocaleString(), icon: TrendingUp, tone: "green", note: "Added in the last 7 days" },
    { label: "Qualified", value: qualified.toLocaleString(), icon: Target, tone: "blue", note: "Current pipeline stage" },
    { label: "Won", value: won.toLocaleString(), icon: Check, tone: "amber", note: "Successfully converted" },
  ];
  const pipeline = [
    ["New", statuses.new ?? 0, "purple"],
    ["Contacted", statuses.contacted ?? 0, "blue"],
    ["Qualified", qualified, "green"],
    ["Follow-up", statuses.follow_up ?? 0, "orange"],
    ["Won", won, "dark"],
    ["Lost", statuses.lost ?? 0, "rose"],
  ] as const;
  const exportCsv = () => {
    const rows = [["Lead ID", "Name", "Company", "Source", "Status", "Score"], ...leads.map((lead) => [lead.id, lead.name, lead.company, lead.source, lead.status, String(lead.score)])];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = "adometa-loaded-leads.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const isOrganizationAdmin = role === "organization_admin" || role === "company_owner";
  return <>
    {isOrganizationAdmin ? <section className="organization-admin-hero">
      <div className="organization-admin-hero-copy">
        <p className="eyebrow">ORGANIZATION ADMIN DASHBOARD</p>
        <h1>{organizationName || "Organization"} workspace</h1>
        <p>Welcome back, <strong>{userName || "Administrator"}</strong>. Here is your team and lead performance for today.</p>
      </div>
      <div className="organization-admin-hero-actions">
        <span className="organization-live-badge"><i /> Live workspace</span>
        <button className="button primary" onClick={onAdd}><Plus size={16} /> Add lead</button>
      </div>
      <div className="organization-admin-hero-metrics">
        <div><span>Active leads</span><strong>{total.toLocaleString()}</strong></div>
        <div><span>New this week</span><strong>{newThisWeek.toLocaleString()}</strong></div>
        <div><span>Teams</span><strong>{teamNames.length.toLocaleString()}</strong></div>
        <div><span>Won leads</span><strong>{won.toLocaleString()}</strong></div>
      </div>
    </section> : <PageHeader eyebrow="LIVE WORKSPACE" title={`Good morning, ${userName || "there"}`} description="A clear view of your leads, pipeline health, and next steps." action={<div className="page-actions"><button className="button secondary" onClick={exportCsv}>Export loaded leads</button><button className="button primary" onClick={onAdd}><Plus size={17} /> Add lead</button></div>} />}
    {isOrganizationAdmin && <div className="organization-admin-actions" aria-label="Organization admin quick actions">
      <a href="/org/leads"><span><Users size={17} /></span><div><strong>Manage leads</strong><small>View, assign and transfer leads</small></div><ArrowUpRight size={15} /></a>
      <a href="/org/teams"><span><Building2 size={17} /></span><div><strong>Manage teams</strong><small>{teamNames.length} configured team{teamNames.length === 1 ? "" : "s"}</small></div><ArrowUpRight size={15} /></a>
      <a href="/org/pipeline"><span><Target size={17} /></span><div><strong>Sales pipeline</strong><small>Track stages and opportunities</small></div><ArrowUpRight size={15} /></a>
      <a href="/org/reports"><span><PieChart size={17} /></span><div><strong>Organization reports</strong><small>Agency and team performance</small></div><ArrowUpRight size={15} /></a>
    </div>}
    {performance && <section className="card personal-performance">
      <div className="card-header"><div><h2>My performance</h2><p>Your assigned sales activity</p></div><span className="pending-pill">Live data</span></div>
      <div className="performance-grid">{[["Assigned leads", performance.assignedLeads], ["Calls made", performance.calls], ["Follow-ups due", performance.followUpsDue], ["Visits completed", performance.visitsCompleted], ["Bookings", performance.bookings], ["Lost leads", performance.lostLeads]].map(([label, value]) => <div key={String(label)}><strong>{value}</strong><span>{label}</span></div>)}</div>
    </section>}
    <div className="stats-grid lead-stats-grid">{stats.map(({ label, value, icon: Icon, tone, note }) => <article className="stat-card lead-stat-card" key={label}><div className="stat-top"><span>{label}</span><div className={`stat-icon ${tone}`}><Icon size={17} /></div></div><strong>{value}</strong><div className="stat-foot"><span className="lead-stat-dot" /> <small>{note}</small></div></article>)}</div>
    <div className="lead-dashboard-grid">
      <LeadTrendChart points={trend} loading={isLoadingTrend} />
      <section className="card pipeline-card lead-pipeline-card">
        <div className="card-header"><div><p className="eyebrow">PIPELINE</p><h2>Lead stages</h2><p>Current status across all active leads</p></div><button className="text-button" onClick={onViewLeads}>View leads <ArrowUpRight size={15} /></button></div>
        <div className="funnel">{pipeline.map(([stage, stageCount, color]) => {
          const percent = total ? Math.round((stageCount / total) * 100) : 0;
          return <div className="funnel-row" key={stage}><span className="funnel-label">{stage}</span><div className="funnel-track"><div className={`funnel-bar ${color}`} style={{ width: `${percent}%` }} /></div><strong>{stageCount.toLocaleString()}</strong><small>{percent}%</small></div>;
        })}</div>
      </section>
    </div>
    <section className="card table-card lead-recent-card">
      <div className="card-header"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>Recently added leads</h2><p>Open any lead to review its complete track record.</p></div><button className="text-button" onClick={onViewLeads}>View all leads <ArrowUpRight size={15} /></button></div>
      <LeadTable leads={leads.slice(0, 6)} compact onOpen={onOpenLead} />
    </section>
  </>;
}

function LeadsView({ leads, totalCount, isLoading, isSearchPending, isLoadingMore, hasMore, onLoadMore, query, onAdd, canImport, onImport, onOpen, onTransfer, onStatusChange }: { leads: Lead[]; totalCount: number; isLoading: boolean; isSearchPending: boolean; isLoadingMore: boolean; hasMore: boolean; onLoadMore: () => void; query: string; onAdd: () => void; canImport: boolean; onImport: () => void; onOpen: (id: string) => void; onTransfer: (id: string) => void; onStatusChange: (id: string, status: Status) => void }) {
  const isRefreshing = isLoading || isSearchPending;
  return <><PageHeader eyebrow="LEAD MANAGEMENT" title="Leads" description={isRefreshing && leads.length ? "Updating results; the previous result set remains visible." : `Showing ${leads.length} of ${totalCount} matching authorized leads.`} action={<div className="page-actions">{canImport && <button className="button secondary" onClick={onImport}><Upload size={16} /> Import CSV</button>}<button className="button primary" onClick={onAdd}><Plus size={17} /> Add lead</button></div>} /><div className="toolbar"><div className="filter-search"><Search size={17} /><input placeholder="Search leads..." value={query} readOnly /></div><button className="button secondary"><Filter size={16} /> Filters <span className="filter-count">2</span></button><button className="button secondary"><CalendarDays size={16} /> Date added <ChevronDown size={15} /></button></div><section className="card table-card">{isLoading && !leads.length ? <div className="route-loading" role="status">Loading leads…</div> : <LeadTable leads={leads} onOpen={onOpen} onTransfer={onTransfer} onStatusChange={onStatusChange} />}{hasMore && <div className="lead-pagination"><button className="button secondary" disabled={isLoadingMore} onClick={onLoadMore}>{isLoadingMore ? "Loading…" : `Load more (${totalCount - leads.length} remaining)`}</button></div>}</section></>;
}

function LeadTable({ leads, compact = false, onOpen, onTransfer, onStatusChange }: { leads: Lead[]; compact?: boolean; onOpen?: (id: string) => void; onTransfer?: (id: string) => void; onStatusChange?: (id: string, status: Status) => void }) {
  return <div className="table-scroll"><table><thead><tr><th>LEAD</th><th>SOURCE</th><th>STATUS</th><th>LEAD SCORE</th><th>OWNER</th><th>ADDED</th><th /></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id}><td><button className="lead-cell lead-link" onClick={() => onOpen?.(lead.id)}><div className="lead-avatar" style={{ background: lead.color }}>{lead.name.split(" ").map((n) => n[0]).join("")}</div><div><strong>{lead.name}</strong><small>{lead.company} · {lead.id}</small></div></button></td><td>{lead.source}</td><td>{onStatusChange ? <select className={`status-select ${lead.status.toLowerCase().replace("-", "")}`} value={lead.status} onChange={(e) => onStatusChange(lead.id, e.target.value as Status)}>{(["New", "Contacted", "Qualified", "Follow-up", "Won"] as Status[]).map((status) => <option key={status}>{status}</option>)}</select> : <span className={`status ${lead.status.toLowerCase().replace("-", "")}`}>{lead.status}</span>}</td><td><div className="score"><span className="score-bar"><i style={{ width: `${lead.score}%` }} /></span><strong>{lead.score}</strong></div></td><td><span className="owner">{lead.owner}</span></td><td className="date-cell">{lead.date}</td><td><div className="page-actions">{onTransfer && <button className="button secondary" onClick={() => onTransfer(lead.id)}>Transfer</button>}<button className="icon-button" onClick={() => onOpen?.(lead.id)}><MoreHorizontal size={17} /></button></div></td></tr>)}</tbody></table>{!leads.length && <div className="empty-state"><Search size={24} /><strong>No leads found</strong><p>Try a different search term.</p></div>}{compact && <div className="table-foot">Showing {leads.length} lead{leads.length === 1 ? "" : "s"}</div>}</div>;
}

function formatLeadEvent(event: LeadEvent, salespeople: Array<{ user_id: string; profiles: { full_name: string } | null }>) {
  const previous = event.previous_value ?? {};
  const next = event.new_value ?? {};
  const displayName = (id: unknown) => {
    if (typeof id !== "string" || !id) return "Unassigned";
    return salespeople.find((person) => person.user_id === id)?.profiles?.full_name || id.slice(0, 8);
  };
  const value = (item: unknown) => {
    if (item === null || item === undefined || item === "") return "—";
    if (typeof item === "string") return item.replace(/_/g, " ");
    return String(item);
  };
  const eventLabels: Record<string, string> = {
    lead_created: "Lead created",
    status_changed: "Status changed",
    lead_status_changed: "Status changed",
    lead_details_updated: "Lead details updated",
    lead_reassigned: "Lead reassigned",
    ownership_transferred: "Ownership transferred",
    lead_shared: "Lead shared",
    follow_up_scheduled: "Follow-up scheduled",
    call_recorded: "Call recorded",
    lead_skipped: "Lead skipped",
  };
  let summary = "";
  if (event.event_type === "ownership_transferred" || event.event_type === "lead_reassigned") {
    const oldOwner = event.previous_owner ?? previous.assigned_to;
    const newOwner = event.new_owner ?? next.assigned_to;
    summary = `${displayName(oldOwner)} → ${displayName(newOwner)}`;
  } else if (event.event_type === "status_changed" || event.event_type === "lead_status_changed") {
    summary = `${value(previous.status)} → ${value(next.status)}`;
  } else if (event.event_type === "lead_details_updated") {
    const fieldLabels: Record<string, string> = { full_name: "Name", phone: "Phone", email: "Email", company: "Company", city: "City", state: "State", source: "Source", priority: "Priority" };
    summary = Object.keys(next).map((key) => `${fieldLabels[key] ?? key}: ${value(previous[key])} → ${value(next[key])}`).join(" · ");
  } else if (event.event_type === "lead_created") {
    summary = next.source ? `Created from ${value(next.source)}` : "Lead added to the workspace";
  } else if (event.event_type === "follow_up_scheduled") {
    summary = next.next_follow_up_at ? `Due ${new Date(String(next.next_follow_up_at)).toLocaleString()}` : "Follow-up date updated";
  } else {
    summary = event.notes || value(next.outcome ?? next.status ?? next.category);
    if (summary === "—") summary = "";
  }
  const actor = event.actor_name || (event.actor_id ? displayName(event.actor_id) : "System");
  return { title: eventLabels[event.event_type] || event.event_type.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase()), summary, actor };
}

function LeadDetails({ lead, events, salespeople, initialMode = "share", onClose, onNotify, onRefresh }: { lead: LeadRecord; events: LeadEvent[]; salespeople: Array<{ user_id: string; role: string; profiles: { full_name: string } | null }>; initialMode?: "share" | "transfer"; onClose: () => void; onNotify: (message: string) => void; onRefresh: () => Promise<void> }) {
  const [mode, setMode] = useState<"share" | "transfer">(initialMode);
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [whatsappText, setWhatsappText] = useState(() => renderWhatsAppTemplate("Hi {{name}}, following up on your enquiry.", { name: lead.full_name }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userId || !reason.trim()) return onNotify("Select a salesperson and enter a reason");
    setBusy(true);
    try {
      if (mode === "share") await shareLead(lead.id, userId, expiry ? new Date(expiry).toISOString() : null, reason);
      else await transferLead(lead.id, userId, reason);
      await onRefresh();
      onNotify(mode === "share" ? "Lead access shared" : "Lead ownership transferred");
      setReason("");
    } catch (error) { onNotify(error instanceof Error ? error.message : "Lead action failed"); }
    finally { setBusy(false); }
  };
  const openWhatsApp = async () => {
    if (!lead.phone) return onNotify("This lead has no phone number.");
    const url = personalWhatsAppUrl(lead.phone, whatsappText);
    window.open(url, "_blank", "noopener,noreferrer");
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (!data.user) throw new Error("Your authenticated user could not be resolved.");
        await recordWhatsAppOpened({ organizationId: lead.organization_id, leadId: lead.id, senderId: data.user.id, body: whatsappText });
      } catch (error) { onNotify(error instanceof Error ? error.message : "Could not record WhatsApp activity"); }
    }
    onNotify("WhatsApp opened. Delivery is not confirmed by click-to-chat.");
  };
  const coreDetails: Array<[string, unknown]> = [
    ["Company", lead.company], ["Phone", lead.phone], ["Email", lead.email],
    ["City", lead.city], ["State", lead.state], ["Status", lead.status],
    ["Priority", lead.priority], ["Next follow-up", lead.next_follow_up_at],
  ];
  const visibleCoreDetails = coreDetails.filter(([, value]) => value !== null && value !== undefined && value !== "");
  const sheetColumns = Array.isArray(lead.custom_fields?._google_sheets_columns) ? lead.custom_fields._google_sheets_columns : [];
  const visibleSheetColumns = Array.isArray(lead.custom_fields?._google_sheets_visible_columns) ? lead.custom_fields._google_sheets_visible_columns : sheetColumns;
  const importedDetails = Object.entries(lead.custom_fields ?? {}).filter(([key, value]) => !key.startsWith("_google_sheets_") && !key.startsWith("_google_sheet_")
    && (!sheetColumns.includes(key) || visibleSheetColumns.includes(key))
    && value !== null && value !== undefined && value !== "");
  const agencyMap = lead.custom_fields?._google_sheet_agencies;
  const agencyNames = agencyMap && typeof agencyMap === "object" && !Array.isArray(agencyMap)
    ? Object.values(agencyMap).map((value) => String(value)).filter(Boolean)
    : [];
  const sheetSourceMap = lead.custom_fields?._google_sheet_sources;
  const sheetSources = sheetSourceMap && typeof sheetSourceMap === "object" && !Array.isArray(sheetSourceMap)
    ? Object.values(sheetSourceMap).filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null)
    : [];
  const displayFieldValue = (value: unknown) => typeof value === "string" ? value : JSON.stringify(value);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal lead-details">
      <div className="modal-head">
        <div><p className="eyebrow">LEAD JOURNEY</p><h2>{lead.full_name}</h2><p className="muted">{lead.external_id} · {lead.source}</p></div>
        <button className="icon-button" onClick={onClose}><X size={19} /></button>
      </div>
      <div className="lead-detail-grid">
        <div>
          <section className="lead-record-fields">
            <h3>Lead details</h3>
            <dl>{visibleCoreDetails.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{displayFieldValue(value)}</dd></div>)}</dl>
            {importedDetails.length > 0 && <>
              <h3>Imported sheet details</h3>
              <dl>{importedDetails.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{displayFieldValue(value)}</dd></div>)}</dl>
            </>}
            {(agencyNames.length > 0 || sheetSources.length > 0) && <>
              <h3>Agency and sheet source</h3>
              <dl>
                {agencyNames.map((agency) => <div key={`agency-${agency}`}><dt>Agency</dt><dd>{agency}</dd></div>)}
                {sheetSources.map((source, index) => <div key={`sheet-source-${index}`}><dt>{String(source.agency || "Agency sheet")}</dt><dd>{[source.spreadsheetName, source.worksheetName].filter(Boolean).join(" · ") || "Google Sheet"}</dd></div>)}
              </dl>
            </>}
          </section>
          <section className="lead-history">
            <div className="lead-history-heading"><div><h3>Lead track record</h3><p>Full history of changes and interactions</p></div><span>{events.length} {events.length === 1 ? "event" : "events"}</span></div>
            <div className="timeline">{events.length ? [...events].reverse().map((event) => {
              const details = formatLeadEvent(event, salespeople);
              return <article className="timeline-event" key={event.id}><span /><div className="timeline-event-content"><div className="timeline-event-top"><strong>{details.title}</strong><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time></div>{details.summary && <p>{details.summary}</p>}<small>By {details.actor}</small>{event.notes && event.event_type !== "lead_details_updated" && <p className="timeline-event-note">{event.notes}</p>}</div></article>;
            }) : <p className="lead-history-empty">No activity recorded for this lead yet.</p>}</div>
          </section>
          <div className="whatsapp-box"><h3>Personal WhatsApp</h3><textarea value={whatsappText} onChange={(event) => setWhatsappText(event.target.value)} /><button className="button secondary" type="button" onClick={openWhatsApp}>Open WhatsApp</button><small>Opened only; delivery is not confirmed.</small></div>
        </div>
        <form className="share-panel" onSubmit={submit}>
          <div className="share-tabs"><button type="button" className={mode === "share" ? "active" : ""} onClick={() => setMode("share")}>Share access</button><button type="button" className={mode === "transfer" ? "active" : ""} onClick={() => setMode("transfer")}>Transfer owner</button></div>
          <label>Salesperson<select required value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">Select teammate</option>{salespeople.filter((person) => person.user_id !== lead.assigned_to).map((person) => <option key={person.user_id} value={person.user_id}>{person.profiles?.full_name || person.user_id.slice(0, 8)}</option>)}</select></label>
          {mode === "share" && <label>Access expiry<input type="datetime-local" value={expiry} onChange={(event) => setExpiry(event.target.value)} /></label>}
          <label>{mode === "share" ? "Reason" : "Transfer reason"}<textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain this lead action" /></label>
          <button className="button primary" disabled={busy}>{busy ? "Saving..." : mode === "share" ? "Share lead access" : "Transfer ownership"}</button>
        </form>
      </div>
    </section>
  </div>;
}

function CallingWorkspace({ leads, membership, hasMore, isLoadingMore, onLoadMore, onNotify }: { leads: Lead[]; membership: Membership | null; hasMore: boolean; isLoadingMore: boolean; onLoadMore: () => Promise<boolean>; onNotify: (message: string) => void }) {
  const [index, setIndex] = useState(0);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [skipReason, setSkipReason] = useState("");
  const [skipNotes, setSkipNotes] = useState("");
  const lead = leads[index];
  useEffect(() => {
    if (!startedAt) return;
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  const next = async () => {
    const nextIndex = index + 1;
    if (nextIndex < leads.length) setIndex(nextIndex);
    else if (hasMore && !isLoadingMore) {
      const currentLength = leads.length;
      setIndex(currentLength);
      if (!await onLoadMore()) setIndex(Math.max(0, currentLength - 1));
    } else setIndex(0);
    setStartedAt(null);
    setSeconds(0);
    setOutcome("");
    setFollowUpAt("");
  };
  const completeCall = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!lead?.dbId || !membership || !startedAt) return onNotify("Start a manual call before saving its outcome.");
    try {
      await saveCall({ organizationId: membership.organization_id, leadId: lead.dbId, agentId: membership.user_id, outcome, notes, followUpAt: followUpAt ? new Date(followUpAt).toISOString() : null, startedAt, connectedAt: startedAt, endedAt: new Date().toISOString(), callStatus: "disconnected" });
      onNotify("Call outcome saved");
      next();
    } catch (error) { onNotify(error instanceof Error ? error.message : "Could not save call"); }
  };
  const handleSkip = async () => {
    if (!lead?.dbId || !skipReason) return onNotify("Select a skip reason.");
    try { await skipLead(lead.dbId, skipReason, skipNotes, followUpAt ? new Date(followUpAt).toISOString() : null); onNotify("Lead skipped and recorded"); next(); }
    catch (error) { onNotify(error instanceof Error ? error.message : "Could not skip lead"); }
  };
  return <><PageHeader eyebrow="SMART CALLING QUEUE" title="Calling workspace" description="Manual confirmation mode is active until a supported telephony provider is configured." /><div className="calling-banner"><ShieldCheck size={17} /> No call is placed automatically. Use your device dialer, then record the outcome here.</div>{lead ? <div className="calling-grid"><section className="card current-lead-card"><div className="card-header"><div><p className="eyebrow">NEXT ELIGIBLE LEAD</p><h2>{lead.name}</h2><p>{lead.company} · {lead.source}</p></div><span className="status pending">{lead.status}</span></div><div className="calling-meta"><strong>{lead.phone || "Phone unavailable"}</strong><span>Priority is calculated from follow-up and lead state.</span><a className="button primary" href={lead.phone ? `tel:${lead.phone}` : undefined} onClick={() => { if (!lead.phone) onNotify("This lead has no phone number"); else if (!startedAt) { setStartedAt(new Date().toISOString()); setSeconds(0); } }}>{startedAt ? `Manual call active · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "Start manual call"}</a></div><button className="button secondary" disabled={isLoadingMore} onClick={() => void next()}>{isLoadingMore ? "Loading next leads…" : "Next lead"}</button></section><form className="card call-outcome" onSubmit={completeCall}><h2>Call disposition</h2><label>Outcome<select required value={outcome} onChange={(event) => setOutcome(event.target.value)}><option value="">Select outcome</option><option value="connected">Connected</option><option value="callback">Call back required</option><option value="not_reachable">Not reachable</option><option value="not_interested">Not interested</option><option value="wrong_number">Wrong number</option></select></label><label>Next follow-up<input type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} /></label><label>Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label><button className="button primary" disabled={!startedAt}>Save call outcome</button><div className="skip-row"><select value={skipReason} onChange={(event) => setSkipReason(event.target.value)}><option value="">Skip reason</option><option value="wrong_number">Wrong number</option><option value="not_interested">Not interested</option><option value="already_contacted">Already contacted</option><option value="customer_busy">Customer busy</option><option value="duplicate_lead">Duplicate lead</option><option value="invalid_lead">Invalid lead</option><option value="other">Other</option></select><input placeholder="Skip notes" value={skipNotes} onChange={(event) => setSkipNotes(event.target.value)} /><button type="button" className="button secondary" onClick={handleSkip}>Skip lead</button></div></form></div> : <section className="card empty-state"><Headphones size={24} /><strong>No eligible leads</strong><p>Authorized leads with valid contact data will appear here.</p></section>}</>;
}

function Campaigns({ onNotify }: { onNotify: (message: string) => void }) {
  const campaigns = [["Diwali Home Fest", "Meta Ads · Oct 01 – Nov 15", "Active", "426", "31.4%", "18.6%", "purple"], ["Website Enquiries", "Website · Ongoing", "Active", "318", "44.1%", "24.2%", "blue"], ["Referral Program", "Referral · Sep 01 – Dec 31", "Paused", "182", "52.7%", "29.8%", "green"]];
  return <><PageHeader eyebrow="GROWTH" title="Campaigns" description="Track acquisition, engagement, and conversion by campaign." action={<button className="button primary" onClick={() => onNotify("Campaign creation is ready for setup")}><Plus size={17} /> New campaign</button>} /><div className="campaign-grid">{campaigns.map(([name, detail, status, leads, contact, conversion, color]) => <div className="card campaign-card" key={name}><div className="campaign-title"><div className={`campaign-icon ${color}`}><Target size={19} /></div><div><h2>{name}</h2><p>{detail}</p></div><button className="icon-button"><MoreHorizontal size={18} /></button></div><div className="campaign-status"><span className={`dot ${status === "Active" ? "dot-green" : "dot-orange"}`} />{status}<span className="campaign-leads">{leads} leads</span></div><div className="campaign-metrics"><div><small>Contact rate</small><strong>{contact}</strong></div><div><small>Conversion</small><strong>{conversion}</strong></div></div><div className="progress"><i style={{ width: conversion }} /></div><button className="text-button campaign-link" onClick={() => onNotify(`${name} details opened`)}>View campaign <ArrowUpRight size={15} /></button></div>)}</div></>;
}

function FollowUps({ onNotify }: { onNotify: (message: string) => void }) {
  const tasks = [["Call Rohan Mehta", "Qualified lead · Mehta Developers", "Today, 11:30 AM", "High", "RM"], ["Send proposal to Vikram Singh", "Won lead · Northstar Homes", "Today, 02:00 PM", "Medium", "VS"], ["Schedule site visit with Sneha Iyer", "Follow-up · Iyer Enterprises", "Tomorrow, 10:00 AM", "High", "SI"], ["Check in with Priya Sharma", "Contacted · Aster Living", "Oct 30, 09:30 AM", "Low", "PS"]];
  return <><PageHeader eyebrow="YOUR WORK QUEUE" title="Follow-ups" description="Stay on top of conversations that move deals forward." action={<button className="button primary" onClick={() => onNotify("Follow-up form opened")}><Plus size={17} /> Add follow-up</button>} /><div className="followup-layout"><section className="card task-card"><div className="card-header"><div><h2>Upcoming follow-ups</h2><p>Tasks assigned to you</p></div><button className="button secondary">All tasks <ChevronDown size={15} /></button></div><div className="task-list">{tasks.map(([title, detail, date, priority, initials]) => <div className="task-item" key={title}><button className="check-task" onClick={() => onNotify("Task marked complete")}><Check size={14} /></button><div className="task-body"><strong>{title}</strong><small>{detail}</small></div><span className={`priority ${priority.toLowerCase()}`}>{priority}</span><div className="task-date"><Clock3 size={14} />{date}</div><button className="icon-button"><MoreHorizontal size={17} /></button></div>)}</div></section><section className="card completion-card"><div className="card-header"><div><h2>Completion</h2><p>This week</p></div><TrendingUp className="green-icon" size={18} /></div><div className="completion-number">84<span>%</span></div><p className="positive">+12.4% <span className="muted">vs. last week</span></p><div className="mini-bars">{[42, 58, 46, 72, 84, 64, 86].map((height, i) => <i key={i} style={{ height: `${height}%` }} className={i === 6 ? "today" : ""} />)}</div><div className="week-labels"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div></section></div></>;
}

function CompanyView({ membership, summary, onNotify }: { membership: Membership | null; summary: WorkspaceSummary | null; onNotify: (message: string) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"organization_admin" | "manager" | "agent">("organization_admin");
  const [busy, setBusy] = useState(false);
  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!membership || !email.trim()) return;
    setBusy(true);
    try { await inviteMember(membership.organization_id, email, role); setEmail(""); onNotify("Invitation sent securely"); }
    catch (error) { onNotify(error instanceof Error ? error.message : "Invitation failed"); }
    finally { setBusy(false); }
  };
  const stats: Array<{ label: string; value: string | number; Icon: LucideIcon }> = [
    { label: "Employees", value: summary?.employees ?? "—", Icon: UsersRound },
    { label: "Sales teams", value: summary?.teams ?? "—", Icon: Users },
    { label: "Total leads", value: summary?.leads ?? "—", Icon: Target },
    { label: "Bookings", value: summary?.bookings ?? "—", Icon: TrendingUp },
  ];
  return <><PageHeader eyebrow="COMPANY OWNER PANEL" title={summary?.organizationName || "Company overview"} description="Organization performance and access management from authorized records." /><div className="stats-grid">{stats.map(({ label, value, Icon }) => <div className="stat-card" key={label}><div className="stat-top"><span>{label}</span><div className="stat-icon"><Icon size={17} /></div></div><strong>{value}</strong><div className="stat-foot"><span className="neutral">Live</span><small>Supabase authorized data</small></div></div>)}</div><div className="owner-grid"><section className="card"><div className="card-header"><div><h2>Organization settings</h2><p>Branding and workspace controls</p></div><button className="button secondary" onClick={() => onNotify("Organization profile editing is not configured yet")}>Edit profile</button></div><div className="settings-row"><div className="workspace-avatar"><Building2 size={16} /></div><div><strong>{summary?.organizationName || "Workspace"}</strong><small>Organization ID is protected by Supabase RLS</small></div></div><div className="settings-row"><div className="workspace-avatar"><ShieldCheck size={16} /></div><div><strong>Secure tenant isolation</strong><small>Owner access is limited to this organization.</small></div></div></section><section className="card"><div className="card-header"><div><h2>Invite organization admin</h2><p>Invitation is processed server-side</p></div><UserPlus size={19} className="green-icon" /></div><form className="invite-form" onSubmit={invite}><label>Email address<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@company.com" /></label><label>Role<select value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="organization_admin">Organization Admin</option><option value="manager">Sales Manager</option><option value="agent">Sales Team Member</option></select></label><button className="button primary" disabled={busy}>{busy ? "Sending..." : "Send secure invitation"}</button></form></section></div></>;
}

function TeamsView({ membership, teams, onCreated, onNotify }: { membership: Membership; teams: Team[]; onCreated: (team: Team) => void; onNotify: (message: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<Array<{ user_id: string; role: string; is_active: boolean; profiles: { full_name: string } | null }>>([]);
  const [teamMembers, setTeamMembers] = useState<Record<string, string[]>>({});
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const organizationMembers = await listOrganizationMembers(membership.organization_id);
        if (!active) return;
        setMembers(organizationMembers.map((member) => ({
          user_id: member.user_id,
          role: member.role,
          is_active: member.is_active,
          profiles: member.profiles,
        })));
        const assignments = await Promise.all(teams.map(async (team) => [
          team.id,
          await listTeamMembers(team.id, membership.organization_id),
        ] as const));
        if (active) setTeamMembers(Object.fromEntries(assignments));
      } catch (error) {
        if (active) onNotify(error instanceof Error ? error.message : "Team members could not be loaded.");
      }
    })();
    return () => { active = false; };
  }, [membership.organization_id, teams, onNotify]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try { const team = await createTeam(membership.organization_id, name); onCreated(team); setName(""); onNotify("Team created"); }
    catch (error) { onNotify(error instanceof Error ? error.message : "Could not create team"); }
    finally { setBusy(false); }
  };
  return <>
    <PageHeader eyebrow="TEAM MANAGEMENT" title="Sales teams" description="Create teams, add organization members, and assign managers through authorized operations." />
    <div className="owner-grid">
      <section className="card">
        <div className="card-header"><div><h2>Create a sales team</h2><p>Teams are organization-scoped.</p></div><UsersRound className="green-icon" size={19} /></div>
        <form className="invite-form" onSubmit={submit}>
          <label>Team name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="North region sales" /></label>
          <button className="button primary" disabled={busy}>{busy ? "Creating..." : "Create team"}</button>
        </form>
      </section>
      <section className="card">
        <div className="card-header"><div><h2>Your teams</h2><p>{teams.length} active teams</p></div></div>
        <div className="team-list">
          {teams.length ? teams.map((team) => <div className="settings-row" key={team.id}>
            <div className="workspace-avatar"><UsersRound size={15} /></div>
            <div>
              <strong>{team.name}</strong>
              <small>{team.manager_id ? "Manager assigned" : "Manager not assigned"}</small>
              <div className="team-member-actions">
                {(teamMembers[team.id] ?? []).map((userId) => {
                  const member = members.find((item) => item.user_id === userId);
                  return member ? <button type="button" className="status pending" key={userId} title="Remove from team" onClick={async () => {
                    try {
                      await setTeamMember(team.id, membership.organization_id, userId, false);
                      setTeamMembers((current) => ({ ...current, [team.id]: (current[team.id] ?? []).filter((id) => id !== userId) }));
                      onNotify("Team member removed");
                    } catch (error) {
                      onNotify(error instanceof Error ? error.message : "Team member could not be removed");
                    }
                  }}>{member.profiles?.full_name || userId.slice(0, 8)} ×</button> : null;
                })}
              </div>
              <select aria-label={`Add member to ${team.name}`} defaultValue="" onChange={async (event) => {
                const userId = event.target.value;
                if (!userId) return;
                try {
                  await setTeamMember(team.id, membership.organization_id, userId, true);
                  setTeamMembers((current) => ({ ...current, [team.id]: [...new Set([...(current[team.id] ?? []), userId])] }));
                  event.target.value = "";
                  onNotify("Team member added");
                } catch (error) {
                  onNotify(error instanceof Error ? error.message : "Team member could not be added");
                }
              }}>
                <option value="">Add team member</option>
                {members.filter((member) => member.role !== "super_admin" && member.is_active && !(teamMembers[team.id] ?? []).includes(member.user_id)).map((member) =>
                  <option key={member.user_id} value={member.user_id}>{member.profiles?.full_name || member.user_id.slice(0, 8)}</option>
                )}
              </select>
            </div>
            <span className="status pending">{team.is_active ? "Active" : "Inactive"}</span>
          </div>) : <div className="empty-state"><UsersRound size={23} /><strong>No teams yet</strong><p>Create the first organization team.</p></div>}
        </div>
      </section>
    </div>
  </>;
}

export default App;
