(function () {
  const cfg = window.ASP_FINAL_PROJECT_CONFIG || {};
  const isConfigured = cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes("YOUR-");
  const sectionSlug = new URLSearchParams(location.search).get("section") || cfg.defaultSectionSlug || "bsit-2a";
  const projectList = document.getElementById("project-list");
  const availabilityGrid = document.getElementById("avail-grid");
  const statusLine = document.getElementById("claim-modal-status");
  const dashboardCode = document.getElementById("dashboard-code");
  const dashboardPass = document.getElementById("dashboard-pass");
  let client = null;
  let bootstrap = null;
  let pendingProjectId = null;
  let dashboard = null;
  let dashboardPassword = "";

  const checklistItems = [
    ["members", "Members are complete"],
    ["template", "Proposal template downloaded"],
    ["purpose", "Purpose and target users written"],
    ["fields", "Database fields planned"],
    ["crud", "CRUD pages assigned"],
    ["validation", "Validation rules listed"],
    ["cp1", "CP 1 proposal ready"],
    ["cp2", "CP 2 database/model ready"],
    ["cp3", "CP 3 create/read ready"],
    ["cp4", "CP 4 update/delete ready"]
  ];

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function setStatus(message) {
    if (statusLine) statusLine.textContent = message || "";
  }

  function dashboardUrl(code) {
    const url = new URL("group_dashboard.html", window.location.href);
    url.searchParams.set("section", sectionSlug);
    if (code) url.searchParams.set("code", code);
    return url.href;
  }

  function showSetupNotice() {
    const notice = document.createElement("div");
    notice.className = "card";
    notice.style.borderColor = "rgba(146,64,14,0.2)";
    notice.innerHTML = `<div class="badge badge-amber">Setup needed</div>
      <div class="card-value">Supabase is not configured yet</div>
      <div class="card-sub">Update supabase-config.js with your project URL and anon key. The page is still showing the local prototype until then.</div>`;
    document.querySelector(".wrap").insertBefore(notice, document.querySelector(".wrap").children[2]);
  }

  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function loadBootstrap() {
    bootstrap = await rpc("bootstrap_section", { p_section_slug: sectionSlug });
    renderProjects();
    renderAvailability();
  }

  function renderProjects() {
    projectList.innerHTML = "";
    bootstrap.projects.forEach(p => {
      const isTaken = Boolean(p.claimedBy);
      const item = document.createElement("div");
      item.className = `project-item${p.recommended ? " recommended" : ""}${isTaken ? " taken" : ""}`;
      const banner = isTaken
        ? `<div class="avail-banner taken-banner"><div class="avail-dot"></div>Claimed by ${esc(p.claimedBy)}</div>`
        : `<div class="avail-banner open-banner"><div class="avail-dot"></div>Available to claim</div>`;
      item.innerHTML = `
        <button class="project-trigger" onclick="toggleProject(this)">
          <span class="project-num">${String(p.id).padStart(2, "0")}</span>
          <span class="project-name">${p.recommended ? "* " : ""}${esc(p.name)}</span>
          <span class="badge ${isTaken ? "badge-red" : p.recommended ? "badge-blue" : "badge-muted"}" style="margin:0;flex-shrink:0;">${isTaken ? "Claimed" : p.recommended ? "Recommended" : "Open"}</span>
          <span class="project-chevron">v</span>
        </button>
        <div class="project-body">
          <div class="project-body-inner">
            <div>
              <div class="pb-label">Description</div>
              <div style="font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:1rem;">${esc(p.description)}</div>
              <div class="pb-label">Suggested Fields</div>
              <div class="pb-tags">${p.fields.map(f => `<span class="pb-tag">${esc(f)}</span>`).join("")}</div>
            </div>
            <div>
              <div class="pb-label">Required CRUD Features</div>
              <div class="pb-feat">Create - add new records</div>
              <div class="pb-feat">Read - display record list</div>
              <div class="pb-feat">Update - edit existing records</div>
              <div class="pb-feat">Delete - remove records</div>
              <div class="pb-feat">Validation on required fields</div>
              <div class="pb-feat">Bootstrap-based interface</div>
              ${banner}
              <div class="project-actions">
                <button class="btn btn-primary" ${isTaken ? "disabled" : ""} onclick="openClaimDialog(${p.id})">Claim Title</button>
                <span class="claim-note">Optional. A short confirmation opens before anything is reserved.</span>
              </div>
            </div>
          </div>
        </div>`;
      projectList.appendChild(item);
    });
  }

  function renderAvailability() {
    availabilityGrid.innerHTML = "";
    bootstrap.projects.forEach(p => {
      const isTaken = Boolean(p.claimedBy);
      const el = document.createElement("div");
      el.className = `avail-item ${isTaken ? "is-full" : "is-open"}`;
      el.innerHTML = `<span class="avail-name">${p.recommended ? "* " : ""}${esc(p.name)}</span>
        <span class="avail-groups">${isTaken ? esc(p.claimedBy) : "No group yet"}</span>
        <span class="avail-pill ${isTaken ? "pill-full" : "pill-open"}">${isTaken ? "Claimed" : "Open"}</span>`;
      availabilityGrid.appendChild(el);
    });
  }

  window.openClaimDialog = function (projectId) {
    const project = bootstrap.projects.find(p => p.id === Number(projectId));
    if (!project || project.claimedBy) return;
    pendingProjectId = project.id;
    document.getElementById("claim-project-summary").textContent = `Section: ${bootstrap.section.name}`;
    document.getElementById("claim-project-details").innerHTML = `
      <div class="badge ${project.recommended ? "badge-blue" : "badge-muted"}">${project.recommended ? "Recommended" : "Open title"}</div>
      <div class="card-value">${esc(project.name)}</div>
      <div class="card-sub">${esc(project.description)}</div>
      <div class="pb-tags" style="margin-top:0.75rem;">${project.fields.map(f => `<span class="pb-tag">${esc(f)}</span>`).join("")}</div>`;
    document.getElementById("claim-code-modal").value = "";
    setStatus("");
    document.getElementById("claim-modal").classList.add("show");
  };

  window.closeClaimDialog = function () {
    pendingProjectId = null;
    document.getElementById("claim-modal").classList.remove("show");
  };

  window.confirmProjectClaim = async function () {
    try {
      const code = document.getElementById("claim-code-modal").value.trim();
      const password = prompt("Set a dashboard password for this group. Minimum 4 characters.");
      if (!password) return;
      setStatus("Claiming title...");
      await rpc("claim_project_title", {
        p_section_slug: sectionSlug,
        p_code: code,
        p_project_title_id: pendingProjectId,
        p_password: password
      });
      window.closeClaimDialog();
      sessionStorage.setItem(`aspdash:${sectionSlug}:code`, code);
      sessionStorage.setItem(`aspdash:${sectionSlug}:password`, password);
      await loadBootstrap();
      window.location.href = dashboardUrl(code);
    } catch (err) {
      setStatus(err.message || "Claim failed.");
    }
  };

  window.openDashboardDialog = function (skipLogin) {
    if (!skipLogin) {
      window.location.href = dashboardUrl("");
      return;
    }
    document.getElementById("dashboard-modal").classList.add("show");
    document.getElementById("dashboard-login").style.display = skipLogin && dashboard ? "none" : "grid";
    document.getElementById("dashboard-content").classList.toggle("show", Boolean(skipLogin && dashboard));
    if (dashboard) renderDashboard();
  };

  window.closeDashboardDialog = function () {
    document.getElementById("dashboard-modal").classList.remove("show");
  };

  window.loginDashboard = async function () {
    try {
      dashboard = await rpc("login_group", {
        p_section_slug: sectionSlug,
        p_code: dashboardCode.value.trim(),
        p_password: dashboardPass.value
      });
      dashboardPassword = dashboardPass.value;
      sessionStorage.setItem(`aspdash:${sectionSlug}:code`, dashboardCode.value.trim());
      sessionStorage.setItem(`aspdash:${sectionSlug}:password`, dashboardPassword);
      window.location.href = dashboardUrl(dashboardCode.value.trim());
    } catch (err) {
      alert(err.message || "Code or password did not match.");
    }
  };

  function renderDashboard() {
    const group = dashboard.group;
    document.getElementById("dashboard-title").textContent = `${group.name} Dashboard`;
    document.getElementById("dashboard-meta").textContent = `${group.projectTitle} Â· ${dashboard.members.length}/${bootstrap.section.maxMembers} members`;
    document.getElementById("dash-member-count").textContent = dashboard.members.length;
    document.getElementById("dash-title-num").textContent = String(group.projectTitleId).padStart(2, "0");
    renderMembers();
    renderGroupChecklist();
  }

  function renderMembers() {
    const box = document.getElementById("current-members");
    box.innerHTML = dashboard.members.map(m => `
      <div class="person-row">
        <span>${esc(m.fullName)}</span>
        <button class="btn btn-small" onclick="removeMember('${m.id}')">Remove</button>
      </div>`).join("") || '<div class="muted-empty">No members yet. Search the roster to add members.</div>';
  }

  window.renderMemberSearch = async function () {
    if (!dashboard) return;
    const q = document.getElementById("member-search").value.trim();
    const students = await rpc("search_section_students", { p_group_id: dashboard.group.id, p_password: dashboardPassword, p_query: q });
    document.getElementById("member-results").innerHTML = students.map(s => {
      const inGroup = dashboard.members.some(m => m.id === s.id);
      const disabled = Boolean(s.assignedGroup) || inGroup || dashboard.members.length >= bootstrap.section.maxMembers;
      const label = s.assignedGroup ? `In ${s.assignedGroup}` : inGroup ? "Added" : "Add";
      return `<div class="person-row ${disabled ? "is-disabled" : ""}">
        <span>${esc(s.fullName)}</span>
        <button class="btn btn-small" ${disabled ? "disabled" : ""} onclick="addMember('${s.id}')">${esc(label)}</button>
      </div>`;
    }).join("") || '<div class="muted-empty">No matching students.</div>';
  };

  window.addMember = async function (studentId) {
    try {
      dashboard = await rpc("add_group_member", { p_group_id: dashboard.group.id, p_student_id: studentId, p_password: dashboardPassword });
      renderDashboard();
      await window.renderMemberSearch();
    } catch (err) {
      alert(err.message || "Could not add member.");
    }
  };

  window.removeMember = async function (studentId) {
    try {
      dashboard = await rpc("remove_group_member", { p_group_id: dashboard.group.id, p_student_id: studentId, p_password: dashboardPassword });
      renderDashboard();
      await window.renderMemberSearch();
    } catch (err) {
      alert(err.message || "Could not remove member.");
    }
  };

  function renderGroupChecklist() {
    const done = checklistItems.filter(([key]) => dashboard.checklist[key]).length;
    document.getElementById("dash-check-count").textContent = `${done}/${checklistItems.length}`;
    document.getElementById("group-checklist").innerHTML = checklistItems.map(([key, label]) => `
      <div class="prop-item ${dashboard.checklist[key] ? "done" : ""}">
        <input type="checkbox" class="prop-cb" ${dashboard.checklist[key] ? "checked" : ""} onchange="toggleGroupCheck('${key}', this.checked)">
        <div class="prop-text">${esc(label)}</div>
      </div>`).join("");
  }

  window.toggleGroupCheck = async function (key, done) {
    dashboard = await rpc("set_group_checklist", { p_group_id: dashboard.group.id, p_item_key: key, p_done: done, p_password: dashboardPassword });
    renderGroupChecklist();
  };

  window.downloadProposalTemplate = async function () {
    if (!dashboard) return;
    await window.downloadProposalDocx(dashboard.group, bootstrap.section, dashboard.members);
  };

  async function init() {
    if (!isConfigured) {
      showSetupNotice();
      return;
    }
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    try {
      await loadBootstrap();
    } catch (err) {
      const msg = document.createElement("div");
      msg.className = "card";
      msg.innerHTML = `<div class="badge badge-red">Supabase error</div><div class="card-value">${esc(err.message)}</div>`;
      document.querySelector(".wrap").insertBefore(msg, document.querySelector(".wrap").children[2]);
    }
  }

  init();
})();