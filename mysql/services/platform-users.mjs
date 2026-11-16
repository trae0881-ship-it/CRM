const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const createRoles = new Set(["company_owner", "organization_admin", "manager", "agent"]);
const directoryRoles = new Set(["super_admin", "company_owner", "organization_admin", "manager", "agent", "auditor"]);
const statuses = new Set(["active", "inactive", "invited"]);

function validName(value) {
  return typeof value === "string" && value.trim().length >= 2 && value.trim().length <= 100;
}

function validPhone(value) {
  return value === undefined || value === null || value === "" ||
    (typeof value === "string" && value.trim().length <= 40 &&
      /^\+?[\d().\s-]{7,40}$/.test(value.trim()) && (value.match(/\d/g) ?? []).length >= 7);
}

export function validatePlatformUserInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Enter the required user details." };
  }
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!validName(fullName)) return { error: "Full name must contain 2 to 100 characters." };
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (!validPhone(phone)) return { error: "Enter a valid mobile number or leave it blank." };
  if (typeof body.companyId !== "string" || !uuidPattern.test(body.companyId)) {
    return { error: "Choose a valid company." };
  }
  if (!createRoles.has(body.role)) return { error: "Choose a supported organization role." };
  if (typeof body.isActive !== "boolean" || typeof body.sendInvitation !== "boolean") {
    return { error: "Choose the account access and invitation options." };
  }
  return {
    value: {
      fullName,
      email,
      phone: phone || null,
      companyId: body.companyId,
      role: body.role,
      isActive: body.isActive,
      sendInvitation: body.sendInvitation,
    },
  };
}

export function parsePlatformUserFilters(searchParams) {
  const search = (searchParams.get("search") ?? "").trim();
  const companyId = searchParams.get("companyId") || null;
  const role = searchParams.get("role") || null;
  const status = searchParams.get("status") || null;
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "25");
  if (search.length > 120) return { error: "Search text must be 120 characters or fewer." };
  if (companyId && !uuidPattern.test(companyId)) return { error: "Choose a valid company filter." };
  if (role && !directoryRoles.has(role)) return { error: "Choose a supported role filter." };
  if (status && !statuses.has(status)) return { error: "Choose a supported status filter." };
  if (!Number.isInteger(page) || page < 1 || page > 100000) return { error: "Choose a valid page number." };
  if (![10, 25, 50, 100].includes(pageSize)) return { error: "Choose a supported page size." };
  return { value: { search: search || null, companyId, role, status, page, pageSize } };
}

export function validatePlatformUserEdit(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Enter the required user details." };
  }
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!validName(fullName)) return { error: "Full name must contain 2 to 100 characters." };
  if (!validPhone(phone)) return { error: "Enter a valid mobile number or leave it blank." };
  if (!directoryRoles.has(body.role) || body.role === "super_admin") {
    return { error: "Choose a supported organization role." };
  }
  if (typeof body.isActive !== "boolean") return { error: "Choose the company membership status." };
  return { value: { fullName, phone: phone || null, role: body.role, isActive: body.isActive } };
}
