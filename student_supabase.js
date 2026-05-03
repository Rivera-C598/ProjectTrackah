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
    document.getElementById("dashboard-meta").textContent = `${group.projectTitle} · ${dashboard.members.length}/${bootstrap.section.maxMembers} members`;
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

  window.downloadProposalTemplate = function () {
    if (!dashboard) return;
    const group = dashboard.group;
    const section = bootstrap.section;
    const members = dashboard.members;
    const fields = group.projectFields || [];

    const memberRows = members.map(m => `
      <tr>
        <td class="e">${esc(m.fullName)}</td>
        <td class="e" contenteditable="true">Click to type role...</td>
        <td class="e" contenteditable="true">Click to describe contribution...</td>
      </tr>`).join("");

    const fieldRows = fields.map(f => `
      <tr>
        <td>${esc(f)}</td>
        <td class="e" contenteditable="true">e.g. nvarchar(100)</td>
        <td class="e" contenteditable="true">e.g. Required, max 100 chars</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(group.name)} — Project Proposal &amp; Documentation</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; font-size: 13px; color: #1a1917; background: #fff; padding: 0; }
  .page { max-width: 800px; margin: 0 auto; padding: 3rem 3.5rem; }
  h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 4px; }
  h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #1a4ed8; margin: 2rem 0 0.6rem; padding-bottom: 6px; border-bottom: 2px solid #1a4ed8; }
  h3 { font-size: 12px; font-weight: 600; margin: 1rem 0 0.4rem; color: #444; }
  p, li { line-height: 1.65; color: #333; }
  .cover { border-bottom: 3px solid #1a4ed8; padding-bottom: 1.5rem; margin-bottom: 0.5rem; }
  .cover-sub { font-size: 12px; color: #7a7772; margin-top: 6px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 2rem; margin-top: 1.25rem; }
  .meta-item label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #7a7772; display: block; margin-bottom: 2px; }
  .meta-item span { font-size: 13px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; font-size: 12px; }
  th { background: #f0eee9; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; color: #7a7772; padding: 7px 10px; text-align: left; border: 1px solid #ddd; }
  td { padding: 7px 10px; border: 1px solid #ddd; vertical-align: top; }
  td.e { color: #aaa; font-style: italic; }
  td.e:focus, td.e:not(:empty) { color: #1a1917; font-style: normal; outline: 2px solid #1a4ed8; outline-offset: -1px; }
  .block { background: #f8f7f5; border: 1px solid #e5e3de; border-radius: 6px; padding: 0.75rem 1rem; min-height: 70px; margin-top: 0.5rem; font-size: 13px; color: #aaa; font-style: italic; }
  .block:focus, .block:not(:empty) { color: #1a1917; font-style: normal; outline: 2px solid #1a4ed8; }
  .cp-block { border: 1px solid #e5e3de; border-radius: 6px; padding: 0.75rem 1rem; margin-bottom: 0.6rem; }
  .cp-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .cp-label { font-weight: 700; font-size: 12px; }
  .cp-status { font-size: 11px; font-weight: 600; padding: 2px 10px; border-radius: 4px; background: #f0eee9; color: #7a7772; cursor: default; }
  .note-box { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px; padding: 0.6rem 0.9rem; font-size: 12px; color: #92400e; margin-top: 0.5rem; }
  .print-hint { font-size: 11px; color: #7a7772; text-align: center; margin-bottom: 1.5rem; padding: 0.5rem; background: #f0eee9; border-radius: 6px; }
  @media print {
    .print-hint { display: none; }
    td.e, .block { outline: none !important; }
    body { padding: 0; }
    .page { padding: 1.5rem 2rem; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="print-hint">&#9998; Click any greyed field to type. When done: File &rarr; Print &rarr; Save as PDF.</div>

  <div class="cover">
    <h1>ASP.NET MVC Final Project</h1>
    <div class="cover-sub">Proposal &amp; Documentation</div>
    <div class="meta-grid">
      <div class="meta-item"><label>Section</label><span>${esc(section.name)}</span></div>
      <div class="meta-item"><label>Group</label><span>${esc(group.name)}</span></div>
      <div class="meta-item"><label>Project Title</label><span>${esc(group.projectTitle)}</span></div>
      <div class="meta-item"><label>Date Submitted</label><span contenteditable="true" style="font-weight:600;display:block;">Click to set date...</span></div>
    </div>
  </div>

  <h2>1. Group Members</h2>
  <table>
    <thead><tr><th>Full Name</th><th>Role</th><th>Contribution</th></tr></thead>
    <tbody>${memberRows || '<tr><td colspan="3" class="e">No members added yet.</td></tr>'}</tbody>
  </table>

  <h2>2. Project Overview</h2>
  <h3>Purpose of the Application</h3>
  <div class="block" contenteditable="true">Describe what the system does and what problem it solves...</div>
  <h3>Target Users</h3>
  <div class="block" contenteditable="true">Who will use this system? e.g. school administrators, store owners, clinic staff...</div>

  <h2>3. Database Design</h2>
  <h3>Main Table: <span contenteditable="true" style="font-weight:400;font-style:italic;">Click to type table name...</span></h3>
  <table>
    <thead><tr><th>Field Name</th><th>Data Type</th><th>Validation / Notes</th></tr></thead>
    <tbody>
      ${fieldRows}
      <tr><td class="e" contenteditable="true">Add field...</td><td class="e" contenteditable="true"></td><td class="e" contenteditable="true"></td></tr>
    </tbody>
  </table>
  <h3>Second Table (if applicable)</h3>
  <table>
    <thead><tr><th>Field Name</th><th>Data Type</th><th>Validation / Notes</th></tr></thead>
    <tbody>
      <tr><td class="e" contenteditable="true">Add field...</td><td class="e" contenteditable="true"></td><td class="e" contenteditable="true"></td></tr>
      <tr><td class="e" contenteditable="true">Add field...</td><td class="e" contenteditable="true"></td><td class="e" contenteditable="true"></td></tr>
    </tbody>
  </table>

  <h2>4. CRUD Features</h2>
  <table>
    <thead><tr><th style="width:100px;">Operation</th><th>Description</th><th>Page / View</th></tr></thead>
    <tbody>
      <tr><td><strong>Create</strong></td><td class="e" contenteditable="true">What does adding a record do in your system?</td><td class="e" contenteditable="true">e.g. Create.cshtml</td></tr>
      <tr><td><strong>Read</strong></td><td class="e" contenteditable="true">What records are displayed and where?</td><td class="e" contenteditable="true">e.g. Index.cshtml</td></tr>
      <tr><td><strong>Update</strong></td><td class="e" contenteditable="true">What can be edited and how?</td><td class="e" contenteditable="true">e.g. Edit.cshtml</td></tr>
      <tr><td><strong>Delete</strong></td><td class="e" contenteditable="true">What happens when a record is deleted?</td><td class="e" contenteditable="true">e.g. Delete.cshtml</td></tr>
    </tbody>
  </table>

  <h2>5. Validation Rules</h2>
  <table>
    <thead><tr><th>Field</th><th>Rule</th></tr></thead>
    <tbody>
      ${fields.map(f => `<tr><td>${esc(f)}</td><td class="e" contenteditable="true">e.g. Required, cannot be empty</td></tr>`).join("")}
      <tr><td class="e" contenteditable="true">Add field...</td><td class="e" contenteditable="true"></td></tr>
    </tbody>
  </table>

  <h2>6. Planned Pages &amp; Views</h2>
  <table>
    <thead><tr><th>Page / View</th><th>Purpose</th></tr></thead>
    <tbody>
      <tr><td>Home / Index</td><td class="e" contenteditable="true">Describe what the home page shows...</td></tr>
      <tr><td>List / Index View</td><td class="e" contenteditable="true">Displays all records in a table</td></tr>
      <tr><td>Create View</td><td class="e" contenteditable="true">Form for adding a new record</td></tr>
      <tr><td>Edit View</td><td class="e" contenteditable="true">Form for editing an existing record</td></tr>
      <tr><td>Delete View</td><td class="e" contenteditable="true">Confirmation before deleting a record</td></tr>
      <tr><td class="e" contenteditable="true">Add page...</td><td class="e" contenteditable="true"></td></tr>
    </tbody>
  </table>

  <h2>7. Checkpoint Progress</h2>

  <div class="cp-block">
    <div class="cp-head">
      <span class="cp-label">CP 1 &mdash; Project Proposal</span>
      <span class="cp-status" contenteditable="true">Pending</span>
    </div>
    <div class="block" contenteditable="true" style="min-height:50px;">Notes about proposal submission...</div>
  </div>

  <div class="cp-block">
    <div class="cp-head">
      <span class="cp-label">CP 2 &mdash; Database &amp; Model</span>
      <span class="cp-status" contenteditable="true">Pending</span>
    </div>
    <div class="block" contenteditable="true" style="min-height:50px;">Notes about database setup, model class, and validation attributes...</div>
  </div>

  <div class="cp-block">
    <div class="cp-head">
      <span class="cp-label">CP 3 &mdash; Create &amp; Read</span>
      <span class="cp-status" contenteditable="true">Pending</span>
    </div>
    <div class="block" contenteditable="true" style="min-height:50px;">Notes about working Create form and Index/List view...</div>
  </div>

  <div class="cp-block">
    <div class="cp-head">
      <span class="cp-label">CP 4 &mdash; Update &amp; Delete</span>
      <span class="cp-status" contenteditable="true">Pending</span>
    </div>
    <div class="block" contenteditable="true" style="min-height:50px;">Notes about Edit and Delete functionality...</div>
  </div>

  <div class="cp-block">
    <div class="cp-head">
      <span class="cp-label">Final &mdash; Presentation &amp; Demo</span>
      <span class="cp-status" contenteditable="true">Pending</span>
    </div>
    <div class="block" contenteditable="true" style="min-height:50px;">Notes about final demo, live database records, each member's part...</div>
  </div>

  <h2>8. Screenshots</h2>
  <div class="note-box">Paste screenshots here when printing to PDF, or attach separately. Include: Home page, List view, Create form, Edit form, Delete confirmation, and at least one validation error.</div>

  <h2>9. Technical Notes &amp; Challenges</h2>
  <div class="block" contenteditable="true">Describe any technical decisions, problems encountered, or things your group learned during development...</div>

</div>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${group.name.replace(/\s+/g, "_")}_proposal_and_docs.html`;
    link.click();
    URL.revokeObjectURL(url);
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
