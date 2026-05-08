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

  function isAspFinalized() {
    return Boolean(bootstrap?.section?.aspFinalized || dashboard?.group?.aspFinalized);
  }

  function renderFinalizedNotice() {
    let notice = document.getElementById("asp-finalized-notice");
    if (!notice) {
      notice = document.createElement("div");
      notice.id = "asp-finalized-notice";
      notice.className = "card";
      notice.style.borderColor = "rgba(185,28,28,0.2)";
      notice.style.display = "none";
      const top = document.querySelector(".top");
      if (top && top.parentNode) {
        top.parentNode.insertBefore(notice, top.nextSibling);
      }
    }
    if (!notice) return;
    if (isAspFinalized()) {
      notice.innerHTML = `<div class="label" style="margin-top:0;color:var(--red);">Finalized</div><div style="font-weight:700;margin-bottom:4px;">Groups and titles have been finalized.</div><div class="muted">This dashboard is now read-only for students.</div>`;
      notice.style.display = "block";
    } else {
      notice.style.display = "none";
    }
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
    renderFinalizedNotice();
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
    const maxMem = group.maxMembers || bootstrap.section.maxMembers;
    document.getElementById("page-title").textContent = `${group.name} Dashboard`;
    document.getElementById("page-meta").textContent = `${group.projectTitle} · ${dashboard.members.length}/${maxMem} members`;
    document.getElementById("member-count").textContent = `${dashboard.members.length}/${maxMem}`;
    document.getElementById("title-num").textContent = String(group.projectTitleId).padStart(2, "0");
    document.getElementById("member-search").disabled = isAspFinalized();

    const fields = (group.projectFields || []);
    document.getElementById("title-card").innerHTML = `
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:6px;">Project Title</div>
      <div style="font-size:18px;font-weight:700;margin-bottom:8px;">${esc(group.projectTitle)}</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:12px;line-height:1.6;">${esc(group.projectDescription || "")}</div>
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:6px;">Suggested Fields</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${fields.map(f => `<span style="font-size:12px;padding:3px 10px;border-radius:4px;background:var(--surface2);border:1px solid var(--border);color:var(--text);">${esc(f)}</span>`).join("")}
      </div>`;

    renderMembers(maxMem);
    renderGroupChecklist();
    renderFinalizedNotice();
  }

  function renderMembers(maxMem) {
    const max = maxMem || (dashboard.group.maxMembers || bootstrap.section.maxMembers);
    const box = document.getElementById("current-members");
    box.innerHTML = dashboard.members.map(m => `
      <div class="row">
        <span>${esc(m.fullName)}</span>
        <button class="btn btn-small" ${isAspFinalized() ? "disabled" : ""} onclick="removeMember('${m.id}')">Remove</button>
      </div>`).join("") || '<p class="muted">No members yet. Search the roster to add members.</p>';
  }

  window.renderMemberSearch = async function () {
    if (!dashboard) return;
    if (isAspFinalized()) {
      document.getElementById("member-results").innerHTML = '<p class="muted">Groups and titles have been finalized for this section.</p>';
      return;
    }
    const q = document.getElementById("member-search").value.trim();
    const students = await rpc("search_section_students", {
      p_group_id: dashboard.group.id,
      p_password: dashboardPassword,
      p_query: q
    });
    document.getElementById("member-results").innerHTML = students.map(s => {
      const inGroup = dashboard.members.some(m => m.id === s.id);
      const maxMem = dashboard.group.maxMembers || bootstrap.section.maxMembers;
      const disabled = isAspFinalized() || Boolean(s.assignedGroup) || inGroup || dashboard.members.length >= maxMem;
      const label = s.assignedGroup ? `In ${s.assignedGroup}` : inGroup ? "Added" : "Add";
      return `<div class="row ${disabled ? "disabled" : ""}">
        <span>${esc(s.fullName)}</span>
        <button class="btn btn-small" ${disabled ? "disabled" : ""} onclick="addMember('${s.id}')">${esc(label)}</button>
      </div>`;
    }).join("") || '<p class="muted">No matching students.</p>';
  };

  window.addMember = async function (studentId) {
    try {
      if (isAspFinalized()) throw new Error("Groups and titles have been finalized for this section");
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
      if (isAspFinalized()) throw new Error("Groups and titles have been finalized for this section");
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
        <input type="checkbox" class="prop-cb" ${dashboard.checklist[key] ? "checked" : ""} ${isAspFinalized() ? "disabled" : ""} onchange="toggleGroupCheck('${key}', this.checked)">
        <div class="prop-text">${esc(label)}</div>
      </div>`).join("");
  }

  window.toggleGroupCheck = async function (key, done) {
    try {
      if (isAspFinalized()) throw new Error("Groups and titles have been finalized for this section");
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

  window.downloadProposalTemplate = async function () {
    if (!dashboard) return;
    await window.downloadProposalDocx(dashboard.group, bootstrap.section, dashboard.members);
  };

  window.downloadDocumentationTemplate = async function () {
    if (!dashboard) return;
    await window.downloadAspDocx(dashboard.group, bootstrap.section, dashboard.members);
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
