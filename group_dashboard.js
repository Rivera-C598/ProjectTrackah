(function () {
  const cfg = window.ASP_FINAL_PROJECT_CONFIG || {};
  const params = new URLSearchParams(location.search);
  const sectionSlug = params.get("section") || cfg.defaultSectionSlug || "bsit-2a";
  const codeFromUrl = params.get("code") || "";
  const isConfigured = cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes("YOUR-");
  const client = isConfigured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  let bootstrap = null;
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
    document.getElementById("login-status").textContent = message || "";
  }

  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function loadBootstrap() {
    bootstrap = await rpc("bootstrap_section", { p_section_slug: sectionSlug });
    document.getElementById("page-meta").textContent = `Section: ${bootstrap.section.name}`;
    document.getElementById("student-link").href = `aspnet_student_view.html?section=${encodeURIComponent(sectionSlug)}`;
  }

  window.loginDashboard = async function () {
    try {
      if (!client) {
        setStatus("Supabase is not configured. Update supabase-config.js first.");
        return;
      }
      const code = document.getElementById("group-code").value.trim();
      dashboardPassword = document.getElementById("group-password").value;
      setStatus("Opening dashboard...");
      dashboard = await rpc("login_group", {
        p_section_slug: sectionSlug,
        p_code: code,
        p_password: dashboardPassword
      });
      sessionStorage.setItem(`aspdash:${sectionSlug}:code`, code);
      sessionStorage.setItem(`aspdash:${sectionSlug}:password`, dashboardPassword);
      document.getElementById("login-card").style.display = "none";
      document.getElementById("dashboard-area").style.display = "block";
      renderDashboard();
      await window.renderMemberSearch();
      setStatus("");
    } catch (err) {
      setStatus(err.message || "Code or password did not match.");
    }
  };

  window.showTab = function (name) {
    ["members", "tracker", "template"].forEach(tab => {
      document.getElementById("tab-" + tab).classList.toggle("show", tab === name);
    });
  };

  function renderDashboard() {
    const group = dashboard.group;
    document.getElementById("page-title").textContent = `${group.name} Dashboard`;
    document.getElementById("page-meta").textContent = `${group.projectTitle} · ${dashboard.members.length}/${bootstrap.section.maxMembers} members`;
    document.getElementById("member-count").textContent = dashboard.members.length;
    document.getElementById("title-num").textContent = String(group.projectTitleId).padStart(2, "0");
    renderMembers();
    renderGroupChecklist();
  }

  function renderMembers() {
    const box = document.getElementById("current-members");
    box.innerHTML = dashboard.members.map(m => `
      <div class="row">
        <span>${esc(m.fullName)}</span>
        <button class="btn btn-small" onclick="removeMember('${m.id}')">Remove</button>
      </div>`).join("") || '<p class="muted">No members yet. Search the roster to add members.</p>';
  }

  window.renderMemberSearch = async function () {
    if (!dashboard) return;
    const q = document.getElementById("member-search").value.trim();
    const students = await rpc("search_section_students", {
      p_group_id: dashboard.group.id,
      p_password: dashboardPassword,
      p_query: q
    });
    document.getElementById("member-results").innerHTML = students.map(s => {
      const inGroup = dashboard.members.some(m => m.id === s.id);
      const disabled = Boolean(s.assignedGroup) || inGroup || dashboard.members.length >= bootstrap.section.maxMembers;
      const label = s.assignedGroup ? `In ${s.assignedGroup}` : inGroup ? "Added" : "Add";
      return `<div class="row ${disabled ? "disabled" : ""}">
        <span>${esc(s.fullName)}</span>
        <button class="btn btn-small" ${disabled ? "disabled" : ""} onclick="addMember('${s.id}')">${esc(label)}</button>
      </div>`;
    }).join("") || '<p class="muted">No matching students.</p>';
  };

  window.addMember = async function (studentId) {
    try {
      dashboard = await rpc("add_group_member", {
        p_group_id: dashboard.group.id,
        p_student_id: studentId,
        p_password: dashboardPassword
      });
      renderDashboard();
      await window.renderMemberSearch();
    } catch (err) {
      alert(err.message || "Could not add member.");
    }
  };

  window.removeMember = async function (studentId) {
    try {
      dashboard = await rpc("remove_group_member", {
        p_group_id: dashboard.group.id,
        p_student_id: studentId,
        p_password: dashboardPassword
      });
      renderDashboard();
      await window.renderMemberSearch();
    } catch (err) {
      alert(err.message || "Could not remove member.");
    }
  };

  function renderGroupChecklist() {
    const done = checklistItems.filter(([key]) => dashboard.checklist[key]).length;
    document.getElementById("check-count").textContent = `${done}/${checklistItems.length}`;
    document.getElementById("group-checklist").innerHTML = checklistItems.map(([key, label]) => `
      <div class="prop-item ${dashboard.checklist[key] ? "done" : ""}">
        <input type="checkbox" class="prop-cb" ${dashboard.checklist[key] ? "checked" : ""} onchange="toggleGroupCheck('${key}', this.checked)">
        <div class="prop-text">${esc(label)}</div>
      </div>`).join("");
  }

  window.toggleGroupCheck = async function (key, done) {
    try {
      dashboard = await rpc("set_group_checklist", {
        p_group_id: dashboard.group.id,
        p_item_key: key,
        p_done: done,
        p_password: dashboardPassword
      });
      renderGroupChecklist();
    } catch (err) {
      alert(err.message || "Could not update checklist.");
    }
  };

  window.downloadProposalTemplate = function () {
    if (!dashboard) return;
    const group = dashboard.group;
    const content = [
      "ASP.NET MVC Final Project Proposal",
      "",
      `Section: ${bootstrap.section.name}`,
      `Group: ${group.name}`,
      `Project Title: ${group.projectTitle}`,
      `Members: ${dashboard.members.map(m => m.fullName).join(", ")}`,
      "",
      "1. Purpose of the Application:",
      "",
      "2. Target Users:",
      "",
      "3. Planned Database Table and Fields:",
      group.projectFields.map(f => `- ${f}`).join("\n"),
      "",
      "4. CRUD Features:",
      "- Create:",
      "- Read:",
      "- Update:",
      "- Delete:",
      "",
      "5. Validation Rules:",
      "",
      "6. Member Roles:",
      "",
      "7. Checkpoint Notes:"
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${group.name.replace(/\s+/g, "_")}_proposal_template.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  async function init() {
    document.getElementById("group-code").value = codeFromUrl || sessionStorage.getItem(`aspdash:${sectionSlug}:code`) || "";
    document.getElementById("group-password").value = sessionStorage.getItem(`aspdash:${sectionSlug}:password`) || "";
    if (!client) {
      setStatus("Supabase is not configured. Update supabase-config.js first.");
      return;
    }
    try {
      await loadBootstrap();
      if (document.getElementById("group-code").value && document.getElementById("group-password").value) {
        await window.loginDashboard();
      }
    } catch (err) {
      setStatus(err.message || "Could not load dashboard.");
    }
  }

  init();
})();
